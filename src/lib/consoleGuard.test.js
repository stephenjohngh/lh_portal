// src/lib/consoleGuard.test.js
//
// Browser code logs through #lib/utils/logger (getLogger), which a dev build
// switches on and a production build leaves quiet. A bare console.* call
// prints for every user. Two temporary sign-out diagnostics were added in June;
// one was removed in July as "the only stray console.* in client code", and
// the other survived in authHeaders.js until 2026-10-02. A file allowed to
// print is named here with the reason, and the reason is checked so it cannot
// outlive the code. Server code (src/lib/server, +server.js, hooks.server.js)
// is outside this rule: its console output is the server log.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function browserSources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { browserSources(path, out); continue; }
    const p = path.replace(/\\/g, '/');
    if (!/\.(js|svelte)$/.test(name) || /\.test\.js$/.test(name)) continue;
    if (p.startsWith('src/lib/server/') || name === '+server.js' || name.startsWith('hooks.server')) continue;
    out.push(p);
  }
  return out;
}

// Built from a string: Vite's import scanner misreads some regex literals.
const PRINTS = new RegExp('\\bconsole\\.(log|info|warn|debug|error)\\s*\\(');
const code = (text) => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const MAY_PRINT = {
  'src/lib/apps/dossier/components/DocEditor.svelte':
    'opt-in selection diagnostics, silent unless switched on in the browser, for an open cursor fault (Dossier_Next.md)',
  'src/lib/supabaseClient.js': 'a missing-credentials message at start-up, before any logger can be configured',
};

describe('browser code does not print to the console', () => {
  const files = browserSources('src');

  it('finds the files it exists for', () => {
    expect(files).toContain('src/lib/utils/authHeaders.js');
    expect(files).not.toContain('src/lib/server/auditLogger.js');
  });

  it('no file prints, unless it says why', () => {
    const offenders = files.filter((f) => !MAY_PRINT[f]).filter((f) => PRINTS.test(code(readFileSync(f, 'utf8'))));
    expect(offenders, 'use getLogger from #lib/utils/logger, or name the file in MAY_PRINT with the reason').toEqual([]);
  });

  it('every exception still prints', () => {
    for (const f of Object.keys(MAY_PRINT)) {
      expect(PRINTS.test(code(readFileSync(f, 'utf8'))), `${f} no longer needs its exception`).toBe(true);
    }
  });
});
