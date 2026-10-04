// src/lib/server/storage/googleDriveFolders.test.js
//
// Record folders (2026-09-27). A record's folder is `<title> (<short id>)`
// (entityFolderPath). Deleting a note removed its files and left the folder;
// renaming it made the next upload start a second folder beside the first.
// These run against a fake Drive that keeps real folder state.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  /** @type {Record<string, { name: string, mimeType: string, parents: string[], trashed?: boolean }>} */
  items: {},
  seq: 0,
}));

const FOLDER = 'application/vnd.google-apps.folder';

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
        get: async ({ fileId }) => {
          const it = h.items[fileId];
          if (!it) throw new Error('not found');
          return { data: { id: fileId, ...it } };
        },
        list: async ({ q }) => {
          const parent = q.match(/'([^']+)' in parents/)?.[1];
          const name   = q.match(/name = '([^']+)'/)?.[1];
          const foldersOnly = q.includes(`mimeType = '${FOLDER}'`);
          const files = Object.entries(h.items)
            .filter(([, it]) => !it.trashed && it.parents.includes(parent))
            .filter(([, it]) => !foldersOnly || it.mimeType === FOLDER)
            .filter(([, it]) => name === undefined || it.name === name)
            .map(([id, it]) => ({ id, name: it.name }));
          return { data: { files } };
        },
        create: async ({ requestBody }) => {
          const id = `new${++h.seq}`;
          h.items[id] = { name: requestBody.name, mimeType: requestBody.mimeType, parents: requestBody.parents };
          return { data: { id } };
        },
        update: async ({ fileId, requestBody }) => {
          Object.assign(h.items[fileId], requestBody);
          return { data: { id: fileId } };
        },
      },
    }),
  },
}));

const { googleDriveProvider } = await import('./googleDriveProvider.js');
const { folderKey } = await import('./folderNames.js');

const folder = (name, parent) => ({ name, mimeType: FOLDER, parents: [parent] });
const file   = (name, parent) => ({ name, mimeType: 'application/pdf', parents: [parent] });

beforeEach(() => {
  h.seq = 0;
  h.items = {
    NOTES: folder('Info Notes', 'ROOT'),
    OLD:   folder('Old title (1a2b3c4d)', 'NOTES'),
    OTHER: folder('Another note (99999999)', 'NOTES'),
    ISSUE: folder('Issue 49', 'ISSUES'),
    ISSUES: folder('Issues', 'ROOT'),
  };
});

describe('folderKey', () => {
  it('reads the short id a record folder ends with, and nothing else', () => {
    expect(folderKey('Old title (1a2b3c4d)')).toBe('1a2b3c4d');
    expect(folderKey('1a2b3c4d')).toBe('1a2b3c4d');
    expect(folderKey('PA-0001 (0f0f0f0f)')).toBe('0f0f0f0f');
    for (const n of ['Info Notes', 'Issue 49', '2026-06-09 Inspection', 'Title (NOTHEX00)', 'x (1a2b3c4)', '', null]) {
      expect(folderKey(n)).toBeNull();
    }
  });
});

describe('a renamed record keeps its folder', () => {
  it('finds the folder by its short id and renames it, rather than starting another', async () => {
    const id = await googleDriveProvider.ensurePath(['Info Notes', 'New title (1a2b3c4d)']);
    expect(id).toBe('OLD');
    expect(h.items.OLD.name).toBe('New title (1a2b3c4d)');
    expect(Object.keys(h.items).filter(k => k.startsWith('new'))).toEqual([]);   // nothing created
  });

  it('uses an exact match as before, and creates a folder for a new record', async () => {
    expect(await googleDriveProvider.ensurePath(['Info Notes', 'Another note (99999999)'])).toBe('OTHER');
    const id = await googleDriveProvider.ensurePath(['Info Notes', 'Brand new (abcdef12)']);
    expect(h.items[id]).toMatchObject({ name: 'Brand new (abcdef12)', parents: ['NOTES'] });
  });

  it('never renames a folder that is not a record folder', async () => {
    const id = await googleDriveProvider.ensurePath(['Issues', 'Issue 50']);
    expect(h.items.ISSUE.name).toBe('Issue 49');
    expect(id).not.toBe('ISSUE');
  });
});

describe('an emptied record folder goes to the bin', () => {
  it('bins a record folder once nothing is in it', async () => {
    expect(await googleDriveProvider.trashFolderIfEmpty('OLD')).toBe(true);
    expect(h.items.OLD.trashed).toBe(true);
  });

  it('leaves a folder that still holds something', async () => {
    h.items.F = file('Minutes.pdf', 'OLD');
    expect(await googleDriveProvider.trashFolderIfEmpty('OLD')).toBe(false);
    expect(h.items.OLD.trashed).toBeUndefined();
  });

  it('never bins a category folder, the root, or anything outside the root', async () => {
    // An EMPTY category — like prod's `/Documents` — is the case that matters:
    // a category with records in it would be refused anyway, for being full.
    h.items.DOCS = folder('Documents', 'ROOT');
    expect(await googleDriveProvider.trashFolderIfEmpty('DOCS')).toBe(false);
    expect(h.items.DOCS.trashed).toBeUndefined();
    expect(await googleDriveProvider.trashFolderIfEmpty('NOTES')).toBe(false);   // directly under the root
    expect(await googleDriveProvider.trashFolderIfEmpty('ROOT')).toBe(false);
    h.items.ELSEWHERE = folder('Private (12345678)', 'MY_DRIVE');
    h.items.MY_DRIVE = folder('My Drive', 'NOWHERE');
    expect(await googleDriveProvider.trashFolderIfEmpty('ELSEWHERE')).toBe(false);
    expect(h.items.ELSEWHERE.trashed).toBeUndefined();
  });

  it('never bins a file', async () => {
    h.items.F = file('Minutes.pdf', 'OLD');
    expect(await googleDriveProvider.trashFolderIfEmpty('F')).toBe(false);
  });

  it('says which folder a file is in, so it can be tidied after the file goes', async () => {
    h.items.F = file('Minutes.pdf', 'OLD');
    expect(await googleDriveProvider.parentFolderOf('F')).toBe('OLD');
  });
});
