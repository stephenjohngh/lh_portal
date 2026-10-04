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
  gone:    /** @type {Set<string>} */ (new Set()),
  binned:  /** @type {Set<string>} */ (new Set()),
  failing: /** @type {Set<string>} */ (new Set()),
}));

vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('$app/env/private', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('private', {
    STORAGE_DELETE_WITHIN_ROOT_ONLY: 'true',
    GOOGLE_DRIVE_ROOT_FOLDER_ID: 'DEV_ROOT',
    GOOGLE_OAUTH_CLIENT_ID: 'id', GOOGLE_OAUTH_CLIENT_SECRET: 's', GOOGLE_OAUTH_REFRESH_TOKEN: 'r',
  }));
vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    drive: () => ({
      files: {
        get: async ({ fileId }) => {
          if (h.gone.has(fileId)) throw Object.assign(new Error('File not found'), { response: { status: 404 } });
          if (h.failing.has(fileId)) throw Object.assign(new Error('Rate limit'), { response: { status: 403 } });
          if (!(fileId in h.parents)) throw new Error('not found');
          return { data: { id: fileId, parents: h.parents[fileId], trashed: h.binned.has(fileId) } };
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
  beforeEach(() => { h.parents = {}; h.deleted = []; h.gone = new Set(); });

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

  // A row that outlived its file must still be removable (2026-09-27): two
  // library rows on prod name files already deleted from Drive, and every
  // attempt to delete them was refused as "outside the folder".
  it('treats a file Drive says is not there as already deleted', async () => {
    h.gone.add('longgone');
    await expect(googleDriveProvider.deleteFile('longgone')).resolves.toBeUndefined();
    expect(h.deleted).toEqual([]);
  });
});

// Check files (Admin → Document Demo, 2026-09-27): a file's state, changing
// nothing — and a failure to find out is thrown, never reported as "missing".
describe('fileStatus', () => {
  beforeEach(() => { h.parents = {}; h.deleted = []; h.gone = new Set(); h.binned = new Set(); h.failing = new Set(); });

  it('says present, in the bin, missing or outside the folder', async () => {
    h.parents = { ok: ['DEV_ROOT'], bin: ['DEV_ROOT'], away: ['PROD_ROOT'], PROD_ROOT: [] };
    h.binned.add('bin');
    h.gone.add('gone');
    expect(await googleDriveProvider.fileStatus('ok')).toBe('present');
    expect(await googleDriveProvider.fileStatus('bin')).toBe('in_bin');
    expect(await googleDriveProvider.fileStatus('gone')).toBe('missing');
    expect(await googleDriveProvider.fileStatus('away')).toBe('outside_folder');
    expect(h.deleted).toEqual([]);
  });

  it('throws when Drive cannot say, rather than calling the file missing', async () => {
    h.failing.add('busy');
    await expect(googleDriveProvider.fileStatus('busy')).rejects.toThrow(/Rate limit/);
  });
});
