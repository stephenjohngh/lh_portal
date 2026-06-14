// src/routes/api/audit/log/audit-log.test.js
//
// Security property: the audit endpoint stamps userId/userEmail from the
// VERIFIED TOKEN and ignores whatever the body claims — so audit rows can't be
// forged. Also: unauthenticated requests are rejected.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  let authResult;
  return { logAudit: vi.fn(() => Promise.resolve()), getAuth: () => authResult, setAuth: (a) => { authResult = a; } };
});

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('$lib/server/requireAuth', () => ({ requireAuth: () => Promise.resolve(h.getAuth()) }));
vi.mock('$lib/server/auditLogger', () => ({
  logAudit:     h.logAudit,
  getIpAddress: () => '1.2.3.4',
  getUserAgent: () => 'test-agent',
}));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');
const req = (body) => ({ json: () => Promise.resolve(body), headers: { get: () => null } });

beforeEach(() => {
  vi.clearAllMocks();
  h.setAuth({ user: { id: 'tok-user', email: 'tok@example.com' }, isAdmin: false, error: null });
});

describe('POST /api/audit/log', () => {
  it('rejects unauthenticated requests and logs nothing', async () => {
    h.setAuth({ user: null, error: { status: 401 } });
    const res = await POST({ request: req({ eventType: 'create' }) });
    expect(res.status).toBe(401);
    expect(h.logAudit).not.toHaveBeenCalled();
  });

  it('stamps identity from the token and IGNORES forged userId/userEmail in the body', async () => {
    await POST({ request: req({
      eventType: 'delete', targetType: 'issue', targetId: 'i1',
      userId: 'forged-admin', userEmail: 'attacker@evil.com',     // must be ignored
    }) });
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    const logged = h.logAudit.mock.calls[0][0];
    expect(logged.userId).toBe('tok-user');                       // from token, not body
    expect(logged.userEmail).toBe('tok@example.com');
  });

  it('returns success after logging', async () => {
    const res = await POST({ request: req({ eventType: 'update', targetType: 'issue' }) });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
