// Small in-line actions ("Clear", "Set all", "Use default", "+ Add event") are
// <Button variant="tertiary"> (2026-10-11, user: "make a 'tertiary' button for
// them so easy to change look"). They used to be teal text written by hand in
// each screen, so a change of look — the outline secondary buttons gained on
// 2026-10-10 — reached none of them. This fails a new hand-written one.
//
// What it looks for: a raw <button> coloured with the accent text (purple-* is
// the portal teal) that has no background and no border of its own — the
// text-link shape. Coloured, outlined or filled buttons are other things.
// The phone apps have their own theme (no Tailwind) and are not scanned.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SKIP = /apps[\/](inspection|mobileplan|managementmobile)[\/]/;

// Kept as links on purpose — each NAVIGATES to a thing rather than acting:
const ALLOWED = {
  'src/lib/apps/parking/components/AgreementPanel.svelte': 'the bay reference opens that bay',
  'src/routes/pack/[token]/+page.svelte': 'the public pack’s document tree; titles open the document',
};

function svelteFiles(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...svelteFiles(p));
    else if (p.endsWith('.svelte') && !SKIP.test(p)) out.push(p);
  }
  return out;
}

/** Raw <button>s in `src` shaped like a teal text link. */
export function textLinkButtons(src) {
  const hits = [];
  const re = /<button\b([^>]*?)>/gs;
  let m;
  while ((m = re.exec(src))) {
    const cm = m[1].match(/class="([^"]*)"/s);
    if (!cm) continue;
    const t = cm[1].replace(/\s+/g, ' ').trim().split(' ');
    const teal = t.some(c => /^text-(purple|teal)-\d+$/.test(c));
    const border = t.some(c => /^border($|-(?!b\b|t\b|l\b|r\b|b-|t-|l-|r-))/.test(c));
    const bg = t.some(c => /^bg-/.test(c));
    if (teal && !border && !bg) hits.push(src.slice(0, m.index).split('\n').length);
  }
  return hits;
}

describe('in-line actions use <Button variant="tertiary">', () => {
  const files = svelteFiles('src').map(p => p.split(path.sep).join('/'));

  it('no hand-written teal text-link buttons', () => {
    const bad = files
      .filter(f => !ALLOWED[f])
      .flatMap(f => textLinkButtons(fs.readFileSync(f, 'utf8')).map(l => `${f}:${l}`));
    expect(bad, 'use <Button variant="tertiary" size="xs"> instead').toEqual([]);
  });

  it('the scan still recognises the shape it is for', () => {
    expect(textLinkButtons('<button class="text-xs text-purple-400 hover:text-purple-300">Clear</button>')).toEqual([1]);
    expect(textLinkButtons('<button class="border border-purple-500 text-purple-300">x</button>')).toEqual([]);
  });

  it('the allowed links are still there to allow', () => {
    for (const f of Object.keys(ALLOWED)) expect(textLinkButtons(fs.readFileSync(f, 'utf8')).length, f).toBeGreaterThan(0);
  });

  it('the shared Button has a tertiary look', () => {
    expect(fs.readFileSync('src/lib/components/common/Button.svelte', 'utf8')).toMatch(/\btertiary:\s*'/);
  });
});
