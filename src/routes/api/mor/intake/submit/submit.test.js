// src/routes/api/mor/intake/submit/submit.test.js
//
// Public (unauthenticated) case-intake endpoint. Pins the security rejections:
// same-origin, rate limit, description validation, and — importantly — the
// photo-URL whitelist (a submitted photo URL must look like one our storage
// provider returned, so an attacker can't smuggle an arbitrary URL into a case).

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  let sameOrigin = true, allowed = true, urlTrusted = true, sigValid = true;
  return {
    isSameOrigin: () => sameOrigin,
    checkRateLimit: () => Promise.resolve(allowed),
    isTrustedStorageUrl: () => urlTrusted,
    verifyUrlSignature: () => sigValid,
    setOrigin: (v) => { sameOrigin = v; },
    setAllowed: (v) => { allowed = v; },
    setUrlTrusted: (v) => { urlTrusted = v; },
    setSigValid: (v) => { sigValid = v; },
  };
});

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: vi.fn(() => ({})) }) }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'https://proj.supabase.co' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'svc' } }));
vi.mock('$lib/server/publicRateLimit.js', () => ({ checkRateLimit: h.checkRateLimit }));
vi.mock('$lib/server/verifyOrigin.js', () => ({ isSameOrigin: h.isSameOrigin, isTrustedStorageUrl: h.isTrustedStorageUrl }));
vi.mock('$lib/server/urlSignature.js', () => ({ verifyUrlSignature: h.verifyUrlSignature }));
vi.mock('$lib/utils/caseVerificationCode', () => ({ generateVerificationCode: () => 'R7PQK2', formatVerificationCode: (c) => c }));
vi.mock('$lib/server/auditLogger', () => ({ logAudit: vi.fn(), getIpAddress: () => '1.2.3.4', getUserAgent: () => 'ua' }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');
// POST receives { request, url } — pass them separately.
const call = (body) => POST({
  request: { json: () => Promise.resolve(body), headers: { get: () => null } },
  url: { origin: 'https://app' },
});
const okDescription = 'A genuine hazard report that is at least twenty characters long.';

beforeEach(() => { vi.clearAllMocks(); h.setOrigin(true); h.setAllowed(true); h.setUrlTrusted(true); h.setSigValid(true); });

describe('POST /api/mor/intake/submit (security rejections)', () => {
  it('rejects cross-origin (403)', async () => {
    h.setOrigin(false);
    expect((await call({ description: okDescription })).status).toBe(403);
  });

  it('rejects when rate-limited (429)', async () => {
    h.setAllowed(false);
    expect((await call({ description: okDescription })).status).toBe(429);
  });

  it('400s a too-short description', async () => {
    const res = await call({ description: 'too short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/20 characters/i);
  });

  it('rejects an untrusted photo URL (400) — the whitelist guard', async () => {
    h.setUrlTrusted(false);
    const res = await call({ description: okDescription, photos: [{ url: 'https://evil.example/x.jpg', sig: 'a'.repeat(64) }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/could not be verified/i);
  });

  it('rejects a photo URL with a bad/missing HMAC signature (400) — the M4 guard', async () => {
    // Host is trusted, but the URL never went through our upload pipeline.
    h.setSigValid(false);
    const res = await call({ description: okDescription, photos: [{ url: 'https://drive.google.com/real-looking.jpg' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/could not be verified/i);
  });
});
