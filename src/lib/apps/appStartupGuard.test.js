// src/lib/apps/appStartupGuard.test.js
//
// Nothing an app shows as EMPTY may appear before the app has read its data.
//
// ⛔ THE FAULT (reported 2026-10-02): the Planner flashed "The year is empty."
// on every open, and so did most of the apps in their own words — "No
// complaints recorded", "No cases match the current filters", "No users
// found", "No components yet", and in the Compliance register every row read
// "Not covered" before flipping to its real status. All one cause:
//
//   · a store starts as `{ items: [], loading: false }`, so before its first
//     load "not read yet" and "read, and empty" look identical; and
//   · the shell AWAITS `permissions.init()` before it starts that load, so for
//     the whole round trip the screen meets its own "nothing here" condition.
//
// THE RULE: an app shell that awaits `permissions.init` holds its content
// behind a readiness flag that is flipped in a `finally` — so a failed load
// ends in the error, not a spinner that never stops — and shows
// `<LoadingSpinner text="Loading …" />` until then. The flag is per app because
// each app decides what its opening data is; the spinner is shared.
//
// ⚠ It cannot see a TAB that loads its own data when opened. Those follow the
// same rule (Golden Thread's tabLoading, Maintenance's capitalLoading, the
// Compliance register's ready) but are checked by reading, not by this test.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const APPS = 'src/lib/apps';

/** Every app shell: src/lib/apps/<app>/<Name>App.svelte. */
const shells = readdirSync(APPS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => readdirSync(join(APPS, d.name))
    .filter((f) => /App\.svelte$/.test(f))
    .map((f) => join(APPS, d.name, f).replace(/\\/g, '/')));

/**
 * Shells that may skip the flag, each with the reason. The reason is checked
 * where it can be, so the exemption cannot outlive it.
 */
const EXEMPT = {
  // Both read the shared issues store, which STARTS as loading: true — so its
  // list shows the spinner until the first fetch, whichever app opens first.
  'src/lib/apps/management/ManagementApp.svelte':             'issues store starts loading',
  'src/lib/apps/managementmobile/ManagementMobileApp.svelte': 'issues store starts loading',
};

/**
 * The body of the shell's onMount callback, by brace matching.
 *
 * ⚠ Only the START-UP code counts. The first version accepted a flag from any
 * `finally` in the file, and the old Planner — the very shell this was written
 * for — passed on `preparingPrint = false`, a print button's busy flag. A
 * guard that matches the fault it exists for only by luck is no guard.
 */
function onMountBody(source) {
  // Every onMount in the file: Dossier has two, and its data load is the second.
  const bodies = [];
  let at = source.indexOf('onMount(');
  while (at !== -1) {
    const open = source.indexOf('{', at);
    let depth = 0, end = -1;
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) { end = i; break; }
    }
    if (open === -1 || end === -1) break;
    bodies.push(source.slice(open, end + 1));
    at = source.indexOf('onMount(', end);
  }
  return bodies.join(' ');
}

/** The flags flipped inside a `finally { … }` block of the given code. */
function finallyFlags(source) {
  const flags = new Set();
  for (const m of source.matchAll(/finally\s*\{([^{}]*)\}/g)) {
    for (const a of m[1].matchAll(/\b([A-Za-z_]\w*)\s*=\s*(true|false)\b/g)) flags.add(a[1]);
  }
  return flags;
}

/** The markup, after the script block. */
const markupOf = (source) => source.slice(source.lastIndexOf('</script>'));

describe('app shells do not show "nothing here" before they have read', () => {
  it('finds the shells it exists for', () => {
    expect(shells.length).toBeGreaterThanOrEqual(15);
    expect(shells).toContain('src/lib/apps/planner/PlannerApp.svelte');
  });

  for (const shell of shells) {
    const source = readFileSync(shell, 'utf8');
    if (!/permissions\.init\(/.test(source)) continue;   // no data to wait for (Settings)
    if (EXEMPT[shell]) continue;

    it(`${shell} waits for its opening data`, () => {
      const markup = markupOf(source);
      const used = [...finallyFlags(onMountBody(source))]
        .filter((flag) => new RegExp(`\\b${flag}\\b`).test(markup));
      expect(used, `${shell} awaits permissions.init but holds nothing behind a flag set in a finally block`)
        .not.toEqual([]);
    });
  }

  it('the exemptions still rest on their reason', () => {
    for (const shell of Object.keys(EXEMPT)) expect(existsSync(shell), shell).toBe(true);
    const store = readFileSync(join(APPS, 'management/stores/issuesStore.js'), 'utf8');
    expect(store).toMatch(/writable\([^;]*?\bissues:\s*\[\][^;]*?\bloading:\s*true\b/s);
  });

  it('looks only at the start-up code, not at the finally of a print button', () => {
    const src = 'onMount(async () => { await permissions.init(); await load(); });\n'
      + 'async function print() { try { x() } finally { preparingPrint = false; } }';
    expect([...finallyFlags(onMountBody(src))]).toEqual([]);
    expect(onMountBody('onMount(() => { if (a) { b() } });')).toBe('{ if (a) { b() } }');
    expect(onMountBody('onMount(() => { a() }); onMount(async () => { try { x() } finally { ready = true; } });'))
      .toContain('ready = true');
  });

  it('reads a flag in a finally block, and ignores one set elsewhere', () => {
    expect([...finallyFlags('try { a() } finally { ready = true; }')]).toEqual(['ready']);
    expect([...finallyFlags('try {\n x()\n} finally {\n  loading = false;\n}')]).toEqual(['loading']);
    expect([...finallyFlags('ready = true; try { a() } catch { b() }')]).toEqual([]);
  });
});
