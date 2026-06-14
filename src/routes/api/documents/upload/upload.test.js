// src/routes/api/documents/upload/upload.test.js
//
// Authenticated document upload into document_library. Pins the gate and size
// limit, plus the security property: the uploader id is taken from the VERIFIED
// session (auth.user.id), never from form data — so it can't be spoofed.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  let auth;
  return {
    getAuth: () => auth,
    setAuth: (a) => { auth = a; },
    uploadDocument: vi.fn(() => Promise.resolve({ id: 'doc1' })),
  };
});

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('$lib/server/requireAuth', () => ({ requireAuth: () => Promise.resolve(h.getAuth()) }));
vi.mock('$lib/server/documentLibrary', () => ({ uploadDocument: h.uploadDocument }));

const { POST } = await import('./+server.js');

// Build a request whose formData() yields a file plus optional extra fields.
function uploadReq(sizeBytes = 10, extra = {}) {
  const file = new File([new Uint8Array(sizeBytes)], 'doc.pdf', { type: 'application/pdf' });
  const fd = new FormData();
  fd.set('file', file);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return { formData: () => Promise.resolve(fd) };
}
const noFileReq = () => ({ formData: () => Promise.resolve(new FormData()) });

beforeEach(() => {
  vi.clearAllMocks();
  h.setAuth({ user: { id: 'real-user', email: 'u@x' }, error: null });
});

describe('POST /api/documents/upload', () => {
  it('rejects unauthenticated requests and never uploads', async () => {
    h.setAuth({ error: { status: 401 } });
    const res = await POST({ request: uploadReq() });
    expect(res.status).toBe(401);
    expect(h.uploadDocument).not.toHaveBeenCalled();
  });

  it('400s when no file is provided', async () => {
    const res = await POST({ request: noFileReq() });
    expect(res.status).toBe(400);
    expect(h.uploadDocument).not.toHaveBeenCalled();
  });

  it('413s a file over the 50 MB limit, before uploading', async () => {
    const res = await POST({ request: uploadReq(50 * 1024 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(h.uploadDocument).not.toHaveBeenCalled();
  });

  it('stamps the uploader from the verified session, ignoring any form-supplied id', async () => {
    // A malicious uploader_id field in the body must NOT reach uploadDocument.
    const res = await POST({ request: uploadReq(10, { uploader_id: 'forged-admin' }) });
    expect(res.status).toBe(201);
    // uploadDocument(buffer, filename, mimeType, meta, userId) — last arg is the trusted id.
    const userIdArg = h.uploadDocument.mock.calls[0][4];
    expect(userIdArg).toBe('real-user');
  });
});
