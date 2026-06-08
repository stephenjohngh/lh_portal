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
// See docs/google_drive_storage_setup.md for setup instructions.

import { google }  from 'googleapis';
import { Readable } from 'stream';
import { getLogger } from '$lib/utils/logger';
import {
  GOOGLE_DRIVE_CLIENT_EMAIL,
  GOOGLE_DRIVE_PRIVATE_KEY,
  GOOGLE_DRIVE_ROOT_FOLDER_ID,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN,
} from '$env/static/private';

const logger = getLogger('GoogleDriveProvider');

// ── Resolved env values ────────────────────────────────────────────────────
const _rootFolderId  = GOOGLE_DRIVE_ROOT_FOLDER_ID ?? '';
const _oauthId       = GOOGLE_OAUTH_CLIENT_ID      ?? '';
const _oauthSecret   = GOOGLE_OAUTH_CLIENT_SECRET  ?? '';
const _oauthRefresh  = GOOGLE_OAUTH_REFRESH_TOKEN  ?? '';
const _saEmail       = GOOGLE_DRIVE_CLIENT_EMAIL   ?? '';
const _saKey         = (GOOGLE_DRIVE_PRIVATE_KEY   ?? '').replace(/\\n/g, '\n');

// Log warnings at startup so missing vars surface immediately.
if (!_rootFolderId) {
  logger('⚠️  GOOGLE_DRIVE_ROOT_FOLDER_ID not set — ensurePath() will fail at runtime');
}
if (!_oauthRefresh && (!_saEmail || !_saKey)) {
  logger('⚠️  No Drive credentials found — set GOOGLE_OAUTH_REFRESH_TOKEN (OAuth2) or GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY (service account)');
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
    logger('Drive client initialised (OAuth2 mode)');

  } else if (_saEmail && _saKey) {
    // ── Service account mode ─────────────────────────────────────────────
    // Requires the root folder to be a Shared Drive (Google Workspace
    // Business Standard+). Service accounts have no personal Drive quota.
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: _saEmail, private_key: _saKey },
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    _drive = google.drive({ version: 'v3', auth });
    logger('Drive client initialised (service account mode)');

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
    return {
      data:     Buffer.from(res.data),
      mimeType: res.headers?.['content-type'] ?? 'image/jpeg',
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
