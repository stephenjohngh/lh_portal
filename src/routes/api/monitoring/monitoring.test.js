// src/routes/api/monitoring/monitoring.test.js
//
// Tests the Sentry tunnel relay's security guard: it must only ever forward to
// OUR configured Sentry project, never an attacker-supplied destination
// (open-proxy / SSRF). Named *.test.js (not +server.test.js) so SvelteKit's
// router never mistakes it for a route file.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$env/dynamic/public', () => ({
  env: { PUBLIC_SENTRY_DSN: 'https://key@o123.ingest.de.sentry.io/456' },
}));

const { POST } = await import('./+server.js');

// Build a request whose body is a Sentry envelope with the given DSN in its header.
const envelopeReq = (dsn) => {
  const text = JSON.stringify({ dsn }) + '\n' + '{"type":"event"}\n{}';
  const buf = new TextEncoder().encode(text).buffer;
  return { arrayBuffer: () => Promise.resolve(buf) };
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
});

describe('POST /api/monitoring (Sentry tunnel)', () => {
  it('forwards an envelope addressed to our project to the correct ingest URL', async () => {
    const res = await POST({ request: envelopeReq('https://key@o123.ingest.de.sentry.io/456') });
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://o123.ingest.de.sentry.io/api/456/envelope/',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects an envelope for a different host (no SSRF) and never fetches', async () => {
    const res = await POST({ request: envelopeReq('https://key@evil.example.com/456') });
    expect(res.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects an envelope for a different project id on our host', async () => {
    const res = await POST({ request: envelopeReq('https://key@o123.ingest.de.sentry.io/999') });
    expect(res.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns 400 on a malformed envelope header', async () => {
    const res = await POST({ request: { arrayBuffer: () => Promise.resolve(new TextEncoder().encode('not json\n').buffer) } });
    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('POST /api/monitoring when Sentry is not configured', () => {
  it('returns 503 (no DSN configured)', async () => {
    vi.resetModules();
    vi.doMock('$env/dynamic/public', () => ({ env: {} }));
    const { POST: POST2 } = await import('./+server.js');
    const res = await POST2({ request: envelopeReq('https://key@o123.ingest.de.sentry.io/456') });
    expect(res.status).toBe(503);
  });
});
