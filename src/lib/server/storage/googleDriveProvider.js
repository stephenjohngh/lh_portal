// src/lib/server/storage/googleDriveProvider.js
// Google Drive storage provider implementation.
//
// Supports two authentication modes (auto-detected from env vars):
//
//   OAuth2 mode  (recommended for personal / basic Workspace accounts)
//     GOOGLE_OAUTH_CLIENT_ID      OAuth2 client ID   (type: Web application)
//     GOOGLE_OAUTH_CLIENT_SECRET  OAuth2 client secret
//     GOOGLE_OAUTH_REFRESH_TOKEN  Offline refresh token (obtained once via OAuth Playground)
//     GOOGLE_DRIVE_ROOT_FOLDER_ID Root folder ID in the authorising user's My Drive
//
//   Service account mode  (requires Google Workspace Business Standard+ for Shared Drives)
//     GOOGLE_DRIVE_CLIENT_EMAIL   Service account email
//     GOOGLE_DRIVE_PRIVATE_KEY    Service account private key (literal \n line breaks)
//     GOOGLE_DRIVE_ROOT_FOLDER_ID Root folder ID inside a Shared Drive
//
// OAuth2 mode takes priority when GOOGLE_OAUTH_REFRESH_TOKEN is set.
// Service account mode is used as fallback.
//
// See docs/ops/google_drive_storage_setup.md for setup instructions.

import { google }  from 'googleapis';
import { Readable } from 'stream';
import { getLogger } from '$lib/utils/logger';
// $env/dynamic/private reads from process.env at runtime — variables do not
// need to be defined at build time.  This is intentional: service account
// vars (GOOGLE_DRIVE_CLIENT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY) are optional
// and only needed if OAuth2 vars are absent.  Using $env/static/private would
// require all six to be set in every deployment environment, causing build
// failures on installations that only use OAuth2 mode.
import { env } from '$env/dynamic/private';

const logger = getLogger('GoogleDriveProvider');

// ── Resolved env values ────────────────────────────────────────────────────
const _rootFolderId  = env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? '';
const _oauthId       = env.GOOGLE_OAUTH_CLIENT_ID      ?? '';
const _oauthSecret   = env.GOOGLE_OAUTH_CLIENT_SECRET  ?? '';
const _oauthRefresh  = env.GOOGLE_OAUTH_REFRESH_TOKEN  ?? '';
const _saEmail       = env.GOOGLE_DRIVE_CLIENT_EMAIL   ?? '';
const _saKey         = (env.GOOGLE_DRIVE_PRIVATE_KEY   ?? '').replace(/\\n/g, '\n');

// ⛔ The delete guard (2026-09-23). Dev and prod share ONE Drive account; the
// dev server only points its UPLOADS at a separate folder. A refreshed dev
// holds prod's rows, whose file ids are prod's real files, and a delete goes by
// absolute id. So on a server with this set to 'true', a delete is REFUSED
// unless the file sits inside this server's own GOOGLE_DRIVE_ROOT_FOLDER_ID.
// Set in .env.devdb. Left off on prod, where every legitimate delete is a prod
// file and an extra Drive lookup per delete buys nothing.
const _deleteWithinRootOnly =
  String(env.STORAGE_DELETE_WITHIN_ROOT_ONLY ?? '').toLowerCase() === 'true';

// Log warnings at startup so missing vars surface immediately.
if (!_rootFolderId) {
  logger('⚠️  GOOGLE_DRIVE_ROOT_FOLDER_ID not set — ensurePath() will fail at runtime');
}
if (!_oauthRefresh && (!_saEmail || !_saKey)) {
  logger('⚠️  No Drive credentials found — set GOOGLE_OAUTH_REFRESH_TOKEN (OAuth2) or GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY (service account)');
}
// Both configured is not an error, but it IS a trap: OAuth wins, so a perfectly
// good service account sits unused while a stale OAuth client fails every call.
if (_oauthId && _oauthSecret && _oauthRefresh && _saEmail && _saKey) {
  console.warn('[GoogleDrive] both OAuth2 and service-account credentials are set — '
    + 'OAuth2 takes precedence and the service account will NOT be used');
}

// ── Drive client singleton ─────────────────────────────────────────────────
let _drive = null;

/** @returns {import('googleapis').drive_v3.Drive} */
function getDrive() {
  if (_drive) return _drive;

  if (_oauthId && _oauthSecret && _oauthRefresh) {
    // ── OAuth2 mode ──────────────────────────────────────────────────────
    // Authenticates as a real Google user; files use that user's Drive quota
    // and land in their My Drive. Works with personal accounts and basic
    // Google Workspace (no Shared Drive / Business Standard required).
    // The refresh token never expires unless revoked.
    const oauth2 = new google.auth.OAuth2(_oauthId, _oauthSecret);
    oauth2.setCredentials({ refresh_token: _oauthRefresh });
    _drive = google.drive({ version: 'v3', auth: oauth2 });
    // console.info, not the debug logger: `logger` is namespaced and silent
    // unless DEBUG is set, so which credentials a deployment actually picked
    // was invisible exactly when it mattered. Two deployments differing only in
    // this took a day to find, because OAuth SILENTLY WINS over a service
    // account when both are configured — so a correct service account can be
    // present and never used. The client id is logged (it is not a secret) so
    // two environments can be compared without guessing.
    console.info('[GoogleDrive] OAuth2 mode, client', _oauthId.slice(0, 24));

  } else if (_saEmail && _saKey) {
    // ── Service account mode ─────────────────────────────────────────────
    // Requires the root folder to be a Shared Drive (Google Workspace
    // Business Standard+). Service accounts have no personal Drive quota.
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: _saEmail, private_key: _saKey },
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    _drive = google.drive({ version: 'v3', auth });
    console.info('[GoogleDrive] service account mode,', _saEmail);

  } else {
    throw new Error(
      'Google Drive credentials not configured. ' +
      'Set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN ' +
      '(OAuth2 mode), or GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY (service account mode).',
    );
  }
  return _drive;
}

const FILE_FIELDS = 'id,name,mimeType,size,webViewLink,thumbnailLink,createdTime,modifiedTime';

function mapFile(f) {
  return {
    fileId:       f.id,
    name:         f.name,
    mimeType:     f.mimeType,
    size:         parseInt(f.size ?? '0', 10),
    webViewUrl:   f.webViewLink   ?? null,
    thumbnailUrl: f.thumbnailLink ?? null,
    createdAt:    f.createdTime   ?? null,
    modifiedAt:   f.modifiedTime  ?? null,
    isFolder:     f.mimeType === 'application/vnd.google-apps.folder',
  };
}

/**
 * Is `fileId` inside the folder `rootId`, at any depth?
 *
 * Walks UP through each item's parents until it meets the root, runs out of
 * parents, or gives up at `maxDepth`. Pure apart from `getParents`, which is
 * injected so the rule can be tested without Drive.
 *
 * ⚠ Fails CLOSED: anything it cannot prove is inside the root — no parents, a
 * lookup error, a cycle, or too deep — answers false, and the delete is
 * refused. For a guard whose only job is stopping the destruction of prod
 * files, "could not tell" must mean "do not delete".
 *
 * @param {string} fileId
 * @param {string} rootId
 * @param {(id: string) => Promise<string[]>} getParents
 * @param {number} [maxDepth]
 * @returns {Promise<boolean>}
 */
export async function isWithinFolder(fileId, rootId, getParents, maxDepth = 25) {
  if (!fileId || !rootId) return false;
  if (fileId === rootId) return false;          // never delete the root itself
  const seen = new Set();
  let frontier = [fileId];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    /** @type {string[]} */
    const next = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      let parents;
      try { parents = await getParents(id); } catch { return false; }
      for (const p of parents ?? []) {
        if (p === rootId) return true;
        next.push(p);
      }
    }
    frontier = next;
  }
  return false;
}

/**
 * Read one header regardless of the shape the HTTP client handed back:
 * a fetch-style `Headers`, or a plain object with unpredictable key casing.
 * @returns {string|undefined}
 */
export function readHeader(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name) ?? undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return undefined;
}

/** @type {import('./storageProvider.js').StorageProvider} */
export const googleDriveProvider = {
  name: 'google_drive',

  async uploadFile(buffer, filename, mimeType, folderId, _metadata = {}) {
    const drive  = getDrive();
    const stream = Readable.from(buffer);

    logger('Uploading to Drive folder:', folderId, '—', filename);
    const res = await drive.files.create({
      // supportsAllDrives is required when the target folder is inside a
      // Shared Drive (Google Workspace Team Drive).  Service accounts do not
      // have personal Drive storage quota and MUST use a Shared Drive.
      supportsAllDrives: true,
      requestBody: { name: filename, parents: [folderId] },
      media:       { mimeType, body: stream },
      fields:      FILE_FIELDS,
    });

    // Grant "anyone with the link can view" so web_view_url works without Google login.
    // supportsAllDrives is required here too — permissions on Shared Drive files
    // fail without it.
    await drive.permissions.create({
      supportsAllDrives: true,
      fileId:      res.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    // Return a direct-view URL so <img src={url}> renders the image bytes,
    // not Google Drive's HTML viewer page.
    // webViewLink  = https://drive.google.com/file/d/ID/view  (HTML viewer — not embeddable)
    // uc?export=view = https://drive.google.com/uc?export=view&id=ID  (raw image bytes — embeddable)
    const fileId = res.data.id;
    return {
      fileId,
      folderId,
      webViewUrl:   `https://drive.google.com/uc?export=view&id=${fileId}`,
      thumbnailUrl: `https://drive.google.com/uc?export=view&id=${fileId}`,
    };
  },

  async getFileUrl(fileId) {
    const drive = getDrive();
    const res   = await drive.files.get({ fileId, supportsAllDrives: true, fields: 'webViewLink' });
    return res.data.webViewLink ?? '';
  },

  async getFileMetadata(fileId) {
    const drive = getDrive();
    const res   = await drive.files.get({ fileId, supportsAllDrives: true, fields: FILE_FIELDS });
    return mapFile(res.data);
  },

  async deleteFile(fileId) {
    const drive = getDrive();
    if (_deleteWithinRootOnly) {
      const inside = await isWithinFolder(fileId, _rootFolderId, async (id) => {
        const res = await drive.files.get({ fileId: id, supportsAllDrives: true, fields: 'parents' });
        return res.data.parents ?? [];
      });
      if (!inside) {
        // Thrown, not skipped: the caller must know the file is still there, so
        // a document row is not removed as though its file had gone.
        throw new Error(
          'Delete refused: this file is outside this server’s Drive folder. On a copy of '
          + 'production data it is probably a PRODUCTION file, so it has been left alone '
          + '(STORAGE_DELETE_WITHIN_ROOT_ONLY).',
        );
      }
    }
    await drive.files.delete({ fileId, supportsAllDrives: true });
    logger('Deleted Drive file:', fileId);
  },

  async listFiles(folderId, opts = {}) {
    const drive = getDrive();
    const clauses = [`'${folderId}' in parents`, 'trashed = false'];
    if (opts.foldersOnly) clauses.push(`mimeType = 'application/vnd.google-apps.folder'`);
    else if (opts.mimeType) clauses.push(`mimeType = '${opts.mimeType}'`);
    if (opts.query) clauses.push(`name contains '${opts.query}'`);

    const res = await drive.files.list({
      supportsAllDrives:         true,
      includeItemsFromAllDrives: true,
      q:       clauses.join(' and '),
      fields:  `files(${FILE_FIELDS})`,
      orderBy: 'createdTime desc',
      pageSize: opts.limit ?? 100,
    });
    return (res.data.files ?? []).map(mapFile);
  },

  async createFolder(name, parentId) {
    const drive = getDrive();
    const res   = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents:  parentId ? [parentId] : [],
      },
      fields: 'id',
    });
    logger('Created Drive folder:', name, 'under', parentId);
    return res.data.id;
  },

  async getOrCreateFolder(name, parentId) {
    const drive   = getDrive();
    const clauses = [
      `name = '${name.replace(/'/g, "\\'")}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      'trashed = false',
    ];
    if (parentId) clauses.push(`'${parentId}' in parents`);

    const res = await drive.files.list({
      supportsAllDrives:         true,
      includeItemsFromAllDrives: true,
      q:      clauses.join(' and '),
      fields: 'files(id)',
      pageSize: 1,
    });
    if (res.data.files?.length) return res.data.files[0].id;
    return this.createFolder(name, parentId);
  },

  async ensurePath(segments) {
    if (!_rootFolderId) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID is not set.');
    let current = _rootFolderId;
    for (const segment of segments) {
      current = await this.getOrCreateFolder(segment, current);
    }
    return current;
  },

  async moveFile(fileId, newFolderId) {
    const drive = getDrive();
    const meta  = await drive.files.get({ fileId, supportsAllDrives: true, fields: 'parents' });
    const previousParents = (meta.data.parents ?? []).join(',');
    await drive.files.update({
      fileId,
      supportsAllDrives: true,
      addParents:    newFolderId,
      removeParents: previousParents,
      fields:        'id,parents',
    });
  },

  async getFileStream(fileId) {
    const drive = getDrive();
    // responseType: 'arraybuffer' makes gaxios/axios return the raw bytes.
    // The second argument is passed through to the underlying HTTP client.
    const res = await drive.files.get(
      { fileId, supportsAllDrives: true, alt: 'media' },
      { responseType: 'arraybuffer' },
    );

    // The response header is the best source, but gaxios has returned headers
    // as both a plain object and a fetch-style Headers across versions, so read
    // it defensively. Falling back to Drive's own stored mimeType costs one
    // extra call and only on the path where the header is unreadable.
    //
    // ⚠ This previously defaulted to 'image/jpeg', which silently mislabelled
    // every non-image: a PDF was served as a JPEG, so browsers refused it with
    // "the image cannot be displayed". Images worked only by coincidence. Never
    // guess a type here — an honest octet-stream downloads, a wrong type breaks.
    // The whole mime determination is best-effort: the bytes are already in
    // hand, so nothing here may be allowed to fail the fetch.
    let mimeType;
    try {
      mimeType = readHeader(res.headers, 'content-type');
      if (!mimeType) {
        const meta = await drive.files.get({
          fileId, supportsAllDrives: true, fields: 'mimeType',
        });
        mimeType = meta?.data?.mimeType;
      }
    } catch (err) {
      logger('⚠ could not determine mime type for', fileId, '—', err?.message);
    }

    return {
      data:     Buffer.from(res.data),
      mimeType: (mimeType || 'application/octet-stream').split(';')[0].trim(),
    };
  },

  async searchFiles(query, _rootId) {
    const drive = getDrive();
    const res   = await drive.files.list({
      supportsAllDrives:         true,
      includeItemsFromAllDrives: true,
      q:       `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
      fields:  `files(${FILE_FIELDS})`,
      orderBy: 'modifiedTime desc',
      pageSize: 50,
    });
    return (res.data.files ?? []).map(mapFile);
  },
};
