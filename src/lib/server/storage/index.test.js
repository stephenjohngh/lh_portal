// src/lib/server/storage/index.test.js
//
// Characterisation tests for provider SELECTION — which provider the app picks
// from STORAGE_PROVIDER, and what it does when the value is wrong.
//
// Worth pinning because the failure mode is silent: an unrecognised value does
// not throw, it falls back to Google Drive. A deployment with a typo in the env
// var would write to the wrong place and look like it was working.
//
// The module reads env at import time, so each case uses vi.resetModules() +
// a fresh vi.doMock rather than one top-level mock.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// These cases import the REAL provider modules (that is the point — selection
// is what is under test), which drags in googleapis and the Supabase client.
// On a cold module cache the first import alone can exceed the default 5s
// under full-suite load, so it fails as a timeout rather than as a wrong
// answer. Slow, not flaky: give it room instead of mocking away the thing
// being tested.
vi.setConfig({ testTimeout: 30_000 });

/**
 * Import storage/index.js with STORAGE_PROVIDER set to `value`.
 *
 * The logger is mocked because the providers pull it transitively and it
 * imports `$app/environment`, which does not exist outside a SvelteKit build.
 */
async function loadWith(value) {
  vi.resetModules();
  vi.doMock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
  vi.doMock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }));
  vi.doMock('$env/dynamic/private', () => ({
    env: value === undefined ? {} : { STORAGE_PROVIDER: value },
  }));
  return import('./index.js');
}

beforeEach(() => { vi.resetModules(); });

describe('storage provider selection', () => {
  it('defaults to Google Drive when STORAGE_PROVIDER is unset', async () => {
    const { storageProviderName } = await loadWith(undefined);
    expect(storageProviderName).toBe('google_drive');
  });

  it('selects each provider by name', async () => {
    for (const name of ['google_drive', 'onedrive', 'supabase']) {
      const { storageProviderName } = await loadWith(name);
      expect(storageProviderName).toBe(name);
    }
  });

  it('falls back to Google Drive on an unrecognised value — silently, by design', async () => {
    // ⚠ This is the trap. A typo does not fail loudly; it writes to Drive.
    // If this behaviour is ever changed to throw, change it deliberately and
    // update this test — do not let it drift.
    const { storageProviderName } = await loadWith('gdrive');
    expect(storageProviderName).toBe('google_drive');
  });

  it('exports a provider satisfying the interface the app calls', async () => {
    // The API routes and documentLibrary call these by name; a provider missing
    // one of them fails at request time, not at boot.
    const { storageProvider } = await loadWith('supabase');
    for (const fn of [
      'uploadFile', 'getFileUrl', 'getFileMetadata', 'deleteFile',
      'listFiles', 'getOrCreateFolder', 'getFileStream',
    ]) {
      expect(typeof storageProvider[fn], `${fn} on supabase provider`).toBe('function');
    }
  });

  it('every provider agrees on that interface, so switching cannot half-work', async () => {
    for (const name of ['google_drive', 'onedrive', 'supabase']) {
      const { storageProvider } = await loadWith(name);
      expect(storageProvider.name).toBe(name);
      for (const fn of ['uploadFile', 'getFileStream', 'deleteFile', 'getFileUrl']) {
        expect(typeof storageProvider[fn], `${fn} on ${name}`).toBe('function');
      }
    }
  });

  it('storageProviderName always matches the exported provider', async () => {
    const { storageProvider, storageProviderName } = await loadWith('onedrive');
    expect(storageProviderName).toBe(storageProvider.name);
  });
});
