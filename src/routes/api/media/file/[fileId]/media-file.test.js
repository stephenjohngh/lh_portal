// src/routes/api/media/file/[fileId]/media-file.test.js
//
// The media proxy: who may use it, and what it serves bytes AS.
//
// It shipped a ReferenceError (a missing import) that turned every image and
// PDF fetch into an opaque 404, twice, because nothing exercised it — so these
// call GET for real. Since the security review (2026-09-27) it also needs a
// media session cookie and a file the portal knows; these tests go through the
// real $lib/server/mediaAccess.js rules against a stand-in database.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeDb } from '../fakeDb.js';

const h = vi.hoisted(() => ({ getFileStream: vi.fn(), db: /** @type {any} */ (null) }));

vi.mock('$env/static/public',  () => ({ PUBLIC_SUPABASE_URL: 'http://x' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'test-secret' } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t) => h.db.from(t) }) }));
vi.mock('$lib/server/storage/index.js', () => ({
  storageProvider: { getFileStream: h.getFileStream, deleteFile: vi.fn() },
}));
vi.mock('$lib/server/storage/storageErrors.js', () => ({
  friendlyStorageError: (e) => String(e?.message ?? e),
}));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { GET } = await import('./+server.js');
const { mediaSessionValue } = await import('$lib/server/mediaAccess.js');

const USER   = '11111111-1111-4111-8111-111111111111';
const ADMIN  = '22222222-2222-4222-8222-222222222222';
const GONE   = '33333333-3333-4333-8333-333333333333';

const tables = () => ({
  profiles:        [{ id: USER, is_admin: false }, { id: ADMIN, is_admin: true }],
  app_permissions: [{ user_id: USER, app_id: 'maintenance' }],
  document_library: [
    { id: 'd1', provider_file_id: 'doc123',  entity_type: 'issue', filename: 'Minutes.pdf', mime_type: 'application/pdf' },
    { id: 'd2', provider_file_id: 'page123', entity_type: 'issue', filename: 'page.html',   mime_type: 'text/html' },
    { id: 'd3', provider_file_id: 'lic123',  entity_type: 'parking_agreement', filename: 'Licence.pdf', mime_type: 'application/pdf' },
  ],
  media_attachments: [
    { id: 'm1', storage_url: 'https://drive.google.com/uc?export=view&id=abc123', created_by: ADMIN, filename: null, mime_type: 'image/jpeg' },
  ],
  maintenance_documents: [],
});

/** Build the args SvelteKit hands an endpoint. */
const call = (fileId, { user = USER, search = '' } = {}) =>
  GET({
    params:  { fileId },
    url:     new URL(`http://x/api/media/file/${fileId}${search}`),
    cookies: { get: () => (user ? mediaSessionValue(user) : undefined) },
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.db = fakeDb(tables());
  h.getFileStream.mockResolvedValue({ data: Buffer.from('bytes'), mimeType: 'application/octet-stream' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('who may use the proxy', () => {
  it('refuses without a media session, before touching storage', async () => {
    const res = await call('abc123', { user: null });
    expect(res.status).toBe(401);
    expect(h.getFileStream).not.toHaveBeenCalled();
  });

  it('refuses a forged or foreign cookie', async () => {
    const res = await GET({
      params: { fileId: 'abc123' }, url: new URL('http://x/api/media/file/abc123'),
      cookies: { get: () => `${USER}.9999999999.${'a'.repeat(64)}` },
    });
    expect(res.status).toBe(401);
  });

  it('refuses a user who no longer exists, however valid their cookie', async () => {
    expect((await call('abc123', { user: GONE })).status).toBe(401);
  });

  it('refuses an id no portal record names — the Drive account holds more than the portal', async () => {
    const res = await call('someoneElsesDriveFile');
    expect(res.status).toBe(404);
    expect(h.getFileStream).not.toHaveBeenCalled();
  });

  it('holds a parking licence to the Parking grant', async () => {
    expect((await call('lic123')).status).toBe(404);
    expect((await call('lic123', { user: ADMIN })).status).toBe(200);
  });

  it('fails closed when the access lookup itself fails', async () => {
    h.db = fakeDb(tables(), { failTable: 'document_library' });
    expect((await call('doc123')).status).toBe(404);
    expect(h.getFileStream).not.toHaveBeenCalled();
  });
});

describe('what it serves the bytes as', () => {
  it('uses the portal record’s type and name', async () => {
    const res = await call('doc123');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toMatch(/^inline; filename="Minutes.pdf"/);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('serves a photo by the type its attachment row records', async () => {
    const res = await call('abc123');
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('honours a declarable hint when the record has no type', async () => {
    h.db = fakeDb({ ...tables(), media_attachments: [{ id: 'm', storage_url: 'uc?id=abc123', created_by: USER, mime_type: null }] });
    const res = await call('abc123', { search: '?mime=application%2Fpdf' });
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  // The review's stored-XSS finding: an uploaded page came back as text/html
  // from this origin. Whatever anyone says the type is, it now downloads.
  it('never serves an uploaded page as HTML, whoever says it is one', async () => {
    h.getFileStream.mockResolvedValueOnce({ data: Buffer.from('<script>x</script>'), mimeType: 'text/html' });
    const res = await call('page123', { search: '?mime=text%2Fhtml' });
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment;/);
    expect(res.headers.get('Content-Security-Policy')).toMatch(/sandbox/);
  });

  it('returns an opaque 404 when the fetch fails, without leaking details', async () => {
    h.getFileStream.mockRejectedValueOnce(new Error('drive exploded: secret path'));
    const res = await call('doc123');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('File not found or inaccessible');
    expect(JSON.stringify(body)).not.toContain('secret path');
    expect(console.error).toHaveBeenCalled();   // …but the operator still gets the cause
  });
});
