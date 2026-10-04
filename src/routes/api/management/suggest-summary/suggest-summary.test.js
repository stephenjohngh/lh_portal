// src/routes/api/management/suggest-summary/suggest-summary.test.js
// The AI switch is an admin setting (2026-10-04, §6ccc item 10, D). Switched
// off, the route refuses before the rate limit or Anthropic is touched; on, it
// goes on to the rate limit.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ on: true, rate: vi.fn(async () => false), call: vi.fn() }));

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('$env/dynamic/private', () => ({ env: { ANTHROPIC_API_KEY: 'k' } }));
vi.mock('#lib/server/requireAuth.js', () => ({ requireAuth: async () => ({ user: { id: 'u1', email: 'a@b' }, error: null }) }));
vi.mock('#lib/server/publicRateLimit.js', () => ({ checkKeyRateLimit: h.rate }));
vi.mock('#lib/server/aiSwitch.js', () => ({ aiSwitchedOn: async () => h.on }));
vi.mock('#lib/server/aiModel.js', () => ({ callWithModel: h.call }));
vi.mock('#lib/server/auditLogger.js', () => ({ logAudit: () => Promise.resolve() }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');
const request = () => ({ json: async () => ({ body: 'Some activity text', activity_type: 'comment' }) });

beforeEach(() => { vi.clearAllMocks(); h.on = true; });

describe('POST /api/management/suggest-summary', () => {
  it('switched off by an admin: refuses, spends no rate limit and calls nobody', async () => {
    h.on = false;
    const res = await POST({ request: request() });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/switched off/);
    expect(h.rate).not.toHaveBeenCalled();
    expect(h.call).not.toHaveBeenCalled();
  });

  it('switched on: goes on to the rate limit', async () => {
    const res = await POST({ request: request() });
    expect(h.rate).toHaveBeenCalled();
    expect(res.status).toBe(429);
  });
});
