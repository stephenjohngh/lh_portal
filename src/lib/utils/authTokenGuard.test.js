// src/lib/utils/authTokenGuard.test.js
//
// The browser reads its access token in ONE place: accessToken() /
// authHeaders() in #lib/utils/authHeaders.js (2026-10-02, PROJECT_STATUS
// §6bbb item 3). Twelve files read it from the session by hand. One of them,
// deleteStorageObjects, answered "0 failed" when there was no token, so a
// photo delete removed the rows and left the files in storage with nothing
// naming them. A file that genuinely handles a token is named here with the
// reason, and the reason is checked so it cannot outlive the code.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { sources(path, out); continue; }
    if (/\.test\.js$/.test(name)) continue;
    if (/\.(js|svelte)$/.test(name)) out.push(path.replace(/\\/g, '/'));
  }
  return out;
}

const TOKEN = new RegExp('access_token');

const HANDLES_A_TOKEN = {
  'src/lib/utils/authHeaders.js': 'the owner',
  'src/lib/stores/auth.js':
    'hydrates the session after login and exchanges it for the media cookie',
  'src/routes/api/auth/login/+server.js': 'returns the new session to the browser',
  'src/lib/server/storage/oneDriveProvider.js': "OneDrive's own OAuth token, not the portal's",
};

describe('the access token is read in one place', () => {
  const files = sources('src');

  it('finds the files it exists for', () => {
    expect(files).toContain('src/lib/utils/authHeaders.js');
    expect(files).toContain('src/lib/utils/mediaAttachments.js');
  });

  it('no other file reads the token itself', () => {
    const offenders = files
      .filter((f) => !HANDLES_A_TOKEN[f])
      .filter((f) => TOKEN.test(readFileSync(f, 'utf8')));
    expect(offenders, 'use accessToken() or authHeaders() from #lib/utils/authHeaders.js, or name the file in HANDLES_A_TOKEN with the reason').toEqual([]);
  });

  it('every exception still has something to excuse', () => {
    for (const f of Object.keys(HANDLES_A_TOKEN)) {
      expect(TOKEN.test(readFileSync(f, 'utf8')), `${f} no longer needs its exception`).toBe(true);
    }
  });
});
