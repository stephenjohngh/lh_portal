// Only #lib/server/clientAddress.js may read the headers that name a visitor's
// address. The sign-in lockout, the rate limits, the Dossier access log and the
// audit log used three different readings until 2026-11-03, one of them trusting
// a header the caller writes; one rule is the fix, and this keeps it one.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src');
const ALLOWED = new Set([
  'lib/server/clientAddress.js',
  // SENDS a made-up X-Forwarded-For to test that the server ignores it; reads nothing.
  'lib/apps/admin/components/VisitorAddressPanel.svelte',
]);
const HEADERS = /['"`](x-forwarded-for|x-real-ip|x-nf-client-connection-ip|cf-connecting-ip|true-client-ip)['"`]/i;

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(js|ts|svelte)$/.test(name) && !/\.test\.js$|\.test-helper\.js$/.test(name)) out.push(p);
  }
  return out;
}

describe('one rule for who is asking', () => {
  it('no file but clientAddress.js reads an address header', () => {
    const bad = files(ROOT)
      .map((p) => p.slice(ROOT.length + 1).replace(/\\/g, '/'))
      .filter((rel) => !ALLOWED.has(rel) && HEADERS.test(readFileSync(join(ROOT, rel), 'utf8')));
    expect(bad, 'use clientAddressOf() from #lib/server/clientAddress.js').toEqual([]);
  });

  it('still finds the file it exists to protect', () => {
    expect(HEADERS.test(readFileSync(join(ROOT, 'lib/server/clientAddress.js'), 'utf8'))).toBe(true);
  });
});
