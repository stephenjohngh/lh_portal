// src/routes/api/auth/change-password/server.test.js
//
// Settings used to check the current password with a browser sign-in: no
// lockout, no audit, and every error read as a wrong password. These pin the
// route that replaced it.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  auth:   /** @type {any} */ (null),
  check:  /** @type {any} */ (null),
  update: vi.fn(async () => ({ error: null })),
  audit:  vi.fn(async () => 'log-1'),
}));

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('#lib/server/requireAuth.js', () => ({ requireAuth: async () => h.auth }));
vi.mock('#lib/server/passwordCheck.js', () => ({
  checkPassword: vi.fn(async () => h.check),
  adminClient:   () => ({ auth: { admin: { updateUserById: h.update } } }),
  pauseMinutes:  () => 15,
}));
vi.mock('#lib/server/auditLogger.js', () => ({
  logAudit: h.audit, getIpAddress: () => '1.2.3.4', getUserAgent: () => 'ua',
}));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));

const { POST } = await import('./+server.js');
const { checkPassword } = await import('#lib/server/passwordCheck.js');

const call = (body) => POST(/** @type {any} */ ({
  request: { json: async () => body, headers: { get: () => null } },
  getClientAddress: () => '1.2.3.4',
}));
const ME = { id: 'u1', email: 'me@x' };

beforeEach(() => {
  vi.clearAllMocks();
  h.auth  = { user: ME, isAdmin: false, error: null };
  h.check = { ok: true, data: {}, recentFails: 0 };
});

describe('POST /api/auth/change-password', () => {
  it('refuses a caller who is not signed in, and checks nothing', async () => {
    h.auth = { user: null, isAdmin: false, error: { body: { error: 'Unauthorized' }, status: 401 } };
    expect((await call({ currentPassword: 'a', newPassword: 'b' })).status).toBe(401);
    expect(checkPassword).not.toHaveBeenCalled();
  });

  it("checks the TOKEN's account, never one named in the body", async () => {
    await call({ currentPassword: 'old', newPassword: 'new', email: 'someone-else@x', userId: 'u9' });
    expect(checkPassword).toHaveBeenCalledWith(expect.objectContaining({ email: 'me@x', password: 'old' }));
    expect(h.update).toHaveBeenCalledWith('u1', { password: 'new' });
  });

  it('a wrong current password is a 400 on that field — not a 401, which reads as "session expired"', async () => {
    h.check = { ok: false, kind: 'wrong', status: 400, outcome: {}, attemptsRemaining: 3 };
    const res = await call({ currentPassword: 'bad', newPassword: 'new' });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('currentPassword');
    expect(h.update).not.toHaveBeenCalled();
  });

  it('a password that was NOT checked does not say it was wrong', async () => {
    h.check = { ok: false, kind: 'not_checked', status: 503,
                outcome: { message: 'Email sign-in is switched off. Your password was not checked.' } };
    const res = await call({ currentPassword: 'old', newPassword: 'new' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not checked/);
    expect(res.body.error).not.toMatch(/incorrect/i);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('obeys the lockout', async () => {
    h.check = { ok: false, kind: 'locked', status: 429 };
    expect((await call({ currentPassword: 'old', newPassword: 'new' })).status).toBe(429);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('refuses a new password equal to the current one, without checking it', async () => {
    const res = await call({ currentPassword: 'same', newPassword: 'same' });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('newPassword');
    expect(checkPassword).not.toHaveBeenCalled();
  });

  it("passes on Supabase's reason when the new password is refused", async () => {
    h.update.mockResolvedValueOnce({ error: { message: 'Password should be at least 6 characters' } });
    const res = await call({ currentPassword: 'old', newPassword: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Password should be at least 6 characters', field: 'newPassword' });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('audit-logs a change against the account, by the account', async () => {
    const res = await call({ currentPassword: 'old', newPassword: 'new' });
    expect(res.body.success).toBe(true);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'password_change', userId: 'u1', userEmail: 'me@x', targetId: 'u1',
    }));
  });
});
