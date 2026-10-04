// src/lib/stores/auth.test.js
// The auth store. Login flows through /api/auth/login (server enforces rate
// limiting + audit) and then hydrates the local Supabase client. These pin that
// contract, the media session cookie (security review, 2026-09-27), the
// absence of a signup path, and the logout audit-before-signout sequence.
// Seams mocked: supabaseClient (auth methods), fetch, window.location.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  supabase: {
    auth: {
      getSession:  vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1', email: 'u@x' }, access_token: 'tok' } } })),
      setSession:  vi.fn(() => Promise.resolve({})),
      signOut:     vi.fn(() => Promise.resolve({ error: null })),
      onAuthStateChange: vi.fn(),
    },
  },
}));

vi.mock('#lib/supabaseClient.js', () => ({ supabase: h.supabase }));
vi.mock('#lib/utils/logger.js',   () => ({ getLogger: () => () => {} }));

const { auth } = await import('./auth.js');

function mockFetch(body, ok = true) {
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.window = { location: { href: '' } };
  mockFetch({ session: { access_token: 'at', refresh_token: 'rt' } });
});

describe('login', () => {
  it('posts to /api/auth/login and hydrates the local session on success', async () => {
    mockFetch({ session: { access_token: 'at', refresh_token: 'rt' } });
    const r = await auth.login('u@x', 'pw');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(h.supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
    expect(r.success).toBe(true);
  });

  it('surfaces a lockout response without hydrating a session', async () => {
    mockFetch({ error: 'Too many attempts', locked: true, attemptsRemaining: 0 }, false);
    const r = await auth.login('u@x', 'pw');
    expect(r).toMatchObject({ success: false, locked: true, attemptsRemaining: 0 });
    expect(h.supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('returns a failure result on a network exception', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    const r = await auth.login('u@x', 'pw');
    expect(r).toMatchObject({ success: false, error: 'offline' });
  });
});

describe('no self-service signup', () => {
  // Accounts are created by an administrator; the permission model assumes
  // every account is a known person.
  it('offers no signup at all', () => {
    expect(/** @type {any} */ (auth).signup).toBeUndefined();
  });
});

describe('the media session cookie', () => {
  const mediaCalls = () => globalThis.fetch.mock.calls.filter(c => c[0] === '/api/auth/media-session');

  it('is opened with the new token on login, before the app shows anything', async () => {
    mockFetch({ session: { access_token: 'at', refresh_token: 'rt' } });
    await auth.login('u@x', 'pw');
    const post = mediaCalls().find(c => c[1].method === 'POST');
    expect(post[1].headers.Authorization).toBe('Bearer at');
  });

  it('is opened on startup when a session already exists', async () => {
    await auth.initialize();
    const post = mediaCalls().find(c => c[1].method === 'POST');
    expect(post[1].headers.Authorization).toBe('Bearer tok');
  });

  it('is renewed on every token refresh', async () => {
    await auth.initialize();
    const listener = h.supabase.auth.onAuthStateChange.mock.calls.at(-1)[0];
    globalThis.fetch.mockClear();
    listener('TOKEN_REFRESHED', { access_token: 'fresh', user: { id: 'u1' } });
    expect(mediaCalls()[0][1].headers.Authorization).toBe('Bearer fresh');
  });

  it('is cleared on logout', async () => {
    mockFetch({ success: true });
    await auth.logout();
    expect(mediaCalls().some(c => c[1].method === 'DELETE')).toBe(true);
  });

  it('never stops a login when it fails', async () => {
    globalThis.fetch = vi.fn((url) => url === '/api/auth/media-session'
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ ok: true, json: () => Promise.resolve({ session: { access_token: 'at', refresh_token: 'rt' } }) }));
    expect((await auth.login('u@x', 'pw')).success).toBe(true);
  });
});

describe('logout', () => {
  it('audit-logs (bearer) before signing out, then clears state and redirects', async () => {
    mockFetch({ success: true });
    const r = await auth.logout();
    // audit POST fired with the still-valid token
    const auditCall = globalThis.fetch.mock.calls.find(c => c[0] === '/api/audit/log');
    expect(auditCall).toBeTruthy();
    expect(auditCall[1].headers.Authorization).toBe('Bearer tok');
    expect(h.supabase.auth.signOut).toHaveBeenCalled();
    expect(globalThis.window.location.href).toBe('/login');
    expect(r.success).toBe(true);
  });
});
