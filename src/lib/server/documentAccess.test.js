// src/lib/server/documentAccess.test.js
// The per-entity gate on GET /api/documents (P3 carry-forward).
//
// What was wrong: the listing runs with the SERVICE ROLE, so RLS does not
// apply, and the route checked only that the caller was signed in. Any
// authenticated user could therefore ask for the attachments of any entity —
// including another user's Dossier pack, which is owner-scoped precisely
// because it holds client-confidential material.
//
// So the tests below are mostly about refusing, and about refusing by default.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ maybeSingle: vi.fn(), from: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args) => {
      h.from(...args);
      return {
        select: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }),
      };
    },
  }),
}));
vi.mock('$env/static/public', () => ({
  PUBLIC_SUPABASE_URL: 'http://x', PUBLIC_SUPABASE_ANON_KEY: 'anon',
}));

const { canListDocuments, bearerToken, ENTITY_PARENT_TABLE } =
  await import('./documentAccess.js');

const user  = { isAdmin: false, token: 'caller-token' };
const admin = { isAdmin: true,  token: 'admin-token' };

/** RLS let the caller see the parent row. */
const visible = () => h.maybeSingle.mockResolvedValueOnce({ data: { id: 'e1' }, error: null });
/** RLS returned nothing — not theirs, or not there. Indistinguishable. */
const hidden  = () => h.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

beforeEach(() => { vi.clearAllMocks(); });

describe('canListDocuments — the entity gate', () => {
  it('allows a caller who can read the parent row', async () => {
    visible();
    const result = await canListDocuments(
      { entity_type: 'dossier_pack', entity_id: 'e1' }, user);

    expect(result.ok).toBe(true);
    expect(h.from).toHaveBeenCalledWith('dossier_packs');
  });

  it('refuses a caller who cannot — the hole this closes', async () => {
    // Another user's Dossier pack. Before this gate, the filenames,
    // descriptions and storage ids came straight back.
    hidden();
    const result = await canListDocuments(
      { entity_type: 'dossier_pack', entity_id: 'someone-elses' }, user);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('asks the database rather than re-implementing each app-s rules', async () => {
    // Two copies of a permission rule drift apart, and the copy here would be
    // invisible to whoever changes the policy.
    visible();
    await canListDocuments({ entity_type: 'info_note', entity_id: 'n1' }, user);
    expect(h.from).toHaveBeenCalledWith('info_notes');
  });

  it('gives the same refusal whether the row is hidden or absent', async () => {
    hidden();
    const a = await canListDocuments({ entity_type: 'issue', entity_id: 'nope' }, user);
    h.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const b = await canListDocuments({ entity_type: 'issue', entity_id: 'nope' }, user);

    expect(a).toEqual(b);
  });
});

describe('canListDocuments — failing closed', () => {
  it('refuses an entity type it does not know', async () => {
    // A new attachable entity is unreachable until someone decides who may see
    // it — the right default for a table holding every app's files.
    const result = await canListDocuments(
      { entity_type: 'something_new', entity_id: 'e1' }, user);

    expect(result.ok).toBe(false);
    expect(h.from).not.toHaveBeenCalled();
  });

  it('refuses an unknown type even for an admin', async () => {
    const result = await canListDocuments(
      { entity_type: 'something_new', entity_id: 'e1' }, admin);
    expect(result.ok).toBe(false);
  });

  it('refuses a non-admin listing with no entity at all', async () => {
    // An unscoped listing is a browse of the whole library across every app.
    for (const query of [{}, { entity_type: 'issue' }, { entity_id: 'e1' }]) {
      const result = await canListDocuments(query, user);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
    }
  });

  it('refuses a non-admin with no token', async () => {
    const result = await canListDocuments(
      { entity_type: 'issue', entity_id: 'e1' }, { isAdmin: false, token: '' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });
});

describe('canListDocuments — admins', () => {
  it('may browse the whole library', async () => {
    expect((await canListDocuments({}, admin)).ok).toBe(true);
  });

  it('skips the parent lookup, because the answer would be the same', async () => {
    const result = await canListDocuments(
      { entity_type: 'dossier_pack', entity_id: 'anyone-s' }, admin);

    expect(result.ok).toBe(true);
    expect(h.maybeSingle).not.toHaveBeenCalled();
  });
});

describe('ENTITY_PARENT_TABLE', () => {
  it('covers every entity type the portal attaches documents to', () => {
    // Kept as an explicit list: a missing one fails closed, which is safe but
    // breaks a working panel, so the set is worth pinning.
    expect(Object.keys(ENTITY_PARENT_TABLE).sort()).toEqual([
      'component_inspection', 'dossier_pack', 'gt_document', 'info_note',
      'issue', 'maintenance_document', 'mor_case',
    ]);
  });

  it('maps maintenance_document to the JOB table', () => {
    // Its entity_id is a maintenance job id, not a document id — the name
    // describes the attachment, not the parent. Exactly what a hand-written
    // mapping gets wrong.
    expect(ENTITY_PARENT_TABLE.maintenance_document).toBe('maintenance_jobs');
  });
});

describe('bearerToken', () => {
  it('extracts the token, and copes with its absence', () => {
    const req = (value) => ({ headers: { get: () => value } });
    expect(bearerToken(req('Bearer abc123'))).toBe('abc123');
    expect(bearerToken(req('bearer abc123'))).toBe('abc123');
    expect(bearerToken(req(null))).toBe('');
    expect(bearerToken(undefined)).toBe('');
  });
});
