// src/lib/server/storage/googleDriveDeleteGuard.test.js
//
// The dev-server delete guard (2026-09-23). Dev and prod share ONE Drive
// account, and a refreshed dev holds prod's rows — so a delete on dev, which
// goes by absolute file id, would destroy a real production file. With
// STORAGE_DELETE_WITHIN_ROOT_ONLY=true a delete is refused unless the file is
// inside this server's own root folder.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  parents: /** @type {Record<string, string[]>} */ ({}),
  deleted: /** @type {string[]} */ ([]),
}));

vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('$env/dynamic/private', () => ({
  env: {
    STORAGE_DELETE_WITHIN_ROOT_ONLY: 'true',
    GOOGLE_DRIVE_ROOT_FOLDER_ID: 'DEV_ROOT',
    GOOGLE_OAUTH_CLIENT_ID: 'id', GOOGLE_OAUTH_CLIENT_SECRET: 's', GOOGLE_OAUTH_REFRESH_TOKEN: 'r',
  },
}));
vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    drive: () => ({
      files: {
        get: async ({ fileId }) => {
          if (!(fileId in h.parents)) throw new Error('not found');
          return { data: { parents: h.parents[fileId] } };
        },
        delete: async ({ fileId }) => { h.deleted.push(fileId); },
      },
    }),
  },
}));

const { isWithinFolder, googleDriveProvider } = await import('./googleDriveProvider.js');

const tree = (map) => async (id) => {
  if (!(id in map)) throw new Error('not found');
  return map[id];
};

describe('isWithinFolder', () => {
  it('finds a file several folders below the root', async () => {
    const t = tree({ f: ['a'], a: ['b'], b: ['ROOT'] });
    expect(await isWithinFolder('f', 'ROOT', t)).toBe(true);
  });

  it('answers false for a file under a different root', async () => {
    const t = tree({ f: ['a'], a: ['PROD_ROOT'], PROD_ROOT: [] });
    expect(await isWithinFolder('f', 'ROOT', t)).toBe(false);
  });

  it('follows every parent, not only the first', async () => {
    const t = tree({ f: ['elsewhere', 'a'], elsewhere: [], a: ['ROOT'] });
    expect(await isWithinFolder('f', 'ROOT', t)).toBe(true);
  });

  // Fail closed: "could not tell" must mean "do not delete".
  it('answers false when a lookup fails', async () => {
    expect(await isWithinFolder('f', 'ROOT', tree({}))).toBe(false);
  });

  it('answers false on a cycle, and when too deep', async () => {
    expect(await isWithinFolder('f', 'ROOT', tree({ f: ['a'], a: ['f'] }))).toBe(false);
    expect(await isWithinFolder('f', 'ROOT', tree({ f: ['a'], a: ['b'], b: ['ROOT'] }), 2)).toBe(false);
  });

  it('never treats the root itself as deletable', async () => {
    expect(await isWithinFolder('ROOT', 'ROOT', tree({ ROOT: [] }))).toBe(false);
  });
});

describe('deleteFile with the guard on', () => {
  beforeEach(() => { h.parents = {}; h.deleted = []; });

  it('deletes a file inside this server’s own folder', async () => {
    h.parents = { devfile: ['devsub'], devsub: ['DEV_ROOT'] };
    await googleDriveProvider.deleteFile('devfile');
    expect(h.deleted).toEqual(['devfile']);
  });

  // ⛔ The case the guard exists for: a prod file id carried over by a restore.
  it('refuses a file outside it, and deletes nothing', async () => {
    h.parents = { prodfile: ['prodsub'], prodsub: ['PROD_ROOT'], PROD_ROOT: [] };
    await expect(googleDriveProvider.deleteFile('prodfile')).rejects.toThrow(/refused/i);
    expect(h.deleted).toEqual([]);
  });

  it('refuses when the file cannot be looked up', async () => {
    await expect(googleDriveProvider.deleteFile('missing')).rejects.toThrow(/refused/i);
    expect(h.deleted).toEqual([]);
  });
});
