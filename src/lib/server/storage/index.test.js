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

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Import storage/index.js with STORAGE_PROVIDER set to `value`.
 *
 * The logger is mocked because the providers pull it transitively and it
 * imports `$app/env`, which does not exist outside a SvelteKit build.
 */
async function loadWith(value) {
  vi.resetModules();
  vi.doMock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
  vi.doMock('$app/env/public', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('public', { PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }));
  vi.doMock('$app/env/private', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('private', value === undefined ? {} : { STORAGE_PROVIDER: value }));
  return import('./index.js');
}

// These cases import the REAL provider modules (that is the point — selection
// is what is under test), which drags in googleapis and the Supabase client.
// The FIRST import of those is the slow part: cold, under full-suite load, it
// took up to 49 s, so whichever test ran first timed out — always "defaults to
// Google Drive", the known flake (named 2026-09-17). It is paid ONCE here, in a
// hook with its own stated budget, so every test below measures only what it
// tests and runs on the ordinary 5 s limit. (This replaced a 30 s timeout on
// every test, which still was not enough under load and hid any slow test.)
const COLD_IMPORT_BUDGET_MS = 120_000;
beforeAll(async () => { await loadWith('google_drive'); }, COLD_IMPORT_BUDGET_MS);

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

// ⛔ A file's provider is a property of when it was written. ownerOf is the one
// rule every read and delete of an existing file goes through.
describe('ownerOf — the provider that holds an existing file', () => {
  it('uses the recorded provider, whatever is configured today', async () => {
    const { ownerOf } = await loadWith('google_drive');
    expect(ownerOf('supabase').name).toBe('supabase');
  });
  it('falls back to the configured provider when nothing was recorded', async () => {
    const { ownerOf } = await loadWith('supabase');
    expect(ownerOf(null).name).toBe('supabase');
  });
  it('refuses a recorded provider it does not know, rather than guessing', async () => {
    const { ownerOf } = await loadWith('google_drive');
    expect(() => ownerOf('dropbox')).toThrow(/does not know how to reach/);
  });
});
