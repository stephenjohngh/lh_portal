// src/lib/server/storage/index.js
// Exports the active storage provider based on STORAGE_PROVIDER env var.
// Default: google_drive. Set STORAGE_PROVIDER=supabase to use Supabase Storage.

import { googleDriveProvider }     from './googleDriveProvider.js';
import { supabaseStorageProvider } from './supabaseStorageProvider.js';

const PROVIDER_NAME = process.env.STORAGE_PROVIDER ?? 'google_drive';

/** @type {import('./storageProvider.js').StorageProvider} */
export const storageProvider     = PROVIDER_NAME === 'supabase'
  ? supabaseStorageProvider
  : googleDriveProvider;

export const storageProviderName = storageProvider.name;
