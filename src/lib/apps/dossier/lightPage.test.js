// The reader's light page gives every --pk-* colour variable a light value.
// A variable added to the reader's styles without one would stay dark on a white page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

describe('the reader light page', () => {
  const used = new Set([
    ...read('./components/BlockContent.svelte').matchAll(/var\((--pk-[\w-]+)/g),
    ...read('./dataset-table.css').matchAll(/var\((--pk-[\w-]+)/g),
  ].map((m) => m[1]));
  const lightBlock = read('../../../routes/pack/[token]/pack-print.css').match(/\.pack-root\.light \{([\s\S]*?)\n\}/)?.[1] ?? '';

  it('uses the colour variables at all', () => {
    expect(used.size).toBeGreaterThan(8);
  });

  it('defines a light value for every variable the reader uses', () => {
    const missing = [...used].filter((v) => !new RegExp(`${v}\\s*:`).test(lightBlock));
    expect(missing).toEqual([]);
  });
});
