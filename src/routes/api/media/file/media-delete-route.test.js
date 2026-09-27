// src/routes/api/media/file/media-delete-route.test.js
//
// DELETE /api/media/file — the provider-routed deleter.
//
// ⛔ WHAT THIS PINS, AND WHY IT IS NOT TIDINESS. The route it replaced handed
// every file to the GLOBALLY ACTIVE provider. That is a fact about today's
// configuration, not about the file, so changing STORAGE_PROVIDER made
// everything written before it undeletable — 30 files accumulated exactly that
// way and had to be removed by a one-off script. PROJECT_STATUS §6hh.
//
// The decisive test is `routes each file to its OWN provider`: it deletes a
// Supabase object and a Drive file in ONE request, which the old route could
// not do at all — a Supabase path failed its /^[A-Za-z0-9_-]+$/ guard before
// reaching any provider.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb } from './fakeDb.js';

const ME    = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const driveDelete    = vi.fn();
const h = vi.hoisted(() => ({ db: /** @type {any} */ (null) }));
const supabaseDelete = vi.fn();
const requireAuth    = vi.fn();

vi.mock('$lib/server/storage/index.js', () => ({
  providerByName: (name) => ({
    google_drive: { name: 'google_drive', deleteFile: (...a) => driveDelete(...a) },
    supabase:     { name: 'supabase',     deleteFile: (...a) => supabaseDelete(...a) },
  }[name] ?? null),
}));
vi.mock('$lib/server/storage/storageErrors.js', () => ({
  friendlyStorageError: (e) => String(e?.message ?? e),
}));
vi.mock('$lib/server/requireAuth.js', () => ({ requireAuth: (...a) => requireAuth(...a) }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('$env/static/public',  () => ({ PUBLIC_SUPABASE_URL: 'http://x' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'test-secret' } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t) => h.db.from(t) }) }));

const { DELETE } = await import('./+server.js');

const DRIVE = 'https://drive.google.com/uc?export=view&id=ABC_123';
const SB    = 'https://x.supabase.co/storage/v1/object/public/inspection-photos/walk/a.jpg';
const PLANS = 'https://x.supabase.co/storage/v1/object/public/plan-images/ground.png';

const call = (body) => DELETE({ request: { json: () => Promise.resolve(body) } });

// The routing tests below are about WHERE a delete goes, so the caller owns
// every attachment; the ownership rules have their own block.
const ownedRows = () => ({
  document_library:      [],
  media_attachments:     [{ id: 'a', storage_url: DRIVE, created_by: ME }, { id: 'b', storage_url: SB, created_by: ME }],
  maintenance_documents: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  h.db = fakeDb(ownedRows());
  requireAuth.mockResolvedValue({ user: { id: ME }, isAdmin: false, error: null });
  driveDelete.mockResolvedValue(undefined);
  supabaseDelete.mockResolvedValue(undefined);
});

describe('auth and input', () => {
  it('refuses without a session, before touching storage', async () => {
    requireAuth.mockResolvedValue({ error: new Response(null, { status: 401 }) });
    const res = await call({ files: [{ url: DRIVE }] });
    expect(res.status).toBe(401);
    expect(driveDelete).not.toHaveBeenCalled();
  });

  it('rejects a body that is not a file list', async () => {
    expect((await call({})).status).toBe(400);
    expect((await DELETE({ request: { json: () => Promise.reject(new Error('x')) } })).status).toBe(400);
  });

  it('bounds the batch so one request cannot fan out indefinitely', async () => {
    const files = Array.from({ length: 201 }, () => ({ url: DRIVE }));
    expect((await call({ files })).status).toBe(400);
  });
});

describe('routing', () => {
  // ⭐ The whole point of the change, in one assertion.
  it('routes each file to its OWN provider in a single request', async () => {
    const res = await call({ files: [
      { url: DRIVE, provider: 'google_drive' },
      { url: SB,    provider: 'supabase' },
    ] });
    expect(driveDelete).toHaveBeenCalledWith('ABC_123', undefined);
    expect(supabaseDelete).toHaveBeenCalledWith('walk/a.jpg', { bucket: 'inspection-photos' });
    await expect(res.json()).resolves.toMatchObject({ deleted: 2, failed: 0 });
  });

  // ⚠ Every row written before this fix has a null provider, so inference is
  // the main path for the existing table, not a fallback.
  it('infers the provider when the row does not record one', async () => {
    await call({ files: [{ url: DRIVE, provider: null }, { url: SB }] });
    expect(driveDelete).toHaveBeenCalledWith('ABC_123', undefined);
    expect(supabaseDelete).toHaveBeenCalledWith('walk/a.jpg', { bucket: 'inspection-photos' });
  });

  it('passes the bucket the URL names, not a configured default', async () => {
    await call({ files: [{ url: SB, provider: 'supabase' }] });
    expect(supabaseDelete.mock.calls[0][1]).toEqual({ bucket: 'inspection-photos' });
  });
});

describe('failures are reported, never swallowed', () => {
  // ⛔ The old client-side deleter discarded every outcome, which is how
  // undeletable files went unnoticed for months.
  it('reports an unaddressable file instead of silently skipping it', async () => {
    const res = await call({ files: [{ url: 'https://example.com/x.jpg' }] });
    const body = await res.json();
    expect(body).toMatchObject({ deleted: 0, failed: 1 });
    expect(body.results[0].error).toBeTruthy();
    expect(driveDelete).not.toHaveBeenCalled();
  });

  it('refuses the schematics bucket and says so', async () => {
    const res = await call({ files: [{ url: PLANS, provider: 'supabase' }] });
    const body = await res.json();
    expect(body.failed).toBe(1);
    expect(body.results[0].error).toMatch(/plan-images/);
    expect(supabaseDelete).not.toHaveBeenCalled();
  });

  it('treats already-gone as success, and a real error as failure', async () => {
    driveDelete.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 404 }));
    await expect((await call({ files: [{ url: DRIVE }] })).json())
      .resolves.toMatchObject({ deleted: 1, failed: 0 });

    driveDelete.mockRejectedValueOnce(new Error('permission denied'));
    const body = await (await call({ files: [{ url: DRIVE }] })).json();
    expect(body).toMatchObject({ deleted: 0, failed: 1 });
    expect(body.results[0].error).toMatch(/permission denied/);
  });

  // One bad file must not abandon the rest of the batch.
  it('keeps going after a failure', async () => {
    driveDelete.mockRejectedValueOnce(new Error('boom'));
    const body = await (await call({ files: [{ url: DRIVE }, { url: SB }] })).json();
    expect(body).toMatchObject({ deleted: 1, failed: 1 });
    expect(supabaseDelete).toHaveBeenCalled();
  });
});

describe('who may delete what (security review, 2026-09-27)', () => {
  it('refuses a file no attachment names — anything else in the Drive', async () => {
    const body = await (await call({ files: [{ url: 'https://drive.google.com/uc?export=view&id=NOT_OURS' }] })).json();
    expect(body).toMatchObject({ deleted: 0, failed: 1 });
    expect(driveDelete).not.toHaveBeenCalled();
  });

  it('refuses a library document, even for an admin', async () => {
    h.db = fakeDb({ ...ownedRows(), document_library: [{ id: 'd', provider_file_id: 'ABC_123', entity_type: 'gt_document' }] });
    requireAuth.mockResolvedValue({ user: { id: ME }, isAdmin: true, error: null });
    const body = await (await call({ files: [{ url: DRIVE }] })).json();
    expect(body.failed).toBe(1);
    expect(body.results[0].error).toMatch(/library document/);
    expect(driveDelete).not.toHaveBeenCalled();
  });

  it('refuses someone else’s photo to a non-admin, and allows it to an admin', async () => {
    h.db = fakeDb({ ...ownedRows(), media_attachments: [{ id: 'a', storage_url: DRIVE, created_by: OTHER }] });
    expect((await (await call({ files: [{ url: DRIVE }] })).json()).failed).toBe(1);
    expect(driveDelete).not.toHaveBeenCalled();

    requireAuth.mockResolvedValue({ user: { id: ME }, isAdmin: true, error: null });
    expect((await (await call({ files: [{ url: DRIVE }] })).json()).deleted).toBe(1);
  });

  // Anyone signed in can insert an attachment row. Pointing one at another
  // person's photo must not make that photo theirs to delete.
  it('refuses when a row of the caller’s sits beside someone else’s', async () => {
    h.db = fakeDb({ ...ownedRows(), media_attachments: [
      { id: 'mine',   storage_url: DRIVE, created_by: ME },
      { id: 'theirs', storage_url: DRIVE, created_by: OTHER },
    ] });
    expect((await (await call({ files: [{ url: DRIVE }] })).json()).failed).toBe(1);
    expect(driveDelete).not.toHaveBeenCalled();
  });

  it('lets the uploader of a legacy maintenance document delete its file', async () => {
    h.db = fakeDb({ document_library: [], media_attachments: [], maintenance_documents: [{ id: 'x', storage_path: DRIVE, uploaded_by: ME }] });
    expect((await (await call({ files: [{ url: DRIVE }] })).json()).deleted).toBe(1);
  });

  it('fails closed when the check cannot run', async () => {
    h.db = fakeDb(ownedRows(), { failTable: 'media_attachments' });
    const body = await (await call({ files: [{ url: DRIVE }] })).json();
    expect(body.failed).toBe(1);
    expect(driveDelete).not.toHaveBeenCalled();
  });
});
