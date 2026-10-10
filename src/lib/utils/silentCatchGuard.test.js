// src/lib/utils/silentCatchGuard.test.js
//
// ⛔ A catch that only LOGS is how a failure comes to read as success. The
// person sees the screen as if nothing went wrong: an empty due panel that
// reads "nothing due", risk ratings with no escalation, zero failed logins,
// a document deleted while its file stayed in storage. Review §6ccc item 2
// (2026-10-03) found eleven of them.
//
// So a catch whose body does nothing but log is allowed only in the files
// named below, each with how many it holds and why that is right there.
// A new one fails this test: either make the failure visible (set an error,
// a flag the screen shows, or rethrow) or add it here with its reason.
//
// It counts only catches whose every statement is a log call. A catch that
// also sets an error, returns a fallback or rethrows is not counted.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'src');

/** file (relative to src/, forward slashes) → [count, reason] */
const ALLOWED = {
  'lib/apps/building_assets/stores/buildingAssetsStore.js': [2,
    'space types fall back to the built-in list on a database without the table; a refresh after an admin edit keeps the list already shown'],
  'lib/apps/dossier/stores/dossierStore.js': [1,
    'pruning old revisions is housekeeping after the save has succeeded'],
  'lib/apps/inspection/InspectionApp.svelte': [1,
    'closing a repair session on Finish: a session left open shows as open on the home list'],
  'lib/apps/inspection/components/InspectionSession.svelte': [1,
    'pause writes nothing to the server; a failure only leaves the list unrefreshed'],
  'lib/apps/inspection/stores/inspectionStore.js': [10,
    'the offline walk: the device cache, the outbox and the resume refreshes fall back to what the phone holds, and the sync queue retries'],
  'lib/offline/syncRunner.js': [3,
    'the shared sync queue (Inspection, Parking (M)): a failed drain is retried, and the outbox shows what is waiting'],
  'lib/apps/mobileplan/stores/mobileplanStore.js': [2,
    'the offline plan viewer: a cache write, and attributes shown only in the detail sheet'],
  'lib/server/documentLibrary.js': [1,
    'binning an emptied folder after the file and its row have gone'],
  'lib/server/storage/googleDriveProvider.js': [1,
    'a missing mime type falls back to a download, which is the safe way to serve it'],
  'lib/utils/auditLogger.js': [1,
    'audit logging is fire-and-forget by design; it must never break the action it records'],
  'routes/api/media/file/+server.js': [1,
    'binning an emptied folder after the file has gone'],
  'routes/api/mor/intake/submit/+server.js': [1,
    'the case and its audit entry are already written; failing the public submission over its first timeline line would be worse'],
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|svelte)$/.test(name) && !/\.test\.js$/.test(name)) out.push(p);
  }
  return out;
}

/** Count the catch blocks whose every statement is a log call. */
export function countLogOnlyCatches(src) {
  let n = 0;
  const re = /catch\s*(\([^)]*\))?\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex, depth = 1;
    while (depth && i < src.length) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    const code = src.slice(re.lastIndex, i - 1)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .trim();
    if (!code) continue;   // an empty catch is a different question
    const stmts = code.split(/;|\n/).map(s => s.trim()).filter(s => s && !/^[)}\];]+$/.test(s));
    if (stmts.length && stmts.every(s => /^(logger|log|console\.\w+)\(/.test(s))) n++;
  }
  return n;
}

const counts = Object.fromEntries(
  walk(ROOT)
    .map(p => [relative(ROOT, p).replace(/\\/g, '/'), countLogOnlyCatches(readFileSync(p, 'utf8'))])
    .filter(([, n]) => n > 0),
);

describe('catches that only log', () => {
  it('appear only where the list says, with a reason', () => {
    const over = Object.entries(counts)
      .filter(([f, n]) => n > (ALLOWED[f]?.[0] ?? 0))
      .map(([f, n]) => `${f}: ${n} (allowed ${ALLOWED[f]?.[0] ?? 0})`);
    expect(over, 'a failure that is only logged reads as success — show it, or add it to ALLOWED with why').toEqual([]);
  });

  it('the list is not stale', () => {
    const stale = Object.entries(ALLOWED)
      .filter(([f, [n]]) => (counts[f] ?? 0) < n)
      .map(([f, [n]]) => `${f}: allows ${n}, has ${counts[f] ?? 0}`);
    expect(stale, 'lower the count (or remove the entry) so a new one cannot slip in under it').toEqual([]);
  });

  it('recognises the shape it exists for, and not its neighbours', () => {
    expect(countLogOnlyCatches(`try { a() } catch (e) { logger('x', e.message); }`)).toBe(1);
    expect(countLogOnlyCatches(`try { a() } catch (e) {\n  // why\n  console.warn(e);\n}`)).toBe(1);
    expect(countLogOnlyCatches(`try { a() } catch (e) { logger('x'); error = e.message; }`)).toBe(0);
    expect(countLogOnlyCatches(`try { a() } catch (e) { logger('x'); throw e; }`)).toBe(0);
    expect(countLogOnlyCatches(`try { a() } catch (e) { logger('x'); return []; }`)).toBe(0);
    expect(countLogOnlyCatches(`try { a() } catch { /* nothing */ }`)).toBe(0);
  });
});
