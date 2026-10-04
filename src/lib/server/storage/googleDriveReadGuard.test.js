// src/lib/server/storage/googleDriveReadGuard.test.js
//
// The folder guard is ON BY DEFAULT and covers READS (security review,
// 2026-09-27). The Drive credential may be a person's own Google account,
// which reaches their whole Drive; the portal must never serve a file that is
// not in its own folder, whatever id a caller hands it. This file sets NO
// guard flag at all, which is prod's configuration.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  parents: /** @type {Record<string, string[]>} */ ({}),
  lookups: /** @type {string[]} */ ([]),
  created: /** @type {any[]} */ ([]),
  shared:  /** @type {any[]} */ ([]),
}));

vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('$app/env/private', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('private', {
    GOOGLE_DRIVE_ROOT_FOLDER_ID: 'ROOT',
    GOOGLE_OAUTH_CLIENT_ID: 'id', GOOGLE_OAUTH_CLIENT_SECRET: 's', GOOGLE_OAUTH_REFRESH_TOKEN: 'r',
  }));
vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    drive: () => ({
      files: {
        get: async ({ fileId, alt }) => {
          if (alt === 'media') return { data: new ArrayBuffer(3), headers: { 'content-type': 'image/jpeg' } };
          h.lookups.push(fileId);
          if (!(fileId in h.parents)) throw new Error('not found');
          return { data: { parents: h.parents[fileId] } };
        },
        create: async (req) => { h.created.push(req); return { data: { id: 'NEW' } }; },
        delete: async () => {},
      },
      permissions: { create: async (req) => { h.shared.push(req); } },
    }),
  },
}));

const { googleDriveProvider } = await import('./googleDriveProvider.js');

beforeEach(() => { h.parents = {}; h.lookups = []; h.created = []; h.shared = []; });

describe('reads, with no guard flag set (prod)', () => {
  it('serves a file inside the portal folder', async () => {
    h.parents = { photo: ['walk'], walk: ['ROOT'] };
    const { mimeType } = await googleDriveProvider.getFileStream('photo');
    expect(mimeType).toBe('image/jpeg');
  });

  it('refuses a file elsewhere in the same Drive account', async () => {
    h.parents = { payslip: ['personal'], personal: ['MY_DRIVE'], MY_DRIVE: [] };
    await expect(googleDriveProvider.getFileStream('payslip')).rejects.toThrow(/refused/i);
  });

  it('remembers what it has proved, so the next photo in a folder costs no lookups', async () => {
    h.parents = { a: ['walk'], b: ['walk'], walk: ['ROOT'] };
    await googleDriveProvider.getFileStream('a');
    h.lookups = [];
    await googleDriveProvider.getFileStream('a');
    expect(h.lookups).toEqual([]);                 // proved already
    await googleDriveProvider.getFileStream('b');
    expect(h.lookups).toEqual(['b']);              // its folder is already known
  });
});

describe('uploads', () => {
  // The review's finding: every upload was shared "anyone with the link", so an
  // id alone fetched the file from Google with no login and no portal.
  it('never shares an uploaded file publicly', async () => {
    const out = await googleDriveProvider.uploadFile(Buffer.from('x'), 'a.jpg', 'image/jpeg', 'ROOT');
    expect(h.created).toHaveLength(1);
    expect(h.shared).toEqual([]);
    expect(out.fileId).toBe('NEW');
  });
});
