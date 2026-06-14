// src/routes/api/media/upload/upload.test.js
//
// Authenticated media upload. Pins the gate (no token → no storage call) and
// the size limit, and confirms a rejected request never touches the provider.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  let auth;
  return {
    getAuth: () => auth,
    setAuth: (a) => { auth = a; },
    ensurePath: vi.fn(() => Promise.resolve('dest')),
    uploadFile: vi.fn(() => Promise.resolve({ publicUrl: 'https://store/x.jpg', fileId: 'f1' })),
  };
});

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('$lib/server/requireAuth', () => ({ requireAuth: () => Promise.resolve(h.getAuth()) }));
vi.mock('$lib/server/storage/index.js', () => ({
  storageProvider: { ensurePath: h.ensurePath, uploadFile: h.uploadFile },
  storageProviderName: 'supabase',
}));

const { POST } = await import('./+server.js');

// Build a request whose formData() yields a file of the given size (bytes).
function uploadReq(sizeBytes = 10) {
  const file = new File([new Uint8Array(sizeBytes)], 'photo.jpg', { type: 'image/jpeg' });
  const fd = new FormData();
  fd.set('file', file);
  fd.set('filename', 'photo.jpg');
  fd.set('folder_path', JSON.stringify(['inspection-sessions', 'abc']));
  return { formData: () => Promise.resolve(fd) };
}
// A request with no file field at all.
const noFileReq = () => ({ formData: () => Promise.resolve(new FormData()) });

beforeEach(() => {
  vi.clearAllMocks();
  h.setAuth({ user: { id: 'u1', email: 'u@x' }, error: null });
});

describe('POST /api/media/upload', () => {
  it('rejects unauthenticated requests and never touches storage', async () => {
    h.setAuth({ error: { status: 401 } });
    const res = await POST({ request: uploadReq() });
    expect(res.status).toBe(401);
    expect(h.uploadFile).not.toHaveBeenCalled();
  });

  it('400s when no file is provided', async () => {
    const res = await POST({ request: noFileReq() });
    expect(res.status).toBe(400);
    expect(h.uploadFile).not.toHaveBeenCalled();
  });

  it('413s a file over the 20 MB limit, before uploading', async () => {
    const res = await POST({ request: uploadReq(20 * 1024 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(h.uploadFile).not.toHaveBeenCalled();
  });

  it('uploads on the happy path and returns the URL', async () => {
    const res = await POST({ request: uploadReq() });
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://store/x.jpg');
    expect(h.uploadFile).toHaveBeenCalledTimes(1);
  });
});
