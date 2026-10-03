// src/lib/utils/currentUser.test.js
//
// "Who is signed in" is read ONE way: the session the browser already holds.
// About thirty places asked the auth server instead (getUser), on every save,
// which fails offline. The guard below fails a file that does that again.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const h = vi.hoisted(() => ({
  session: /** @type {any} */ (null),
  getSession: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock('$lib/supabaseClient', () => ({ supabase: { auth: { getSession: h.getSession, getUser: h.getUser } } }));

const { currentUser, currentUserId, requireUserId } = await import('./currentUser.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.getSession.mockImplementation(async () => ({ data: { session: h.session } }));
});

describe('currentUser', () => {
  it('reads the session the browser holds, and never asks the auth server', async () => {
    h.session = { user: { id: 'u1', email: 'u@x' } };
    expect(await currentUser()).toEqual({ id: 'u1', email: 'u@x' });
    expect(await currentUserId()).toBe('u1');
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it('is null when nobody is signed in', async () => {
    h.session = null;
    expect(await currentUser()).toBeNull();
    expect(await currentUserId()).toBeNull();
  });

  it('requireUserId refuses rather than writing an unattributed row', async () => {
    h.session = null;
    await expect(requireUserId()).rejects.toThrow(/not signed in/);
    h.session = { user: { id: 'u2' } };
    await expect(requireUserId()).resolves.toBe('u2');
  });
});

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { sources(path, out); continue; }
    if (/\.test\.js$/.test(name) || !/\.(js|svelte)$/.test(name)) continue;
    out.push(path.replace(/\\/g, '/'));
  }
  return out;
}

// Browser code only: a server route verifies a token with getUser(token), which
// is a different thing and correct there.
const code = (text) => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const isServer = (f) => f.startsWith('src/lib/server/') || f.includes('/routes/api/') || f.endsWith('+server.js');
// Built from strings: Vite's import scanner misreads some regex literals.
const ASKS_SERVER  = new RegExp('auth\\.getUser\\(');
const READS_SESSION = new RegExp('auth\\.getSession\\(');

const READS_SESSION_ITSELF = {
  'src/lib/utils/currentUser.js': 'the owner — who is signed in',
  'src/lib/utils/authHeaders.js': 'the owner — the access token',
  'src/lib/stores/auth.js': 'hydrates the session on start-up and follows its changes',
};

describe('who is signed in is read one way', () => {
  const files = sources('src').filter((f) => !isServer(f));

  it('finds the files it exists for', () => {
    expect(files).toContain('src/lib/utils/currentUser.js');
    expect(files).toContain('src/lib/apps/management/stores/issuesStore.js');
  });

  it('no browser code asks the auth server who is signed in', () => {
    const offenders = files.filter((f) => ASKS_SERVER.test(code(readFileSync(f, 'utf8'))));
    expect(offenders, 'use currentUser / currentUserId / requireUserId from $lib/utils/currentUser.js').toEqual([]);
  });

  it('no other browser code reads the session itself', () => {
    const offenders = files.filter((f) => !READS_SESSION_ITSELF[f])
      .filter((f) => READS_SESSION.test(code(readFileSync(f, 'utf8'))));
    expect(offenders, 'use $lib/utils/currentUser.js, or name the file in READS_SESSION_ITSELF with the reason').toEqual([]);
  });

  it('every exception still reads it', () => {
    for (const f of Object.keys(READS_SESSION_ITSELF)) {
      expect(READS_SESSION.test(code(readFileSync(f, 'utf8'))), `${f} no longer needs its exception`).toBe(true);
    }
  });
});
