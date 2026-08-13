// src/lib/server/publicationReader.test.js
// P3 step 3 — the only server-side path from a token to content.
//
// The user's requirement is the acceptance test for this phase:
//
//   "a unique unguessable link which allows them access to all the dossier that
//    has been setup for them but gives no access to anything else"
//
// These tests hold the second half of that sentence. Four failures — malformed,
// unknown, revoked, expired — must each fail closed AND be indistinguishable,
// because telling them apart confirms whether a pack exists.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const state = { rows: {}, calls: [] };

  /** A chainable stand-in for the supabase query builder. */
  const table = (name) => {
    const q = {
      _table: name, _filters: {},
      select() { return q; },
      eq(col, val) { q._filters[col] = val; return q; },
      in(col, vals) { q._filters[col] = vals; return q; },
      order() { return q; },
      maybeSingle: () => { state.calls.push({ ...q, table: name }); return maybeSingle(); },
      then(resolve) {
        state.calls.push({ ...q, table: name });
        return Promise.resolve({ data: state.rows[name] ?? [] }).then(resolve);
      },
    };
    return q;
  };

  return { maybeSingle, state, from: vi.fn(table) };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: h.from }),
}));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'https://x.supabase.co' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'svc' } }));

const {
  findServablePublication, readPublicationContent, stripStorageIds,
  publicPublicationFields, readerRefusal,
} = await import('./publicationReader.js');
const { generateToken } = await import('$lib/apps/dossier/utils/publicationToken.js');

const TOKEN = generateToken();
const NOW = new Date('2026-08-12T12:00:00.000Z').getTime();

const livePublication = {
  id: 'pub1', pack_id: 'p1', version: 1, title: 'Flat 4 dispute',
  mode: 'snapshot', snapshot: { format: 1, docs: [], files: [] },
  manifest: { files: [] }, expires_at: null, revoked_at: null,
  created_at: '2026-08-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.state.rows = {};
  h.state.calls = [];
  h.maybeSingle.mockResolvedValue({ data: livePublication, error: null });
});

describe('findServablePublication — the four failures', () => {
  it('serves a live publication', async () => {
    const result = await findServablePublication(TOKEN, NOW);
    expect(result.ok).toBe(true);
    expect(result.publication.id).toBe('pub1');
  });

  it('refuses a malformed token WITHOUT querying at all', async () => {
    const result = await findServablePublication('../../etc/passwd', NOW);
    expect(result.ok).toBe(false);
    // Shape first: a malformed path segment costs a regex, not a round trip.
    expect(h.from).not.toHaveBeenCalled();
  });

  it('refuses a token nobody issued', async () => {
    h.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await findServablePublication(TOKEN, NOW)).ok).toBe(false);
  });

  it('refuses a revoked publication', async () => {
    h.maybeSingle.mockResolvedValueOnce({
      data: { ...livePublication, revoked_at: '2026-08-05T00:00:00Z' }, error: null,
    });
    expect((await findServablePublication(TOKEN, NOW)).ok).toBe(false);
  });

  it('refuses an expired publication', async () => {
    h.maybeSingle.mockResolvedValueOnce({
      data: { ...livePublication, expires_at: '2026-08-11T00:00:00Z' }, error: null,
    });
    expect((await findServablePublication(TOKEN, NOW)).ok).toBe(false);
  });

  it('gives BYTE-IDENTICAL refusals for all four', async () => {
    // The property the whole "unguessable" claim rests on. If a probe can tell
    // "revoked" from "no such token", it has learned that a pack exists.
    const refusals = [];

    refusals.push(await findServablePublication('nonsense', NOW));

    h.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    refusals.push(await findServablePublication(TOKEN, NOW));

    h.maybeSingle.mockResolvedValueOnce({
      data: { ...livePublication, revoked_at: '2026-08-05T00:00:00Z' }, error: null });
    refusals.push(await findServablePublication(TOKEN, NOW));

    h.maybeSingle.mockResolvedValueOnce({
      data: { ...livePublication, expires_at: '2026-08-11T00:00:00Z' }, error: null });
    refusals.push(await findServablePublication(TOKEN, NOW));

    expect(new Set(refusals.map(r => JSON.stringify(r))).size).toBe(1);
    expect(refusals[0]).toEqual(readerRefusal());
  });

  it('refuses when the database itself errors, rather than failing open', async () => {
    h.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect((await findServablePublication(TOKEN, NOW)).ok).toBe(false);
  });

  it('looks the publication up by token HASH, never by the token', async () => {
    await findServablePublication(TOKEN, NOW);
    const call = h.state.calls.at(-1);
    expect(call.table).toBe('dossier_publications');
    expect(call._filters.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(call._filters)).not.toContain(TOKEN);
  });
});

describe('readPublicationContent', () => {
  it('returns the frozen snapshot without querying anything', async () => {
    const content = await readPublicationContent(livePublication);
    expect(content).toBe(livePublication.snapshot);
    // The strongest form of the isolation guarantee: no live table is in the
    // request path at all.
    expect(h.from).not.toHaveBeenCalled();
  });

  it('rebuilds from the pack in follow-latest mode', async () => {
    h.maybeSingle.mockResolvedValue({
      data: { id: 'p1', title: 'Flat 4', description: '' }, error: null });
    h.state.rows.dossier_docs = [
      { id: 'd1', slug: 'overview', title: 'Overview', order_index: 0, blocks: null },
    ];

    const content = await readPublicationContent({ ...livePublication, mode: 'latest' });
    expect(content.docs.map(d => d.id)).toEqual(['d1']);
  });

  it('filters EVERY live query by the pack id from the publication row', async () => {
    // The caller supplies a token and nothing else. If any filter here could be
    // influenced from outside, one link would become a key to another pack.
    h.maybeSingle.mockResolvedValue({
      data: { id: 'p1', title: 'Flat 4', description: '' }, error: null });
    h.state.rows.dossier_datasets = [{ id: 'ds1', key: 'chronology', title: 'C' }];

    await readPublicationContent({ ...livePublication, mode: 'latest' });

    const scoped = h.state.calls.filter(c =>
      ['dossier_packs', 'dossier_docs', 'dossier_datasets'].includes(c.table));
    expect(scoped.length).toBeGreaterThanOrEqual(3);
    for (const call of scoped) {
      const scope = call._filters.pack_id ?? call._filters.id ?? call._filters.entity_id;
      expect(scope).toBe('p1');
    }
  });

  it('scopes the shelf to this pack, not to the whole document library', async () => {
    h.maybeSingle.mockResolvedValue({
      data: { id: 'p1', title: 'Flat 4', description: '' }, error: null });

    await readPublicationContent({ ...livePublication, mode: 'latest' });

    const shelf = h.state.calls.find(c => c.table === 'document_library');
    expect(shelf._filters).toMatchObject({
      entity_type: 'dossier_pack', entity_id: 'p1',
    });
  });

  it('returns null when the pack behind a follow-latest link has gone', async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await readPublicationContent({ ...livePublication, mode: 'latest' })).toBeNull();
  });
});

describe('stripStorageIds', () => {
  const content = {
    docs: [{
      id: 'd1',
      blocks: {
        type: 'doc',
        content: [
          { type: 'asset', attrs: { document_id: 'f1', provider_file_id: 'drive-1' } },
          {
            type: 'toggle',
            content: [{
              type: 'toggleBody',
              content: [{ type: 'asset',
                attrs: { document_id: 'f2', provider_file_id: 'drive-2' } }],
            }],
          },
        ],
      },
    }],
    files: [{ id: 'f1', filename: 'notice.pdf', provider_file_id: 'drive-1' }],
  };

  it('removes storage ids from the shelf', () => {
    const out = stripStorageIds(content);
    expect(out.files[0]).not.toHaveProperty('provider_file_id');
    expect(out.files[0].filename).toBe('notice.pdf');
  });

  it('removes the copy cached on each asset BLOCK, including nested ones', () => {
    // Stripping only the shelf would leave the hole wide open: the block attrs
    // carry their own copy.
    const out = stripStorageIds(content);
    expect(JSON.stringify(out)).not.toContain('drive-1');
    expect(JSON.stringify(out)).not.toContain('drive-2');
  });

  it('keeps document_id, which is how the recipient addresses a file', () => {
    const out = stripStorageIds(content);
    expect(JSON.stringify(out)).toContain('f1');
    expect(JSON.stringify(out)).toContain('f2');
  });

  it('does not mutate the input', () => {
    const before = JSON.stringify(content);
    stripStorageIds(content);
    expect(JSON.stringify(content)).toBe(before);
  });

  it('handles empty and missing content', () => {
    expect(stripStorageIds(null)).toBeNull();
    expect(stripStorageIds({})).toMatchObject({ docs: [], files: [] });
  });
});

describe('publicPublicationFields', () => {
  it('tells the recipient only what concerns them', () => {
    const fields = publicPublicationFields(livePublication);
    expect(fields).toEqual({
      title: 'Flat 4 dispute', mode: 'snapshot',
      expires_at: null, issued_at: '2026-08-01T00:00:00Z',
    });
  });

  it('leaks no id, no version, and nothing about the author', () => {
    const json = JSON.stringify(publicPublicationFields({
      ...livePublication, created_by: 'u1', token_hash: 'deadbeef',
    }));
    for (const secret of ['pub1', 'p1', 'u1', 'deadbeef', 'manifest']) {
      expect(json).not.toContain(secret);
    }
  });
});
