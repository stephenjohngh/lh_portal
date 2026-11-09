// Every named slot a screen fills must be one some component declares.
//
// Svelte drops content given to a slot the component does not have, without a
// warning. Four screens filled Modal's "header" slot while Modal had none, so a
// maintenance job's panel never showed the job's name (found 2026-11-09).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.svelte') ? [p] : [];
});

describe('named slots', () => {
  const files = walk('src').map((f) => ({ f: f.replace(/\\/g, '/'), src: readFileSync(f, 'utf8') }));
  const declared = new Set(files.flatMap(({ src }) => [...src.matchAll(/<slot\s+name="([\w-]+)"/g)].map((m) => m[1])));

  it('finds the slots it exists for', () => {
    expect(declared.has('footer')).toBe(true);
    expect(declared.has('header')).toBe(true);
  });

  it('are only filled where some component declares them', () => {
    const orphans = files.flatMap(({ f, src }) => [...src.matchAll(/\bslot="([\w-]+)"/g)]
      .filter((m) => !declared.has(m[1])).map((m) => `${f}: slot="${m[1]}"`));
    expect(orphans).toEqual([]);
  });
});
