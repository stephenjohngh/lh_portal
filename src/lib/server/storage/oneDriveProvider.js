// src/lib/server/storage/oneDriveProvider.js
// Microsoft OneDrive storage provider via Microsoft Graph API.
// Uses app-only (client credentials) authentication — no user login required.
//
// Required environment variables:
//   ONEDRIVE_TENANT_ID        Azure AD tenant ID
//   ONEDRIVE_CLIENT_ID        App registration client ID
//   ONEDRIVE_CLIENT_SECRET    App registration client secret
//   ONEDRIVE_DRIVE_ID         Drive ID (user drive or SharePoint library)
//   ONEDRIVE_ROOT_FOLDER_ID   Item ID of the root folder inside that drive
//                              (defaults to 'root' — the drive root)
//
// Azure setup:
//   1. portal.azure.com → App registrations → New registration
//   2. API permissions → Add → Microsoft Graph → Application permissions
//      → Files.ReadWrite.All → Grant admin consent
//   3. Certificates & secrets → New client secret → copy the Value
//   4. Find your Drive ID: Graph Explorer → GET /me/drive (personal)
//      or /sites/{site-id}/drive (SharePoint) → copy 'id'

import { getLogger } from '$lib/utils/logger';

const logger = getLogger('OneDriveProvider');
const GRAPH  = 'https://graph.microsoft.com/v1.0';

// In-memory token cache — valid for the lifetime of the Node process
let _token  = null;
let _expiry = 0;

function cfg() {
  const t = process.env.ONEDRIVE_TENANT_ID;
  const c = process.env.ONEDRIVE_CLIENT_ID;
  const s = process.env.ONEDRIVE_CLIENT_SECRET;
  const d = process.env.ONEDRIVE_DRIVE_ID;
  if (!t || !c || !s || !d) {
    throw new Error(
      'OneDrive credentials not configured. Set ONEDRIVE_TENANT_ID, ONEDRIVE_CLIENT_ID, ' +
      'ONEDRIVE_CLIENT_SECRET, and ONEDRIVE_DRIVE_ID.',
    );
  }
  return {
    tenantId:     t,
    clientId:     c,
    clientSecret: s,
    driveId:      d,
    rootFolderId: process.env.ONEDRIVE_ROOT_FOLDER_ID || 'root',
  };
}

async function getToken() {
  if (_token && Date.now() < _expiry - 60_000) return _token;
  const { tenantId, clientId, clientSecret } = cfg();

  const res  = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'https://graph.microsoft.com/.default',
      }),
    },
  );
  if (!res.ok) throw new Error(`OneDrive auth failed: ${await res.text()}`);
  const data = await res.json();
  _token  = data.access_token;
  _expiry = Date.now() + data.expires_in * 1000;
  return _token;
}

/** Authenticated Graph API request helper */
async function graph(method, path, body, extraHeaders = {}) {
  const token = await getToken();
  const res   = await fetch(`${GRAPH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body !== undefined ? (body instanceof Buffer ? body : JSON.stringify(body)) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.status);
    throw new Error(`Graph ${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Create an anonymous view sharing link and return its webUrl */
async function createSharingLink(driveId, itemId) {
  const data = await graph('POST', `/drives/${driveId}/items/${itemId}/createLink`, {
    type:  'view',
    scope: 'anonymous',
  });
  return data?.link?.webUrl ?? null;
}

const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4 MB — Graph simple upload limit

async function uploadItem(driveId, parentId, filename, buffer, mimeType) {
  const token = await getToken();
  const path  = `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(filename)}:/`;

  if (buffer.byteLength <= SIMPLE_UPLOAD_LIMIT) {
    // Simple single-request upload
    const res = await fetch(`${GRAPH}${path}content`, {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
      body:    buffer,
    });
    if (!res.ok) throw new Error(`OneDrive upload failed: ${await res.text()}`);
    return res.json();
  }

  // Large file: create an upload session, then PUT in one chunk.
  // The session URL is unauthenticated — do NOT include Authorization header.
  const session = await graph(
    'POST',
    `${path}createUploadSession`,
    { item: { '@microsoft.graph.conflictBehavior': 'replace', name: filename } },
  );
  const size    = buffer.byteLength;
  const upRes   = await fetch(session.uploadUrl, {
    method:  'PUT',
    headers: {
      'Content-Length': String(size),
      'Content-Range':  `bytes 0-${size - 1}/${size}`,
      'Content-Type':   mimeType,
    },
    body: buffer,
  });
  if (!upRes.ok) throw new Error(`OneDrive large upload failed: ${await upRes.text()}`);
  return upRes.json();
}

function mapItem(item, driveId) {
  const isFolder = !!item.folder;
  return {
    fileId:       item.id,
    name:         item.name,
    mimeType:     item.file?.mimeType   ?? (isFolder ? 'application/vnd.onedrive.folder' : null),
    size:         item.size             ?? 0,
    webViewUrl:   item.webUrl           ?? null,
    thumbnailUrl: null,
    createdAt:    item.createdDateTime  ?? null,
    modifiedAt:   item.lastModifiedDateTime ?? null,
    isFolder,
  };
}

/** @type {import('./storageProvider.js').StorageProvider} */
export const oneDriveProvider = {
  name: 'onedrive',

  async uploadFile(buffer, filename, mimeType, parentId, _metadata = {}) {
    const { driveId } = cfg();
    logger('Uploading to OneDrive item:', parentId, '—', filename);

    const item = await uploadItem(driveId, parentId, filename, buffer, mimeType);
    const url  = await createSharingLink(driveId, item.id);

    return {
      fileId:       item.id,
      folderId:     parentId,
      webViewUrl:   url ?? item.webUrl ?? null,
      thumbnailUrl: null,
    };
  },

  async getFileUrl(itemId) {
    const { driveId } = cfg();
    const data = await graph('POST', `/drives/${driveId}/items/${itemId}/createLink`, {
      type:  'view',
      scope: 'anonymous',
    });
    return data?.link?.webUrl ?? '';
  },

  async getFileMetadata(itemId) {
    const { driveId } = cfg();
    const item = await graph('GET',
      `/drives/${driveId}/items/${itemId}` +
      '?$select=id,name,file,folder,size,webUrl,createdDateTime,lastModifiedDateTime',
    );
    return mapItem(item, driveId);
  },

  async deleteFile(itemId) {
    const { driveId } = cfg();
    await graph('DELETE', `/drives/${driveId}/items/${itemId}`);
    logger('Deleted OneDrive item:', itemId);
  },

  async listFiles(parentId, opts = {}) {
    const { driveId } = cfg();
    const params = new URLSearchParams({
      $select: 'id,name,file,folder,size,webUrl,createdDateTime,lastModifiedDateTime',
      $top:    String(opts.limit ?? 100),
      $orderby: 'createdDateTime desc',
    });
    if (opts.query)       params.set('$filter', `contains(name,'${opts.query}')`);
    if (opts.foldersOnly) params.set('$filter', 'folder ne null');

    const data = await graph('GET', `/drives/${driveId}/items/${parentId}/children?${params}`);
    return (data?.value ?? [])
      .filter(item => opts.foldersOnly ? !!item.folder : true)
      .map(item => mapItem(item, driveId));
  },

  async createFolder(name, parentId) {
    const { driveId } = cfg();
    const item = await graph('POST', `/drives/${driveId}/items/${parentId}/children`, {
      name,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    });
    logger('Created OneDrive folder:', name, 'under', parentId);
    return item.id;
  },

  async getOrCreateFolder(name, parentId) {
    const { driveId } = cfg();
    const params = new URLSearchParams({
      $filter: `name eq '${name.replace(/'/g, "''")}' and folder ne null`,
      $select: 'id,name,folder',
      $top:    '1',
    });
    const data = await graph('GET', `/drives/${driveId}/items/${parentId}/children?${params}`);
    if (data?.value?.length) return data.value[0].id;
    return this.createFolder(name, parentId);
  },

  async ensurePath(segments) {
    const { driveId, rootFolderId } = cfg();
    let current = rootFolderId;
    for (const segment of segments) {
      current = await this.getOrCreateFolder(segment, current);
    }
    return current;
  },

  async moveFile(itemId, newParentId) {
    const { driveId } = cfg();
    await graph('PATCH', `/drives/${driveId}/items/${itemId}`, {
      parentReference: { driveId, id: newParentId },
    });
  },

  async searchFiles(query, rootId) {
    const { driveId, rootFolderId } = cfg();
    const base   = rootId ?? rootFolderId;
    const params = new URLSearchParams({
      $select: 'id,name,file,folder,size,webUrl,createdDateTime',
      $top:    '50',
    });
    const data = await graph(
      'GET',
      `/drives/${driveId}/items/${base}/search(q='${encodeURIComponent(query)}')?${params}`,
    );
    return (data?.value ?? [])
      .filter(item => !item.folder)
      .map(item => mapItem(item, driveId));
  },
};
