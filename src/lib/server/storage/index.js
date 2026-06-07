// src/lib/server/storage/index.js
// Exports the active storage provider based on STORAGE_PROVIDER env var.
//   'google_drive' (default) — Google Drive via service account
//   'onedrive'               — Microsoft OneDrive via app-only Graph API
//   'supabase'               — Supabase Storage (virtual path prefixes)

import { googleDriveProvider }     from './googleDriveProvider.js';
import { oneDriveProvider }        from './oneDriveProvider.js';
import { supabaseStorageProvider } from './supabaseStorageProvider.js';
import { STORAGE_PROVIDER }        from '$env/static/private';

const PROVIDER_NAME = STORAGE_PROVIDER ?? 'google_drive';

const PROVIDERS = {
  google_drive: googleDriveProvider,
  onedrive:     oneDriveProvider,
  supabase:     supabaseStorageProvider,
};

/** @type {import('./storageProvider.js').StorageProvider} */
export const storageProvider     = PROVIDERS[PROVIDER_NAME] ?? googleDriveProvider;

export const storageProviderName = storageProvider.name;
