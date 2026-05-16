// src/lib/server/storage/googleDriveProvider.js
// Google Drive storage provider implementation.
// All Drive API calls use a service account — no user OAuth required.
//
// Required environment variables:
//   GOOGLE_DRIVE_CLIENT_EMAIL   Service account email
//   GOOGLE_DRIVE_PRIVATE_KEY    Service account private key (with literal \n line breaks)
//   GOOGLE_DRIVE_ROOT_FOLDER_ID Root folder ID shared with the service account

import { google }  from 'googleapis';
import { Readable } from 'stream';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('GoogleDriveProvider');

/** @returns {import('googleapis').drive_v3.Drive} */
function getDrive() {
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!process.env.GOOGLE_DRIVE_CLIENT_EMAIL || !privateKey) {
    throw new Error('Google Drive credentials not configured. Set GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY.');
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      private_key:  privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
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
      requestBody: { name: filename, parents: [folderId] },
      media:       { mimeType, body: stream },
      fields:      FILE_FIELDS,
    });

    // Grant "anyone with the link can view" so web_view_url works without Google login
    await drive.permissions.create({
      fileId:      res.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    return {
      fileId:       res.data.id,
      folderId,
      webViewUrl:   res.data.webViewLink   ?? null,
      thumbnailUrl: res.data.thumbnailLink ?? null,
    };
  },

  async getFileUrl(fileId) {
    const drive = getDrive();
    const res   = await drive.files.get({ fileId, fields: 'webViewLink' });
    return res.data.webViewLink ?? '';
  },

  async getFileMetadata(fileId) {
    const drive = getDrive();
    const res   = await drive.files.get({ fileId, fields: FILE_FIELDS });
    return mapFile(res.data);
  },

  async deleteFile(fileId) {
    const drive = getDrive();
    await drive.files.delete({ fileId });
    logger('Deleted Drive file:', fileId);
  },

  async listFiles(folderId, opts = {}) {
    const drive = getDrive();
    const clauses = [`'${folderId}' in parents`, 'trashed = false'];
    if (opts.foldersOnly) clauses.push(`mimeType = 'application/vnd.google-apps.folder'`);
    else if (opts.mimeType) clauses.push(`mimeType = '${opts.mimeType}'`);
    if (opts.query) clauses.push(`name contains '${opts.query}'`);

    const res = await drive.files.list({
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

    const res = await drive.files.list({ q: clauses.join(' and '), fields: 'files(id)', pageSize: 1 });
    if (res.data.files?.length) return res.data.files[0].id;
    return this.createFolder(name, parentId);
  },

  async ensurePath(segments) {
    const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    if (!root) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID is not set.');
    let current = root;
    for (const segment of segments) {
      current = await this.getOrCreateFolder(segment, current);
    }
    return current;
  },

  async moveFile(fileId, newFolderId) {
    const drive = getDrive();
    const meta  = await drive.files.get({ fileId, fields: 'parents' });
    const previousParents = (meta.data.parents ?? []).join(',');
    await drive.files.update({
      fileId,
      addParents:    newFolderId,
      removeParents: previousParents,
      fields:        'id,parents',
    });
  },

  async searchFiles(query, _rootId) {
    const drive = getDrive();
    const res   = await drive.files.list({
      q:       `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
      fields:  `files(${FILE_FIELDS})`,
      orderBy: 'modifiedTime desc',
      pageSize: 50,
    });
    return (res.data.files ?? []).map(mapFile);
  },
};
