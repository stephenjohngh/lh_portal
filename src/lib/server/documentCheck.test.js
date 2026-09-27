// src/lib/server/documentCheck.test.js
// Check files (Admin → Document Demo, 2026-09-27): does each document_library
// row still have its record and its file? It must report, never guess — a
// failed lookup is not "deleted", and a storage it cannot ask is not "fine".
import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://x', PUBLIC_SUPABASE_ANON_KEY: 'anon' }));

const { checkOwners, checkFiles, checkDocuments } = await import('./documentCheck.js');

/** A fake service-role client: tables hold the ids that exist. */
function fakeDb(tables, { failOn } = /** @type {{ failOn?: string }} */ ({})) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        select() { return this; },
        in(_col, ids) {
          calls.push({ table, ids });
          if (failOn === table) return Promise.resolve({ data: null, error: { message: 'boom' } });
          return Promise.resolve({ data: (tables[table] ?? []).filter((id) => ids.includes(id)).map((id) => ({ id })), error: null });
        },
      };
    },
  };
}

const doc = (id, entity_type, entity_id, fileId = `f-${id}`, provider = 'google_drive') =>
  ({ id, entity_type, entity_id, provider, provider_file_id: fileId });

describe('checkOwners', () => {
  it('says whether the record each document is attached to still exists', async () => {
    const db = fakeDb({ info_notes: ['n1'], issues: ['i1'] });
    const out = await checkOwners(db, [
      doc('a', 'info_note', 'n1'), doc('b', 'info_note', 'n-gone'), doc('c', 'issue', 'i1'),
    ]);
    expect(Object.fromEntries(out)).toEqual({ a: 'present', b: 'missing', c: 'present' });
    // one query per kind of owner, not one per document
    expect(db.calls.map((c) => c.table).sort()).toEqual(['info_notes', 'issues']);
  });

  it('calls a loose upload loose, and an owner type it does not know unknown — never missing', async () => {
    const out = await checkOwners(fakeDb({}), [doc('a', null, null), doc('b', 'something_new', 'x1')]);
    expect(Object.fromEntries(out)).toEqual({ a: 'loose', b: 'unknown' });
  });

  it('reads a maintenance document\'s owner as the JOB', async () => {
    const out = await checkOwners(fakeDb({ maintenance_jobs: ['j1'] }), [doc('a', 'maintenance_document', 'j1')]);
    expect(out.get('a')).toBe('present');
  });

  // ⛔ "missing" is the answer that invites a delete, so a failed lookup must
  // never produce it.
  it('throws rather than reporting "missing" when a lookup fails', async () => {
    await expect(checkOwners(fakeDb({}, { failOn: 'info_notes' }), [doc('a', 'info_note', 'n1')]))
      .rejects.toThrow(/Could not check info_notes/);
  });
});

describe('checkFiles', () => {
  const drive = (states) => ({
    fileStatus: vi.fn(async (id) => {
      const s = states[id];
      if (s instanceof Error) throw s;
      return s;
    }),
  });

  it('reports what storage says about each file', async () => {
    const p = drive({ f1: 'present', f2: 'missing', f3: 'in_bin', f4: 'outside_folder' });
    const out = await checkFiles(
      [doc('a', null, null, 'f1'), doc('b', null, null, 'f2'), doc('c', null, null, 'f3'), doc('d', null, null, 'f4')],
      () => p);
    expect(Object.fromEntries([...out].map(([k, v]) => [k, v.status])))
      .toEqual({ a: 'present', b: 'missing', c: 'in_bin', d: 'outside_folder' });
  });

  it('says it could not tell, rather than guessing, when a lookup fails', async () => {
    const out = await checkFiles([doc('a', null, null, 'f1')], () => drive({ f1: new Error('quota') }));
    expect(out.get('a')).toEqual({ status: 'error', detail: 'quota' });
  });

  it('marks a storage that cannot be asked, or an unknown provider, as not checked', async () => {
    const out = await checkFiles(
      [doc('a', null, null, 'f1', 'supabase'), doc('b', null, null, 'f2', 'mystery')],
      (d) => {
        if (d.provider === 'mystery') throw new Error('does not know how to reach');
        return {};                                 // no fileStatus
      });
    expect(out.get('a')?.status).toBe('unchecked');
    expect(out.get('b')).toMatchObject({ status: 'unchecked', detail: expect.stringMatching(/does not know/) });
  });

  it('calls a row with no file recorded missing, without asking storage', async () => {
    const p = drive({});
    const out = await checkFiles([doc('a', null, null, /** @type {any} */ (null))], () => p);
    expect(out.get('a')?.status).toBe('missing');
    expect(p.fileStatus).not.toHaveBeenCalled();
  });

  it('never asks storage about more than five files at once', async () => {
    let inFlight = 0, peak = 0;
    const p = { fileStatus: async () => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--; return 'present';
    } };
    const docs = Array.from({ length: 20 }, (_, i) => doc(`d${i}`, null, null, `f${i}`));
    const out = await checkFiles(docs, () => p);
    expect(out.size).toBe(20);
    expect(peak).toBeLessThanOrEqual(5);
  });
});

describe('checkDocuments', () => {
  it('returns both answers for every document, keyed by id', async () => {
    const res = await checkDocuments(
      fakeDb({ info_notes: ['n1'] }),
      [doc('a', 'info_note', 'n1', 'f1'), doc('b', 'info_note', 'gone', 'f2')],
      () => ({ fileStatus: async (id) => (id === 'f1' ? 'present' : 'missing') }));
    expect(res).toEqual({
      a: { owner: 'present', file: 'present' },
      b: { owner: 'missing', file: 'missing' },
    });
  });
});
