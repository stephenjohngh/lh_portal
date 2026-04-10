// src/lib/apps/inspection/utils/googleDriveUpload.js
// Upload inspection photos to Google Drive via OAuth 2.0.

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY   = import.meta.env.VITE_GOOGLE_API_KEY;
const SCOPES           = 'https://www.googleapis.com/auth/drive.file';

let gapiLoaded   = false;
let tokenClient  = null;
let accessToken  = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function initGoogleDrive() {
  if (gapiLoaded) return;
  await loadScript('https://apis.google.com/js/api.js');
  await loadScript('https://accounts.google.com/gsi/client');
  await new Promise(resolve => gapi.load('client', resolve));
  await gapi.client.init({
    apiKey: GOOGLE_API_KEY,
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
  });
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope:     SCOPES,
    callback:  response => { if (response.access_token) accessToken = response.access_token; },
  });
  gapiLoaded = true;
}

export async function authenticateGoogleDrive() {
  if (!gapiLoaded) await initGoogleDrive();
  return new Promise((resolve, reject) => {
    tokenClient.callback = response => {
      if (response.error) { reject(new Error(response.error)); return; }
      accessToken = response.access_token;
      resolve(accessToken);
    };
    if (accessToken) {
      fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then(res => res.ok ? resolve(accessToken) : tokenClient.requestAccessToken())
        .catch(() => tokenClient.requestAccessToken());
    } else {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  });
}

async function findOrCreateFolder(folderName) {
  const res = await gapi.client.drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  if (res.result.files?.length > 0) return res.result.files[0].id;
  const folder = await gapi.client.drive.files.create({
    resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return folder.result.id;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}

export async function uploadToGoogleDrive(imageBlob, fileName, folderName) {
  if (!accessToken) await authenticateGoogleDrive();
  const folderId = await findOrCreateFolder(folderName);
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({
    name: fileName, mimeType: 'image/jpeg', parents: [folderId],
  })], { type: 'application/json' }));
  form.append('file', imageBlob);
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form },
  );
  if (!response.ok) throw new Error('Google Drive upload failed: ' + response.statusText);
  const result = await response.json();
  return result.webViewLink;
}

export function isGoogleDriveAuthenticated() { return accessToken !== null; }

export function signOutGoogleDrive() {
  if (accessToken) { google.accounts.oauth2.revoke(accessToken); accessToken = null; }
}

export async function listDriveFiles(folderName) {
  if (!accessToken) await authenticateGoogleDrive();
  const folderId = await findOrCreateFolder(folderName);
  const res = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,webViewLink,createdTime,size)',
    orderBy: 'createdTime desc',
  });
  return res.result.files ?? [];
}
