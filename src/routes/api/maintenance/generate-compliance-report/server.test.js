// src/routes/api/maintenance/generate-compliance-report/server.test.js
//
// ⛔ Until 2026-10-02 this route checked `authed instanceof Response` — but
// requireAuth returns { error }, never a Response, so the check was never true
// and anyone could ask it for a compliance document. The second test scans
// every route so the same shape cannot come back elsewhere.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('$app/env/public', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('public', { PUBLIC_SUPABASE_URL: 'http://localhost', PUBLIC_SUPABASE_ANON_KEY: 'anon' }));
vi.mock('$app/env/private', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('private', { SUPABASE_SERVICE_ROLE_KEY: 'service-role' }));
vi.mock('$app/env', () => ({ browser: false, dev: false, building: false }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
// The building as an admin named it (Admin → Building & business).
vi.mock('#lib/server/identity.js', () => ({ documentBuildingName: async () => 'Riverside Court' }));

const auth = vi.hoisted(() => ({ result: null }));
vi.mock('#lib/server/requireAuth.js', () => ({ requireAuth: async () => auth.result }));

const { POST } = await import('./+server.js');
const { json } = await import('@sveltejs/kit');

const call = (body = { rows: [], history: [], summary: {}, options: {} }) =>
  POST(/** @type {any} */ ({ request: new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) }));

describe('POST /api/maintenance/generate-compliance-report', () => {
  beforeEach(() => { auth.result = null; });

  it('refuses a caller who is not signed in', async () => {
    auth.result = { user: null, isAdmin: false, error: json({ error: 'Unauthorized' }, { status: 401 }) };
    const res = await call();
    expect(res.status).toBe(401);
  });

  it('answers a signed-in caller with a dated file name', async () => {
    auth.result = { user: { id: 'u1' }, isAdmin: false, error: null };
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/Compliance_Position_\d{4}-\d{2}-\d{2}\.docx/);
  });
});

describe('every API route reads the auth result the way it is returned', () => {
  function routes(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) routes(p, out);
      else if (name === '+server.js') out.push(p.replace(/\\/g, '/'));
    }
    return out;
  }
  // Built from a string: Vite's import scanner misreads some regex literals.
  const WRONG = new RegExp('(\\w+)\\s*=\\s*await\\s+require(Auth|Admin|AppAccess)\\([^)]*\\);?\\s*\\n\\s*if\\s*\\(\\s*\\1\\s+instanceof\\s+Response');

  it('no route tests require*() for `instanceof Response`', () => {
    const files = routes('src/routes/api');
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((f) => WRONG.test(readFileSync(f, 'utf8')));
    expect(offenders, 'requireAuth/requireAdmin/requireAppAccess return { error }: check `.error`').toEqual([]);
  });

  it('recognises the old shape', () => {
    expect(WRONG.test('const authed = await requireAuth(request);\n  if (authed instanceof Response) return authed;')).toBe(true);
  });
});
