// src/routes/api/management/activities/[id]/activity-delete.test.js
// Deleting a document activity deletes its document too (2026-09-27): it used
// to leave the file in the library and in Drive with nothing pointing at it.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  auth: /** @type {any} */ ({ user: { id: 'u1' }, isAdmin: false, error: null }),
  activity: /** @type {any} */ (null),
  doc: /** @type {any} */ (null),
  othersNaming: 0,
  deleted: /** @type {string[]} */ ([]),
  deleteDocument: vi.fn(),
}));

vi.mock('$app/env/public', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('public', { PUBLIC_SUPABASE_URL: 'http://x' }));
vi.mock('$app/env/private', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('private', { SUPABASE_SERVICE_ROLE_KEY: 'svc' }));
vi.mock('#lib/server/requireAuth.js', () => ({ requireAuth: async () => h.auth }));
vi.mock('#lib/server/documentLibrary.js', () => ({ deleteDocument: (...a) => h.deleteDocument(...a) }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      const q = {
        _head: false,
        select(_c, opts) { q._head = !!opts?.head; return q; },
        eq() { return q; },
        neq() { return q; },
        delete() { return { eq: async (_c, id) => { h.deleted.push(`${table}:${id}`); return { error: null }; } }; },
        maybeSingle: async () => ({ data: table === 'activities' ? h.activity : h.doc, error: null }),
        then(res) { return Promise.resolve({ count: h.othersNaming, error: null }).then(res); },
      };
      return q;
    },
  }),
}));

const { DELETE } = await import('./+server.js');
const call = () => DELETE({ params: { id: 'act1' }, request: new Request('http://x') });

const recent = () => new Date(Date.now() - 10 * 60_000).toISOString();
const old    = () => new Date(Date.now() - 5 * 3_600_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { user: { id: 'u1' }, isAdmin: false, error: null };
  h.activity = { id: 'act1', issue_id: 'iss1', activity_type: 'document', created_by: 'u1', created_at: recent(), fields: { doc_id: 'doc1' } };
  h.doc = { id: 'doc1', entity_type: 'issue', entity_id: 'iss1' };
  h.othersNaming = 0;
  h.deleted = [];
  h.deleteDocument.mockImplementation(async (id) => { h.deleted.push(`document:${id}`); });
});

describe('DELETE /api/management/activities/:id', () => {
  it('deletes the document first, then the activity', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.deleted).toEqual(['document:doc1', 'activities:act1']);
    await expect(res.json()).resolves.toMatchObject({ documentDeleted: true });
  });

  it('lets the author delete their own within two hours, and nobody else but an admin', async () => {
    h.activity.created_at = old();
    expect((await call()).status).toBe(403);
    h.activity.created_at = recent(); h.activity.created_by = 'someone-else';
    expect((await call()).status).toBe(403);
    expect(h.deleted).toEqual([]);
    h.auth.isAdmin = true;
    expect((await call()).status).toBe(200);
  });

  it('keeps the activity when its document cannot be deleted, so the two never drift apart', async () => {
    h.deleteDocument.mockRejectedValueOnce(new Error('drive busy'));
    const res = await call();
    expect(res.status).toBe(502);
    expect(h.deleted).toEqual([]);
  });

  it('never deletes a document that belongs elsewhere, or that another activity names', async () => {
    h.doc = { id: 'doc1', entity_type: 'dossier_pack', entity_id: 'p1' };
    await call();
    expect(h.deleteDocument).not.toHaveBeenCalled();
    expect(h.deleted).toEqual(['activities:act1']);

    h.deleted = []; h.doc = { id: 'doc1', entity_type: 'issue', entity_id: 'iss1' }; h.othersNaming = 1;
    await call();
    expect(h.deleteDocument).not.toHaveBeenCalled();
  });

  it('deletes an ordinary activity as before', async () => {
    h.activity = { ...h.activity, activity_type: 'comment', fields: null };
    await call();
    expect(h.deleteDocument).not.toHaveBeenCalled();
    expect(h.deleted).toEqual(['activities:act1']);
  });

  it('404s an activity that is not there', async () => {
    h.activity = null;
    expect((await call()).status).toBe(404);
  });
});
