import { describe, it, expect, vi } from 'vitest';
const h = vi.hoisted(() => ({ admin: true }));
vi.mock('#lib/server/requireAuth.js', () => ({
  requireAdmin: async () => (h.admin ? { user: { id: 'a' }, isAdmin: true } : { error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) }),
}));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
import { GET } from './+server.js';

const feed = { 'england-and-wales': { events: [{ date: '2026-12-25', title: 'Christmas Day', notes: 'x' }] }, scotland: { events: [{ date: '2026-01-02', title: '2nd January' }] } };
const call = (fetchImpl) => GET({ request: new Request('http://x'), fetch: fetchImpl });

describe('GET /api/admin/bank-holidays', () => {
  it('refuses anyone who is not an admin, without calling GOV.UK', async () => {
    h.admin = false; const f = vi.fn();
    expect((await call(f)).status).toBe(403);
    expect(f).not.toHaveBeenCalled(); h.admin = true;
  });
  it('passes on only England and Wales, as date and title', async () => {
    const res = await call(async () => new Response(JSON.stringify(feed)));
    expect(await res.json()).toEqual({ events: [{ date: '2026-12-25', title: 'Christmas Day' }] });
  });
  it('answers a failure in words, not a stack trace', async () => {
    const res = await call(async () => { throw new Error('boom'); });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/could not be reached/);
    expect((await call(async () => new Response('{}', { status: 500 }))).status).toBe(502);
  });
});
