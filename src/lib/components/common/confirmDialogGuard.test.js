// Every <ConfirmDialog> is given `show`, and nothing ConfirmDialog does not
// take (2026-10-20). Maintenance's job panel rendered one with no `show` — it
// defaults to false, so the dialog never appeared and a job could never be
// deleted — and four places passed `confirmLabel` / `variant`, which it
// ignores (their button read "Confirm"). Svelte says nothing about either.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIALOG = 'src/lib/components/common/ConfirmDialog.svelte';
const PROPS = new Set([...readFileSync(DIALOG, 'utf8').matchAll(/export let (\w+)/g)].map((m) => m[1]));

/** @returns {string[]} */
function svelteFiles(/** @type {string} */ dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? svelteFiles(p) : n.endsWith('.svelte') ? [p] : [];
  });
}

/** The attribute names on each <ConfirmDialog …> in a file. */
function usages(/** @type {string} */ src) {
  return [...src.matchAll(/<ConfirmDialog\b([\s\S]*?)\/?>/g)].map((m) => {
    // Take out what attributes hold — quoted text and {expressions} — so a
    // word inside a message is never read as a prop.
    let a = m[1].replace(/"[^"]*"|'[^']*'/g, '""');
    for (let i = 0; i < 5; i++) a = a.replace(/\{[^{}]*\}/g, '');
    return [...a.matchAll(/(?:^|\s)([a-zA-Z:|]+)(?==|\s|$)/g)].map((x) => x[1]).filter((n) => !n.startsWith('on:'));
  });
}

describe('ConfirmDialog is used as it is written', () => {
  const files = svelteFiles('src').filter((f) => !f.replace(/\\/g, '/').endsWith(DIALOG));
  const found = files.flatMap((f) => usages(readFileSync(f, 'utf8')).map((names) => ({ f, names })));

  it('the scan still finds the dialogs and the props it checks against', () => {
    expect(PROPS.has('show') && PROPS.has('confirmText')).toBe(true);
    expect(found.length).toBeGreaterThan(30);
  });
  it('every one is given `show`', () => {
    expect(found.filter((u) => !u.names.includes('show')).map((u) => u.f)).toEqual([]);
  });
  it('none passes a prop ConfirmDialog does not take', () => {
    expect(found.flatMap((u) => u.names.filter((n) => !PROPS.has(n)).map((n) => `${u.f}: ${n}`))).toEqual([]);
  });
});
