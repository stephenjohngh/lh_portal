// src/lib/components/common/dropdownClipping.test.js
//
// TYPE-1, and unusual: it reads SOURCE TEXT rather than calling anything.
//
// ⛔ THE RULE: a component that renders a dropdown or a filter strip must not
// declare `overflow: hidden` in its own scoped styles.
//
// Twice now, a wrapper has carried `overflow: hidden` for nothing but rounded
// corners and silently clipped an absolutely-positioned panel to its own box:
//   · `.tmpl` on the register panel — the facet dropdowns lost their bottom
//     options as soon as a filter shortened the list (PROJECT_STATUS §6o).
//   · `.attr-strips` in ScopeEditor — the "+ Add filter" popover is `w-80` by
//     up to 60vh inside a container about 72px tall, so almost none of it was
//     visible. Found by sweeping for the first one.
//
// ⚠ WHY A SOURCE-TEXT CHECK. jsdom computes no layout, so no rendering test can
// observe clipping; and the fault is invisible until a list happens to be short
// enough. The only thing that can be checked cheaply is the declaration that
// causes it. ⚠ It is therefore NARROW: it sees the component's own styles, not
// a wrapper an ANCESTOR component puts around it. A new panel is still on the
// author.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';

/** Every .svelte file under src/. */
function svelteFiles(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) svelteFiles(path, out);
    else if (name.endsWith('.svelte')) out.push(path);
  }
  return out;
}

/** The contents of a component's <style> block — scoped CSS only, so a
 *  Tailwind `overflow-hidden` in the markup is deliberately NOT matched. Those
 *  are nearly always a segmented button group, which contains no popup. */
function styleBlock(source) {
  const m = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
}

/**
 * Wrappers allowed to clip, each with the reason it cannot hide a panel.
 * ⛔ An entry here is a claim that the element contains no popup — not a
 * preference. Adding one without checking is how the rule stops working.
 */
const ALLOWED = {
  'src/lib/apps/admin/components/StatutoryTemplatePanel.svelte': [
    // The coverage progress bar: 6px tall, a fill element and nothing else.
    '.bar',
  ],
};

/** Selectors in this file's styles that declare a clipping overflow. */
function clippingSelectors(css) {
  const found = [];
  // Rough but sufficient: a selector, then a body containing overflow:hidden.
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = rule.exec(css)) !== null) {
    const [, selector, body] = m;
    if (/overflow(-[xy])?\s*:\s*hidden/.test(body)) found.push(selector.trim().split('\n').pop().trim());
  }
  return found;
}

describe('⛔ a dropdown must not be clipped by its own wrapper', () => {
  // Files that render one of the panels that hangs outside its parent.
  const RENDERS_A_PANEL = /<(MultiSelectDropdown|FilterBar|AttrFilterStrip)\b/;

  const offenders = [];
  for (const path of svelteFiles()) {
    const source = readFileSync(path, 'utf8');
    if (!RENDERS_A_PANEL.test(source)) continue;
    const allowed = ALLOWED[path.split('\\').join('/')] ?? [];
    for (const selector of clippingSelectors(styleBlock(source))) {
      if (!allowed.includes(selector)) offenders.push(`${path} → ${selector}`);
    }
  }

  it('no component that renders one declares a clipping overflow', () => {
    expect(offenders).toEqual([]);
  });

  it('finds the components it is meant to be watching', () => {
    // A check that matches nothing passes for ever. This asserts the scan
    // actually reaches the two files the rule exists because of.
    const scanned = svelteFiles().filter(p => RENDERS_A_PANEL.test(readFileSync(p, 'utf8')));
    const rel = scanned.map(p => p.split('\\').join('/'));
    expect(rel).toContain('src/lib/apps/admin/components/StatutoryTemplatePanel.svelte');
    expect(rel).toContain('src/lib/apps/building_assets/components/inspections/ScopeEditor.svelte');
    expect(rel.length).toBeGreaterThanOrEqual(5);
  });
});
