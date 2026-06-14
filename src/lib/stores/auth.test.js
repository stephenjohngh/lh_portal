// src/lib/stores/auth.test.js
// The auth store. Login flows through /api/auth/login (server enforces rate
// limiting + audit) and then hydrates the local Supabase client. These pin that
// contract plus signup and the logout audit-before-signout sequence.
// Seams mocked: supabaseClient (auth methods), fetch, window.location.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  supabase: {
    auth: {
      getSession:  vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1', email: 'u@x' }, access_token: 'tok' } } })),
      setSession:  vi.fn(() => Promise.resolve({})),
      signUp:      vi.fn(() => Promise.resolve({ data: { user: { id: 'new' } }, error: null })),
      signOut:     vi.fn(() => Promise.resolve({ error: null })),
      onAuthStateChange: vi.fn(),
    },
  },
}));

vi.mock('$lib/supabaseClient', () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/logger',   () => ({ getLogger: () => () => {} }));

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

describe('signup', () => {
  it('calls supabase signUp and returns success', async () => {
    const r = await auth.signup('a@b', 'pw', 'A B');
    expect(h.supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'a@b', password: 'pw', options: { data: { full_name: 'A B' } },
    }));
    expect(r.success).toBe(true);
  });

  it('returns the error when signUp fails', async () => {
    h.supabase.auth.signUp.mockResolvedValueOnce({ data: null, error: { message: 'taken' } });
    expect(await auth.signup('a@b', 'pw', 'A')).toEqual({ success: false, error: 'taken' });
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
