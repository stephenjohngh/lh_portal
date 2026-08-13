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

const {
  canListDocuments, canAccessDocument, sanitizeDocumentPatch, bearerToken,
  ENTITY_PARENT_TABLE, PATCHABLE_FIELDS,
} = await import('./documentAccess.js');

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

describe('canAccessDocument', () => {
  it('asks the same question of a fetched row', async () => {
    visible();
    const result = await canAccessDocument(
      { entity_type: 'dossier_pack', entity_id: 'e1' }, user);

    expect(result.ok).toBe(true);
    expect(h.from).toHaveBeenCalledWith('dossier_packs');
  });

  it('refuses a document on another user-s pack', async () => {
    // The by-id route returns select('*'), which includes provider_file_id —
    // all anyone needs to pull the bytes from the unauthenticated media proxy.
    hidden();
    expect((await canAccessDocument(
      { entity_type: 'dossier_pack', entity_id: 'theirs' }, user)).ok).toBe(false);
  });

  it('refuses a document with no owning entity, for a non-admin', async () => {
    expect((await canAccessDocument({}, user)).ok).toBe(false);
    expect((await canAccessDocument({}, admin)).ok).toBe(true);
  });
});

describe('sanitizeDocumentPatch', () => {
  it('keeps editable metadata', () => {
    const { patch, rejected } = sanitizeDocumentPatch({
      description: 'Served by post', display_name: 'Notice',
    });
    expect(patch).toEqual({ description: 'Served by post', display_name: 'Notice' });
    expect(rejected).toEqual([]);
  });

  it('rejects the columns authorisation is decided BY', () => {
    // Without this an uploader could attach their own file to somebody else's
    // owner-scoped pack, and it would then be listed on that pack's shelf.
    const { patch, rejected } = sanitizeDocumentPatch({
      description: 'ok', entity_type: 'dossier_pack', entity_id: 'victim-pack',
    });
    expect(patch).toEqual({ description: 'ok' });
    expect(rejected).toEqual(['entity_type', 'entity_id']);
  });

  it('rejects storage identity and the drift baseline', () => {
    const { rejected } = sanitizeDocumentPatch({
      provider_file_id: 'x', file_checksum: 'y', filename: 'z',
      mime_type: 'text/html', file_size: 1, uploaded_by: 'someone',
    });
    expect(rejected.sort()).toEqual([
      'file_checksum', 'file_size', 'filename', 'mime_type',
      'provider_file_id', 'uploaded_by',
    ]);
  });

  it('copes with nothing at all', () => {
    expect(sanitizeDocumentPatch()).toEqual({ patch: {}, rejected: [] });
    expect(sanitizeDocumentPatch(null)).toEqual({ patch: {}, rejected: [] });
  });

  it('never admits a column that decides access', () => {
    for (const field of ['entity_type', 'entity_id', 'provider_file_id',
                         'file_checksum', 'uploaded_by', 'id']) {
      expect(PATCHABLE_FIELDS).not.toContain(field);
    }
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
