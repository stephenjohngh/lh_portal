// src/lib/server/routeAccessGuard.test.js
//
// ⛔ EVERY SERVER ROUTE, AS A SET. Review §6ccc item 4 (2026-10-03) read all
// 53 routes together and found the same two faults in different places:
//   · a route reading with the SERVICE ROLE, which bypasses RLS, and checking
//     nothing beyond a login — so the grant RLS would have required never
//     applied: Management's suggest-action read any issue; Golden Thread's
//     ingest-artifact copied any library document into a draft; Dossier's
//     publish-assets pinned any file into a pack; the inspections report read
//     any stored file and fetched any URL;
//   · a route nothing called that listed every folder name in the portal's
//     storage to any signed-in account (deleted).
//
// So, for every route under src/routes/api:
//   1. it asks for a login (requireAuth / requireAdmin / requireAppAccess),
//      unless it is named PUBLIC below with why;
//   2. if it reads with the service role, it also checks something specific
//      to what it reads — an admin, an app grant, the document or file, the
//      record's owner — unless it is named below with why.
// A new route that does neither fails here and has to say which it is.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PUBLIC = {
  'auth/login':                     'the login itself — rate-limited and locked out per address',
  'monitoring':                     'the Sentry tunnel — validates the DSN host and project',
  'mor/intake/submit':              'the public MOR report form — same-origin check, rate limit, photo signatures',
  'mor/intake/upload':              'the public MOR photo upload — same-origin check, rate limit, image scan',
  'mor/status/[reference]':         'the public case lookup — needs the per-case verification code',
  'pack/[token]/file/[documentId]': "a published pack's file — the unguessable token is the permission",
  'pack/[token]/unlock':            "a published pack's passphrase — rate-limited",
  'media/file/[fileId]':            'the file proxy — checks its own signed media-session cookie',
};

// Service-role routes whose only check is a login, and why that is enough.
const LOGIN_ENOUGH = {
  'auth/media-session':               "mints or clears the caller's OWN media cookie; reads nothing",
  'media/upload':                     'writes a new photo for the caller and returns its address; reads nothing back',
  'dossier/publications/[id]/verify': "reads the publication with the caller's own token (RLS applies); the service role only finds where that manifest's files are",
};

const LOGIN = /\b(requireAuth|requireAdmin|requireAppAccess)\(/;
// The service role, or storage itself — which no RLS covers at all.
const SERVICE_ROLE = /SERVICE_ROLE_KEY|getSvc\(|from '#lib\/server\/(documentLibrary|mediaAccess|publicationAssets|storage\/index)/;
const SPECIFIC = /\b(requireAdmin|requireAppAccess|canListDocuments|canAccessDocument|canAttachDocument|canDeleteOwn|canViewFile|canDeleteFile)\(/;

const API = join(process.cwd(), 'src', 'routes', 'api');
function routes(dir = API, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routes(p, out);
    else if (name === '+server.js') {
      out.push({ route: relative(API, dir).replace(/\\/g, '/'), src: readFileSync(p, 'utf8') });
    }
  }
  return out;
}
const ROUTES = routes();

describe('every server route', () => {
  it('finds the routes (a guard that matches nothing is not a guard)', () => {
    expect(ROUTES.length).toBeGreaterThan(45);
    expect(ROUTES.some((r) => r.route === 'management/suggest-action')).toBe(true);
  });

  it('1. asks for a login, unless named public with a reason', () => {
    const bad = ROUTES.filter((r) => !LOGIN.test(r.src) && !PUBLIC[r.route]).map((r) => r.route);
    expect(bad, 'add requireAuth (or stronger), or name it PUBLIC with why').toEqual([]);
  });

  it('2. reads with the service role only after a check specific to what it reads', () => {
    const bad = ROUTES
      .filter((r) => SERVICE_ROLE.test(r.src) && !PUBLIC[r.route] && !LOGIN_ENOUGH[r.route])
      .filter((r) => !SPECIFIC.test(r.src))
      .map((r) => r.route);
    expect(bad, 'the service role bypasses RLS — check the grant, the document or the owner (CLAUDE.md, stored files)').toEqual([]);
  });

  it('no allowance has gone stale', () => {
    const present = new Set(ROUTES.map((r) => r.route));
    const stale = [...Object.keys(PUBLIC), ...Object.keys(LOGIN_ENOUGH)].filter((k) => !present.has(k));
    expect(stale).toEqual([]);
  });
});
