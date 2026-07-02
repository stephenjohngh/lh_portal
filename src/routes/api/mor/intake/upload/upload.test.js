// src/routes/api/mor/intake/upload/upload.test.js
//
// The public (unauthenticated) photo-upload endpoint relies entirely on its
// defence layers. These pin the security rejections in order: same-origin,
// rate limit, magic-byte/brand validation, and Vision SafeSearch. (The storage
// success path is data-flow, mocked away here.)

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  let sameOrigin = true, allowed = true, scan = { safe: true };
  return {
    isSameOrigin: () => sameOrigin,
    checkRateLimit: () => Promise.resolve(allowed),
    safeSearchScan: () => Promise.resolve(scan),
    ensurePath: vi.fn(() => Promise.resolve({})),
    setOrigin: (v) => { sameOrigin = v; },
    setAllowed: (v) => { allowed = v; },
    setScan: (s) => { scan = s; },
  };
});

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('$lib/server/verifyOrigin.js', () => ({ isSameOrigin: h.isSameOrigin }));
vi.mock('$lib/server/publicRateLimit.js', () => ({ checkRateLimit: h.checkRateLimit }));
vi.mock('$lib/server/visionScan.js', () => ({ safeSearchScan: h.safeSearchScan }));
vi.mock('$lib/server/storage/index.js', () => ({ storageProvider: { ensurePath: h.ensurePath }, storageProviderName: 'supabase' }));
vi.mock('$lib/server/urlSignature.js', () => ({ signUrl: () => 'test-sig' }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');

// Build a request whose formData() yields a file with the given bytes.
function uploadReq(bytes) {
  const file = new File([new Uint8Array(bytes)], 'photo.jpg', { type: 'image/jpeg' });
  const fd = new FormData();
  fd.set('file', file);
  fd.set('folder_path', JSON.stringify(['mor-public-intake', 'CASE-1']));
  fd.set('filename', 'photo.jpg');
  return { headers: { get: () => null }, formData: () => Promise.resolve(fd), url: { origin: 'https://app' } };
}
const JPEG = [0xFF, 0xD8, 0xFF, ...Array(13).fill(0)];   // valid magic bytes, 16 bytes
const NOT_IMAGE = Array(16).fill(0x41);                  // 'AAAA…' — no image signature

beforeEach(() => { vi.clearAllMocks(); h.setOrigin(true); h.setAllowed(true); h.setScan({ safe: true }); });

describe('POST /api/mor/intake/upload (defence layers)', () => {
  it('rejects cross-origin (403) before anything else', async () => {
    h.setOrigin(false);
    const res = await POST({ request: uploadReq(JPEG), url: { origin: 'https://app' } });
    expect(res.status).toBe(403);
  });

  it('rejects when rate-limited (429)', async () => {
    h.setAllowed(false);
    const res = await POST({ request: uploadReq(JPEG), url: { origin: 'https://app' } });
    expect(res.status).toBe(429);
  });

  it('rejects a non-image by magic bytes (422), never reaching storage', async () => {
    const res = await POST({ request: uploadReq(NOT_IMAGE), url: { origin: 'https://app' } });
    expect(res.status).toBe(422);
    expect(h.ensurePath).not.toHaveBeenCalled();
  });

  it('rejects an image that fails the Vision SafeSearch scan (422)', async () => {
    h.setScan({ safe: false, reason: 'Adult content detected' });
    const res = await POST({ request: uploadReq(JPEG), url: { origin: 'https://app' } });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/adult/i);
    expect(h.ensurePath).not.toHaveBeenCalled();
  });
});
