// POST /api/parking/apply (migration 247): the public form's own guards.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ sameOrigin: true, allowed: true, submitted: /** @type {any[]} */ ([]) }));
vi.mock('#lib/server/verifyOrigin.js', () => ({ isSameOrigin: () => h.sameOrigin }));
vi.mock('#lib/server/publicRateLimit.js', () => ({ checkRateLimit: async (_r, action) => { expect(action).toBe('parking_apply'); return h.allowed; } }));
vi.mock('#lib/server/parkingApply.js', () => ({ submitApplication: async (b) => { h.submitted.push(b); return { reference: 'PKR-2026-000001', code: 'R7P-QK2' }; } }));

const { POST } = await import('./+server.js');
const call = (body) => POST(/** @type {any} */ ({ request: new Request('https://x/api/parking/apply', { method: 'POST', body: JSON.stringify(body) }), url: new URL('https://x/') }));

beforeEach(() => { h.sameOrigin = true; h.allowed = true; h.submitted.length = 0; });

describe('POST /api/parking/apply', () => {
  it('saves a real application and returns the reference and code', async () => {
    const r = await call({ display_name: 'Pat' });
    expect(await r.json()).toEqual({ reference: 'PKR-2026-000001', code: 'R7P-QK2' });
    expect(h.submitted).toHaveLength(1);
  });
  it('a bot that fills the hidden field is answered as if it worked, and nothing is kept', async () => {
    const r = await call({ display_name: 'Bot', website: 'http://spam' });
    expect(r.status).toBe(200);
    expect(h.submitted).toEqual([]);
  });
  it('refuses another site, and too many from one address', async () => {
    h.sameOrigin = false;
    expect((await call({})).status).toBe(403);
    h.sameOrigin = true; h.allowed = false;
    expect((await call({})).status).toBe(429);
    expect(h.submitted).toEqual([]);
  });
});
