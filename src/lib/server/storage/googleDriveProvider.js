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
import { getLogger } from '#lib/utils/logger.js';
// $env/dynamic/private reads from process.env at runtime — variables do not
// need to be defined at build time.  This is intentional: service account
// vars (GOOGLE_DRIVE_CLIENT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY) are optional
// and only needed if OAuth2 vars are absent.  Using $env/static/private would
// require all six to be set in every deployment environment, causing build
// failures on installations that only use OAuth2 mode.
import { env } from '$env/dynamic/private';
import { folderKey } from './folderNames.js';

const logger = getLogger('GoogleDriveProvider');

// ── Resolved env values ────────────────────────────────────────────────────
const _rootFolderId  = env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? '';
const _oauthId       = env.GOOGLE_OAUTH_CLIENT_ID      ?? '';
const _oauthSecret   = env.GOOGLE_OAUTH_CLIENT_SECRET  ?? '';
const _oauthRefresh  = env.GOOGLE_OAUTH_REFRESH_TOKEN  ?? '';
const _saEmail       = env.GOOGLE_DRIVE_CLIENT_EMAIL   ?? '';
const _saKey         = (env.GOOGLE_DRIVE_PRIVATE_KEY   ?? '').replace(/\\n/g, '\n');

// ⛔ THE FOLDER GUARD — ON BY DEFAULT since the security review (2026-09-27).
// Every read, delete, move or lookup by file id is REFUSED unless the file sits
// inside this server's own GOOGLE_DRIVE_ROOT_FOLDER_ID.
//
// It began (2026-09-23) as a dev-only delete guard: dev and prod share one
// Drive account and a refreshed dev holds prod's file ids. It is now on
// everywhere, for reads too, because the credential can be a PERSON's Google
// account (OAuth mode), which reaches their whole Drive — and the portal must
// never serve or destroy a file that is not the portal's, whatever id a caller
// hands it. Switch off only deliberately: STORAGE_WITHIN_ROOT_ONLY=false (the
// older STORAGE_DELETE_WITHIN_ROOT_ONLY is still read).
// ⚠ A consequence on dev: files uploaded by PROD (outside dev's folder) no
// longer open on dev. That is the guard working.
const _withinRootOnly = !['false', '0', 'no', 'off'].includes(
  String(env.STORAGE_WITHIN_ROOT_ONLY ?? env.STORAGE_DELETE_WITHIN_ROOT_ONLY ?? 'true').trim().toLowerCase());

// Positive answers are remembered: a file inside the root stays inside it (the
// portal only moves files between folders inside it), so after the first
// photo in a folder the rest cost nothing. Bounded, and never a "no".
const _insideRoot = new Set();
const MAX_REMEMBERED = 20000;

/**
 * Throw unless `fileId` is inside this server's root folder (when the guard is
 * on). Thrown, not skipped: a caller must know the file was not touched.
 * @param {any} drive
 * @param {string} fileId
 * @param {string} action  e.g. 'Delete', 'Read'
 */
async function assertInsideRoot(drive, fileId, action) {
  if (!_withinRootOnly) return;
  if (!(await isInsideRoot(drive, fileId))) {
    throw new Error(
      `${action} refused: this file is outside this server’s Drive folder, and the portal `
      + 'only touches its own files (STORAGE_WITHIN_ROOT_ONLY).',
    );
  }
}

/**
 * Is `fileId` inside this server's root folder? Whatever the guard flag says —
 * used as-is where a "no" must never be overridden, such as binning a folder.
 * @param {any} drive
 * @param {string} fileId
 */
async function isInsideRoot(drive, fileId) {
  if (_insideRoot.has(fileId)) return true;
  /** @type {string[]} */
  const visited = [];
  const inside = await isWithinFolder(fileId, _rootFolderId, async (id) => {
    visited.push(id);
    if (_insideRoot.has(id)) return [_rootFolderId];     // a folder already known to be inside
    const res = await drive.files.get({ fileId: id, supportsAllDrives: true, fields: 'parents' });
    return res.data.parents ?? [];
  });
  if (inside) {
    // Drive files have a single parent, so everything walked is on the one path.
    if (_insideRoot.size > MAX_REMEMBERED) _insideRoot.clear();
    for (const id of visited) _insideRoot.add(id);
  }
  return inside;
}

/**
 * Did Drive answer "no such file"? The status only, never the message: a
 * wording match would turn some other failure into a silent "already deleted".
 * @param {any} err
 */
export function isNotFound(err) {
  return err?.response?.status === 404 || err?.status === 404 || Number(err?.code) === 404;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Every folder directly inside `parentId`. */
async function childFolders(drive, parentId) {
  /** @type {Array<{ id: string, name: string }>} */
  const out = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      supportsAllDrives: true, includeItemsFromAllDrives: true,
      q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 1000,
      pageToken,
    });
    out.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return out;
}

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

    // ⛔ NOT SHARED. Every upload used to be granted "anyone with the link can
    // view", so a file id alone fetched it straight from Google — no login, no
    // portal, for ever. Removed in the security review (2026-09-27): a file is
    // private to the Drive account, and people see it only through the portal's
    // proxy (/api/media/file/:id), which checks who is asking. Existing files
    // were un-shared by scripts/unshare-drive-files.mjs.
    //
    // The URL below is still the form the rest of the portal stores and
    // recognises (driveUtils.extractDriveFileId); the browser is sent to the
    // proxy for it, never to Google.
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
    await assertInsideRoot(drive, fileId, 'Read');
    const res   = await drive.files.get({ fileId, supportsAllDrives: true, fields: 'webViewLink' });
    return res.data.webViewLink ?? '';
  },

  async getFileMetadata(fileId) {
    const drive = getDrive();
    await assertInsideRoot(drive, fileId, 'Read');
    const res   = await drive.files.get({ fileId, supportsAllDrives: true, fields: FILE_FIELDS });
    return mapFile(res.data);
  },

  /**
   * What state a file is in, for a check that must change nothing (Admin →
   * Document Demo → Check files, 2026-09-27). Reads metadata only, never the
   * file: 'present' · 'in_bin' · 'missing' · 'outside_folder'.
   * ⚠ Only a real 404 is 'missing'; any other failure is thrown, so the check
   * says it could not tell rather than reporting a file gone that is not.
   * @param {string} fileId
   */
  async fileStatus(fileId) {
    const drive = getDrive();
    let meta;
    try {
      const res = await drive.files.get({ fileId, supportsAllDrives: true, fields: 'id, trashed' });
      meta = res.data;
    } catch (/** @type {any} */ err) {
      if (isNotFound(err)) return 'missing';
      throw err;
    }
    // Reported whether or not the guard is on: it is true either way, and with
    // the guard on (the default) the portal refuses to open or delete it.
    if (!(await isInsideRoot(drive, fileId))) return 'outside_folder';
    return meta?.trashed ? 'in_bin' : 'present';
  },

  async deleteFile(fileId) {
    const drive = getDrive();
    // ⚠ A file that is ALREADY GONE is deleted, not an error (2026-09-27). Its
    // row outlived it — a delete that removed the file and then failed, or
    // someone emptying it in Drive — and refusing meant the row could never be
    // removed, nor any record that deletes its documents first. Asked BEFORE
    // the folder guard, which cannot walk the parents of a file that is not
    // there and would call it "outside the folder": true, and not the point.
    // ⛔ Only a real 404 counts. Any other failure to look it up still reaches
    // the guard, which refuses — "could not tell" never means "delete".
    try {
      await drive.files.get({ fileId, supportsAllDrives: true, fields: 'id' });
    } catch (/** @type {any} */ err) {
      if (isNotFound(err)) {
        logger('Drive file already gone:', fileId);
        return;
      }
      // anything else: on to the guard, which cannot tell either and refuses
    }
    await assertInsideRoot(drive, fileId, 'Delete');
    try {
      await drive.files.delete({ fileId, supportsAllDrives: true });
    } catch (/** @type {any} */ err) {
      if (!isNotFound(err)) throw err;        // gone between the two calls
    }
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

    // ⭐ A record's folder is found by the short id it ends with, not by its
    // whole name (2026-09-27). `Old title (1a2b3c4d)` IS `New title (1a2b3c4d)`
    // once the record is renamed — so it is renamed to match, and used, rather
    // than a second folder being started beside it.
    const key = folderKey(name);
    if (key && parentId) {
      const same = (await childFolders(drive, parentId)).find((f) => folderKey(f.name) === key);
      if (same) {
        await drive.files.update({ fileId: same.id, supportsAllDrives: true, requestBody: { name } });
        logger('Renamed Drive folder:', same.name, '→', name);
        return same.id;
      }
    }
    return this.createFolder(name, parentId);
  },

  /**
   * The folder a file sits in, or null. Asked BEFORE a delete, so the folder
   * can be tidied afterwards (trashFolderIfEmpty).
   * @param {string} fileId
   */
  async parentFolderOf(fileId) {
    const drive = getDrive();
    await assertInsideRoot(drive, fileId, 'Read');
    const res = await drive.files.get({ fileId, supportsAllDrives: true, fields: 'parents' });
    return res.data.parents?.[0] ?? null;
  },

  /**
   * Move a record's folder to the Drive bin once nothing is left in it
   * (2026-09-27: deleting a note removed its files and left the folder).
   *
   * ⛔ Deliberately narrow. Never the root; never a folder directly under the
   * root — those are the categories (`Info Notes`, `Inspections`, …) that
   * every record's folder lives in; never anything outside the root, whatever
   * STORAGE_WITHIN_ROOT_ONLY says; never a folder with anything in it. And
   * BINNED, not deleted: Drive keeps it for 30 days, so a file that raced in
   * between the check and the bin can still be recovered.
   *
   * @param {string|null|undefined} folderId
   * @returns {Promise<boolean>} whether it was binned
   */
  async trashFolderIfEmpty(folderId) {
    if (!folderId || folderId === _rootFolderId) return false;
    const drive = getDrive();
    const meta = await drive.files.get({
      fileId: folderId, supportsAllDrives: true, fields: 'id, name, mimeType, parents, trashed',
    });
    if (meta.data.mimeType !== FOLDER_MIME || meta.data.trashed) return false;
    if ((meta.data.parents ?? []).includes(_rootFolderId)) return false;   // a category folder
    if (!(await isInsideRoot(drive, folderId))) return false;
    const kids = await drive.files.list({
      supportsAllDrives: true, includeItemsFromAllDrives: true,
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
    });
    if (kids.data.files?.length) return false;
    await drive.files.update({ fileId: folderId, supportsAllDrives: true, requestBody: { trashed: true } });
    _insideRoot.delete(folderId);
    logger('Binned empty Drive folder:', meta.data.name);
    return true;
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
    await assertInsideRoot(drive, fileId, 'Move');
    // The root itself is a fine destination; the check treats it as "not
    // inside" only so a DELETE can never take the root.
    if (newFolderId !== _rootFolderId) await assertInsideRoot(drive, newFolderId, 'Move');
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
    await assertInsideRoot(drive, fileId, 'Read');
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
