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

const driveDelete    = vi.fn();
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

const { DELETE } = await import('./+server.js');

const DRIVE = 'https://drive.google.com/uc?export=view&id=ABC_123';
const SB    = 'https://x.supabase.co/storage/v1/object/public/inspection-photos/walk/a.jpg';
const PLANS = 'https://x.supabase.co/storage/v1/object/public/plan-images/ground.png';

const call = (body) => DELETE({ request: { json: () => Promise.resolve(body) } });

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ error: null });
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
