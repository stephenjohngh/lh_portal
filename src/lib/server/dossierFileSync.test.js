import { describe, it, expect, vi } from 'vitest';

vi.mock('$app/env/public', () => ({ PUBLIC_SUPABASE_URL: 'http://x', PUBLIC_SUPABASE_ANON_KEY: 'k' }));
vi.mock('$app/env/private', () => ({ SUPABASE_SERVICE_ROLE_KEY: 'k' }));
vi.mock('./storage/index.js', () => ({ ownerOf: () => { throw new Error('use the injected one'); } }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('./documentLibrary.js', () => ({ listDocuments: async () => [] }));

const { syncPackFiles } = await import('./dossierFileSync.js');

const PACK = { id: 'abcdef12-0000', title: 'Roof brief' };
const BASE = 'Dossier Packs/Roof brief (abcdef12)';
const FOLDERS = [{ id: 'aaaaaaaa-1', parent_id: null, name: 'Plans' }];
const PLACEMENTS = [{ document_id: 'f1', folder_id: 'aaaaaaaa-1' }];

/** A db whose select-and-update calls are recorded. */
function fakeDb({ updateError = null } = {}) {
  const updates = [];
  const rows = { dossier_packs: PACK, dossier_folders: FOLDERS, dossier_file_placements: PLACEMENTS };
  return {
    updates,
    from(table) {
      const q = {
        select() { return q; },
        eq() { return q; },
        maybeSingle: async () => ({ data: rows[table], error: null }),
        update(patch) { return { eq: async (_c, id) => { updates.push({ id, ...patch }); return { error: updateError }; } }; },
        then(res) { return Promise.resolve({ data: rows[table], error: null }).then(res); },
      };
      return q;
    },
  };
}

/** A Drive-like provider with a tiny folder model. */
function fakeProvider({ failMove = [] } = {}) {
  const parents = { 'drv-1': 'folder-pack', 'drv-2': 'folder-pack' };
  const ensured = [];
  const moved = [];
  const binned = [];
  const folderParents = { 'folder-pack': 'folder-cat' };
  return {
    ensured, moved, binned,
    ensurePath: async (segs) => { ensured.push(segs.join('/')); return segs.length === 2 ? 'folder-pack' : 'folder-plans'; },
    parentFolderOf: async (id) => parents[id] ?? folderParents[id] ?? null,
    moveFile: async (id, to) => { if (failMove.includes(id)) throw new Error('Drive said no'); moved.push([id, to]); parents[id] = to; },
    trashFolderIfEmpty: async (id) => { binned.push(id); return false; },
  };
}

const FILE = (id, extra = {}) => ({ id, display_name: id + '.png', provider: 'google_drive', provider_file_id: 'drv-' + id.slice(1), folder_path: BASE, provider_folder_id: null, ...extra });
const run = (files, provider, db = fakeDb(), ids = files.map((f) => f.id)) =>
  syncPackFiles({ packId: PACK.id, documentIds: ids }, { db, ownerOf: () => provider, listDocuments: async () => files });

describe('syncPackFiles', () => {
  it('moves a file to the folder the tree asks for and records where it now is', async () => {
    const provider = fakeProvider(); const db = fakeDb();
    const out = await run([FILE('f1')], provider, db);
    expect(provider.ensured).toEqual([`${BASE}/Plans (aaaaaaaa)`]);
    expect(provider.moved).toEqual([['drv-1', 'folder-plans']]);
    expect(out.moved).toEqual([{ document_id: 'f1', folder_path: `${BASE}/Plans (aaaaaaaa)` }]);
    expect(db.updates).toEqual([{ id: 'f1', folder_path: `${BASE}/Plans (aaaaaaaa)`, provider_folder_id: 'folder-plans' }]);
  });

  it('leaves a file already in the right folder, only fixing its recorded path', async () => {
    const provider = fakeProvider(); const db = fakeDb();
    const out = await run([FILE('f2', { provider_folder_id: 'folder-pack', folder_path: 'Dossier Packs/Old name (abcdef12)' })], provider, db);
    expect(provider.moved).toEqual([]);
    expect(out.unchanged).toHaveLength(1);
    expect(db.updates[0]).toMatchObject({ id: 'f2', folder_path: BASE });
  });

  it('asks Drive about a folder once however many files are going into it', async () => {
    const provider = fakeProvider();
    const placements2 = [{ document_id: 'f1', folder_id: 'aaaaaaaa-1' }, { document_id: 'f3', folder_id: 'aaaaaaaa-1' }];
    PLACEMENTS.splice(0, PLACEMENTS.length, ...placements2);
    await run([FILE('f1'), FILE('f3', { provider_file_id: 'drv-3' })], provider);
    expect(provider.ensured.filter((p) => p.endsWith('Plans (aaaaaaaa)'))).toHaveLength(1);
    PLACEMENTS.splice(0, PLACEMENTS.length, { document_id: 'f1', folder_id: 'aaaaaaaa-1' });
  });

  it('reports a file that cannot be moved and carries on with the rest', async () => {
    const provider = fakeProvider({ failMove: ['drv-1'] });
    const out = await run([FILE('f1'), FILE('f2')], provider);
    expect(out.failed).toEqual([expect.objectContaining({ document_id: 'f1', reason: 'Drive said no' })]);
    expect(out.unchanged.length + out.moved.length).toBe(1);   // f2 was still handled
  });

  it('skips a file whose storage cannot be rearranged, saying why', async () => {
    const out = await run([FILE('f1')], { name: 'supabase' });
    expect(out.skipped).toEqual([expect.objectContaining({ document_id: 'f1', reason: expect.stringMatching(/cannot be rearranged/) })]);
    expect(out.moved).toEqual([]);
  });

  it('only touches the files asked for, and only the pack\'s own', async () => {
    const provider = fakeProvider();
    const out = await run([FILE('f1'), FILE('f2')], provider, fakeDb(), ['f1', 'someone-elses-file']);
    expect(out.moved.map((m) => m.document_id)).toEqual(['f1']);
  });

  it('tidies the folder a move emptied, and stops at the first one that is not empty', async () => {
    const provider = fakeProvider();
    await run([FILE('f1', { provider_folder_id: 'folder-old' })], provider);
    expect(provider.binned).toEqual(['folder-old']);          // answered false, so it did not climb
  });

  it('says so when the record cannot be updated after the move', async () => {
    const out = await run([FILE('f1')], fakeProvider(), fakeDb({ updateError: { message: 'nope' } }));
    expect(out.failed[0].reason).toMatch(/record could not be updated/);
  });

  it('asks nothing of Drive when no file is requested', async () => {
    const provider = fakeProvider();
    const out = await syncPackFiles({ packId: PACK.id, documentIds: [] }, { db: fakeDb(), ownerOf: () => provider, listDocuments: async () => [] });
    expect(out).toEqual({ moved: [], unchanged: [], skipped: [], failed: [] });
    expect(provider.ensured).toEqual([]);
  });
});
