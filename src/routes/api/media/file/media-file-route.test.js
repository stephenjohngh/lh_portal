// src/routes/api/media/file/media-file-route.test.js
//
// Characterisation tests for the unauthenticated media proxy's file-id guard.
//
// This exists to pin ONE documented trap. The guard is `/^[A-Za-z0-9_-]+$/`,
// which fits Google Drive and OneDrive file ids — opaque, flat, no separators.
// The **Supabase** storage provider does not use ids at all: it uses file
// PATHS (`getFileStream(filePath)`, `filePath.split('/')`), which contain `/`
// and `.` and are therefore rejected here with a 400.
//
// So switching STORAGE_PROVIDER to `supabase` would silently break every
// inspection photo and every Dossier asset preview — not at boot, not at
// upload, but at read time, as a 400 per image. The active provider is
// google_drive, so this is latent rather than live.
//
// ⚠ These tests assert the CURRENT behaviour, including the broken case. If
// the proxy is ever taught to serve Supabase paths, the "rejects" expectation
// below is the one to change — deliberately, having read this note.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getFileStream = vi.fn();

vi.mock('$lib/server/storage/index.js', () => ({
  storageProvider: {
    name: 'google_drive',
    getFileStream: (...args) => getFileStream(...args),
    deleteFile: vi.fn(),
  },
}));
vi.mock('$lib/server/storage/storageErrors.js', () => ({
  friendlyStorageError: (e) => String(e?.message ?? e),
}));
vi.mock('$lib/server/requireAuth.js', () => ({ requireAuth: vi.fn() }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('$lib/utils/mimeTypes', () => ({ declarableMime: (m) => m }));

const { GET } = await import('./[fileId]/+server.js');

const call = (fileId) =>
  GET({ params: { fileId }, url: new URL(`http://localhost/api/media/file/${fileId}`) });

beforeEach(() => {
  getFileStream.mockReset();
  getFileStream.mockResolvedValue({
    data: Buffer.from('bytes'),
    mimeType: 'image/jpeg',
  });
});

describe('media proxy file-id guard', () => {
  it('serves a Drive-style id', async () => {
    const res = await call('1AbC_dEfGhIjKlMnOpQrStUvWxYz-0123');
    expect(res.status).toBe(200);
    expect(getFileStream).toHaveBeenCalledWith('1AbC_dEfGhIjKlMnOpQrStUvWxYz-0123');
  });

  it('rejects an empty id without calling storage', async () => {
    const res = await call('');
    expect(res.status).toBe(400);
    expect(getFileStream).not.toHaveBeenCalled();
  });

  it('rejects path traversal, and never reaches the provider', async () => {
    // The guard is the only thing between an unauthenticated caller and
    // whatever the provider would do with a crafted path.
    for (const bad of ['..', '../secret', 'a/../../b', '%2e%2e']) {
      const res = await call(bad);
      expect(res.status, bad).toBe(400);
    }
    expect(getFileStream).not.toHaveBeenCalled();
  });

  it('rejects anything with a separator or a dot', async () => {
    for (const bad of ['a/b', 'a.b', 'a b', 'a:b', 'a?b']) {
      expect((await call(bad)).status, bad).toBe(400);
    }
  });

  // ⚠ THE TRAP, pinned. This is not a bug being asserted as correct — it is a
  // known limitation being made visible, so a provider switch cannot break
  // images silently. See the header note.
  it('rejects a Supabase-style storage PATH — the latent provider-switch break', async () => {
    const supabasePath = 'inspection-photos/2026/06/abc123.jpg';
    const res = await call(supabasePath);
    expect(res.status).toBe(400);
    expect(getFileStream).not.toHaveBeenCalled();
  });

  it('returns 404, not 500, when the provider cannot find the file', async () => {
    // Drive answers "not found" for a file the caller cannot see, so this path
    // is also what an unauthorised guess looks like. It must not leak which.
    getFileStream.mockRejectedValue(new Error('File not found'));
    const res = await call('missingbutwellformedid');
    expect(res.status).toBe(404);
  });
});
