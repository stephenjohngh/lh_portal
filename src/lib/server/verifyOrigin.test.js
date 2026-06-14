// src/lib/server/verifyOrigin.test.js
// CSRF origin check + the storage-URL whitelist used to validate photo URLs
// accepted from public (unauthenticated) MOR submissions.

import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'https://proj.supabase.co' }));

const { isSameOrigin, isTrustedStorageUrl } = await import('./verifyOrigin.js');

const reqWith = (headers) => ({ headers: { get: (k) => headers[k] ?? null } });
const appUrl = { origin: 'https://app.example' };

describe('isSameOrigin', () => {
  it('accepts a matching Origin header', () => {
    expect(isSameOrigin(reqWith({ origin: 'https://app.example' }), appUrl)).toBe(true);
  });
  it('rejects a mismatched Origin header', () => {
    expect(isSameOrigin(reqWith({ origin: 'https://evil.example' }), appUrl)).toBe(false);
  });
  it('falls back to Referer when Origin is absent', () => {
    expect(isSameOrigin(reqWith({ referer: 'https://app.example/page' }), appUrl)).toBe(true);
    expect(isSameOrigin(reqWith({ referer: 'https://evil.example/page' }), appUrl)).toBe(false);
  });
  it('rejects when neither header is present (non-browser caller)', () => {
    expect(isSameOrigin(reqWith({}), appUrl)).toBe(false);
  });
  it('rejects a malformed Referer', () => {
    expect(isSameOrigin(reqWith({ referer: 'not a url' }), appUrl)).toBe(false);
  });
});

describe('isTrustedStorageUrl', () => {
  it('accepts the configured Supabase storage host', () => {
    expect(isTrustedStorageUrl('https://proj.supabase.co/storage/v1/object/public/x.jpg')).toBe(true);
  });
  it('accepts the known provider hosts', () => {
    expect(isTrustedStorageUrl('https://drive.google.com/uc?id=1')).toBe(true);
    expect(isTrustedStorageUrl('https://lh3.googleusercontent.com/x')).toBe(true);
    expect(isTrustedStorageUrl('https://contoso.sharepoint.com/x')).toBe(true);
    expect(isTrustedStorageUrl('https://1drv.ms/x')).toBe(true);
  });
  it('rejects an arbitrary / attacker host', () => {
    expect(isTrustedStorageUrl('https://evil.example/x.jpg')).toBe(false);
    expect(isTrustedStorageUrl('https://proj.supabase.co.evil.example/x')).toBe(false);
  });
  it('rejects non-https and non-string input', () => {
    expect(isTrustedStorageUrl('http://drive.google.com/x')).toBe(false);
    expect(isTrustedStorageUrl('')).toBe(false);
    expect(isTrustedStorageUrl(null)).toBe(false);
  });
});
