// src/routes/api/media/file/[fileId]/media-file.test.js
//
// Regression tests for the media proxy. This endpoint shipped a ReferenceError
// (a missing import) that turned every image and PDF fetch into an opaque 404,
// twice, because nothing exercised it: `npm run check` runs with checkJs off,
// so an undefined identifier in a .js route is invisible to the CI gate.
// Calling GET once would have caught it, so now something does.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getFileStream: vi.fn(),
  requireAuth:   vi.fn(() => Promise.resolve({ user: { id: 'u1' } })),
}));

vi.mock('$lib/server/storage/index.js', () => ({
  storageProvider: { getFileStream: h.getFileStream, deleteFile: vi.fn() },
}));
vi.mock('$lib/server/storage/storageErrors.js', () => ({
  friendlyStorageError: (e) => String(e?.message ?? e),
}));
vi.mock('$lib/server/requireAuth.js', () => ({ requireAuth: h.requireAuth }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { GET } = await import('./+server.js');

/** Build the args SvelteKit hands an endpoint. */
const call = (fileId, search = '') =>
  GET({ params: { fileId }, url: new URL(`http://x/api/media/file/${fileId}${search}`) });

beforeEach(() => {
  vi.clearAllMocks();
  h.getFileStream.mockResolvedValue({
    data: Buffer.from('bytes'), mimeType: 'application/octet-stream',
  });
  // Silence the endpoint's console.error in the failure test.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/media/file/[fileId]', () => {
  it('serves the bytes with the provider-reported type', async () => {
    h.getFileStream.mockResolvedValueOnce({
      data: Buffer.from('bytes'), mimeType: 'image/png',
    });
    const res = await call('abc123');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('honours a declarable mime hint over the provider', async () => {
    // The point of the hint: files uploaded before the type was captured
    // properly are stored as octet-stream and would download, not render.
    const res = await call('abc123', '?mime=application%2Fpdf');
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('ignores a hint it will not declare, keeping the provider type', async () => {
    // A URL parameter must never relabel a file as something executable.
    for (const bad of ['text%2Fhtml', 'image%2Fsvg%2Bxml', 'nonsense']) {
      const res = await call('abc123', `?mime=${bad}`);
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    }
  });

  it('rejects a file id the storage layer would not accept', async () => {
    const res = await call('has/slash');
    expect(res.status).toBe(400);
    expect(h.getFileStream).not.toHaveBeenCalled();
  });

  it('returns an opaque 404 when the fetch fails, without leaking details', async () => {
    h.getFileStream.mockRejectedValueOnce(new Error('drive exploded: secret path'));
    const res = await call('abc123');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('File not found or inaccessible');
    expect(JSON.stringify(body)).not.toContain('secret path');
    // …but the operator still gets the cause.
    expect(console.error).toHaveBeenCalled();
  });
});
