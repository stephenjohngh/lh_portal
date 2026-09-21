// src/lib/server/storage/index.js
// Exports the active storage provider based on STORAGE_PROVIDER env var.
//   'google_drive' (default) — Google Drive via service account
//   'onedrive'               — Microsoft OneDrive via app-only Graph API
//   'supabase'               — Supabase Storage (virtual path prefixes)

import { googleDriveProvider }     from './googleDriveProvider.js';
import { oneDriveProvider }        from './oneDriveProvider.js';
import { supabaseStorageProvider } from './supabaseStorageProvider.js';
// $env/dynamic/private — read at runtime so deployments only need the vars
// for their active provider, not all three.
import { env } from '$env/dynamic/private';

const PROVIDER_NAME = env.STORAGE_PROVIDER ?? 'google_drive';

const PROVIDERS = {
  google_drive: googleDriveProvider,
  onedrive:     oneDriveProvider,
  supabase:     supabaseStorageProvider,
};

/** @type {import('./storageProvider.js').StorageProvider} */
export const storageProvider     = PROVIDERS[PROVIDER_NAME] ?? googleDriveProvider;

export const storageProviderName = storageProvider.name;

/**
 * The provider that owns an ALREADY-WRITTEN file, by name.
 *
 * ⛔ Use this for deletion, never `storageProvider`. A file's provider is a
 * property of when it was written; the export above is a property of how this
 * deployment is configured today. Treating the second as the first is what
 * stranded 30 files permanently when STORAGE_PROVIDER changed — see
 * storageRef.js and PROJECT_STATUS §6hh.
 *
 * @param {string|null|undefined} name  one of STORAGE_PROVIDERS
 * @returns {import('./storageProvider.js').StorageProvider|null}
 */
export function providerByName(name) {
  return (name && PROVIDERS[name]) ? PROVIDERS[name] : null;
}
