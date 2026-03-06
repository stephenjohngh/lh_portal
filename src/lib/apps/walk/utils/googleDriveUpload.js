// src/lib/apps/walk/utils/googleDriveUpload.js
// Upload inspection photos to Google Drive
// Requires Google OAuth 2.0 authentication

/**
 * Google Drive Configuration
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. Go to Google Cloud Console: https://console.cloud.google.com
 * 2. Create a new project (or select existing)
 * 3. Enable Google Drive API:
 *    - Go to "APIs & Services" > "Library"
 *    - Search for "Google Drive API"
 *    - Click "Enable"
 * 
 * 4. Create OAuth 2.0 Credentials:
 *    - Go to "APIs & Services" > "Credentials"
 *    - Click "Create Credentials" > "OAuth client ID"
 *    - Application type: "Web application"
 *    - Authorized JavaScript origins: https://your-domain.com
 *    - Authorized redirect URIs: https://your-domain.com/oauth/callback
 *    - Copy the Client ID and Client Secret
 * 
 * 5. Add credentials to environment variables:
 *    - VITE_GOOGLE_CLIENT_ID=your-client-id-here
 *    - VITE_GOOGLE_CLIENT_SECRET=your-client-secret-here
 * 
 * 6. Configure OAuth consent screen:
 *    - Add your app name, user support email
 *    - Add scopes: ../auth/drive.file (for uploading files)
 *    - Add test users (for development)
 */

// Google Drive API configuration
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// Load Google API client library
let gapiLoaded = false;
let tokenClient = null;
let accessToken = null;

/**
 * Initialize Google API client
 * Call this once when the app loads
 */
export async function initGoogleDrive() {
  if (gapiLoaded) return;
  
  try {
    // Load Google API script
    await loadScript('https://apis.google.com/js/api.js');
    await loadScript('https://accounts.google.com/gsi/client');
    
    // Initialize gapi
    await new Promise((resolve) => {
      gapi.load('client', resolve);
    });
    
    await gapi.client.init({
      apiKey: GOOGLE_API_KEY,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
    });
    
    // Initialize token client
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.access_token) {
          accessToken = response.access_token;
          console.log('✅ Google Drive authenticated');
        }
      }
    });
    
    gapiLoaded = true;
    console.log('✅ Google Drive API loaded');
  } catch (error) {
    console.error('Google Drive init failed:', error);
    throw new Error('Failed to initialize Google Drive: ' + error.message);
  }
}

/**
 * Load external script
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Authenticate with Google (shows OAuth popup)
 * Returns access token
 */
export async function authenticateGoogleDrive() {
  if (!gapiLoaded) {
    await initGoogleDrive();
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Request access token
      tokenClient.callback = (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        accessToken = response.access_token;
        resolve(accessToken);
      };
      
      // Check if we have a valid token
      if (accessToken) {
        // Verify token is still valid
        fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
          .then(res => res.ok ? resolve(accessToken) : tokenClient.requestAccessToken())
          .catch(() => tokenClient.requestAccessToken());
      } else {
        tokenClient.requestAccessToken({ prompt: '' });
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Find or create folder in Google Drive
 * @param {string} folderName - Folder name (session name)
 * @returns {Promise<string>} Folder ID
 */
async function findOrCreateFolder(folderName) {
  try {
    // Search for existing folder
    const response = await gapi.client.drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });
    
    if (response.result.files && response.result.files.length > 0) {
      return response.result.files[0].id;
    }
    
    // Create new folder
    const folder = await gapi.client.drive.files.create({
      resource: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id'
    });
    
    return folder.result.id;
  } catch (error) {
    console.error('Folder operation failed:', error);
    throw error;
  }
}

/**
 * Upload image to Google Drive
 * @param {Blob} imageBlob - Compressed image blob
 * @param {string} fileName - File name
 * @param {string} folderName - Folder name (session name)
 * @returns {Promise<string>} File ID and web view link
 */
export async function uploadToGoogleDrive(imageBlob, fileName, folderName) {
  try {
    // Ensure authenticated
    if (!accessToken) {
      await authenticateGoogleDrive();
    }
    
    // Find or create folder
    const folderId = await findOrCreateFolder(folderName);
    
    console.log('Uploading to Google Drive folder:', folderName, folderId);
    
    // Convert blob to base64
    const base64Data = await blobToBase64(imageBlob);
    
    // Upload file using multipart upload
    const metadata = {
      name: fileName,
      mimeType: 'image/jpeg',
      parents: [folderId]
    };
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', imageBlob);
    
    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: form
      }
    );
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    console.log('✅ Uploaded to Google Drive:', result.webViewLink);
    
    // Return web view link (opens in browser)
    return result.webViewLink;
    
  } catch (error) {
    console.error('Google Drive upload failed:', error);
    throw new Error('Google Drive upload failed: ' + error.message);
  }
}

/**
 * Convert blob to base64
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Check if user is authenticated
 */
export function isGoogleDriveAuthenticated() {
  return accessToken !== null;
}

/**
 * Sign out from Google Drive
 */
export function signOutGoogleDrive() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
    accessToken = null;
    console.log('Signed out from Google Drive');
  }
}

/**
 * List files in a folder
 * @param {string} folderName - Folder name (session name)
 * @returns {Promise<Array>} List of files
 */
export async function listDriveFiles(folderName) {
  try {
    if (!accessToken) {
      await authenticateGoogleDrive();
    }
    
    const folderId = await findOrCreateFolder(folderName);
    
    const response = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, webViewLink, createdTime, size)',
      orderBy: 'createdTime desc'
    });
    
    return response.result.files || [];
  } catch (error) {
    console.error('List files failed:', error);
    return [];
  }
}
