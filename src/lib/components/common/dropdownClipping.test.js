// src/lib/components/common/dropdownClipping.test.js
//
// TYPE-1, and unusual: it reads SOURCE TEXT rather than calling anything.
//
// ⛔ THE RULE: a component that opens an overlay — a menu, dropdown or popover
// drawn over whatever follows it — must not be rendered inside an ancestor that
// clips. `overflow: hidden` clips every absolutely-positioned descendant to its
// own box, so a panel that hangs below its button is silently cut off.
//
// THREE instances, all written for rounded corners by someone not thinking
// about popovers, all invisible until a container happened to be short:
//   · `.tmpl` on the register panel — the facet dropdowns lost their bottom
//     options once a filter shortened the list (PROJECT_STATUS §6o).
//   · `.attr-strips` in ScopeEditor — the "+ Add filter" popover is `w-80` by
//     up to 60vh inside a container ~72px tall, so almost none of it showed.
//   · `IssueCard` — MeetingBadge's menu, cut off on a short collapsed card.
//
// ⚠ AN EARLIER VERSION OF THIS TEST WOULD HAVE CAUGHT NONE OF THEM. It checked
// whether a component clipped its OWN styles, and in all three cases the
// overlay lives in a different component from the wrapper that clips it. The
// scan is therefore CROSS-COMPONENT: find the components that open an overlay,
// then check every place each one is rendered.
//
// ⚠ What it still cannot see: an ancestor added by a component further up than
// the direct caller, and anything `position: fixed` escaping a transformed
// ancestor. Both remain on the author.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)(\/?)>/gs;
const CLASS = /class(?:Name)?\s*=\s*"([^"]*)"/g;
const STYLE_ATTR = /style\s*=\s*"([^"]*)"/g;
// ⚠ `hidden` ONLY, deliberately. `auto` and `scroll` also cut a panel off at
// the edge, but they leave it REACHABLE — you can scroll to it — and flagging
// every scroll pane would bury this rule in exemptions for things that are
// fine. All three real faults were `hidden`, which makes content unreachable.
const OVERFLOW = /overflow(-[xy])?\s*:\s*hidden/;
const TW_CLIP = /\boverflow-(x-|y-)?hidden\b/;
/** Elements that never have a closing tag, so must not go on the stack. */
const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'track',
  'area', 'base', 'col', 'embed', 'param', 'wbr', 'path', 'circle', 'rect', 'line',
  'polygon', 'polyline', 'use', 'stop', 'ellipse', 'g']);

function svelteFiles(dir = 'src', out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) svelteFiles(path, out);
    else if (name.endsWith('.svelte')) out.push(path.split('\\').join('/'));
  }
  return out;
}

const read = (p) => readFileSync(p, 'utf8');
const styleBlock = (src) => (src.match(/<style[^>]*>([\s\S]*?)<\/style>/) ?? [, ''])[1];
const markup = (src) => src
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '');

/** Class selectors in a component's scoped CSS whose body clips. */
function clippingClasses(css) {
  const out = new Set();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!OVERFLOW.test(body)) continue;
    for (const [, cls] of selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)) out.add(cls);
  }
  return out;
}

const attrValues = (attrs, re) => [...attrs.matchAll(re)].map(m => m[1]).join(' ');

/**
 * Does this component open an overlay, and of which kind? The signature is a
 * positioned element carrying a z-index — that pairing is what says "draw me
 * over what follows", and is what separates a menu from an in-flow decoration.
 *
 * ⚠ ONLY `absolute` is at risk. A `fixed` element is positioned against the
 * viewport and an ancestor's `overflow: hidden` does not reach it, which is why
 * every modal and bottom sheet in this codebase is safe wherever it is put.
 * (It would be caught by a transformed ancestor — out of scope here.)
 *
 * @returns {'absolute'|'fixed'|null}
 */
function overlayKind(src) {
  const m = markup(src);
  let seen = null;
  for (const match of m.matchAll(TAG)) {
    if (match[1]) continue;
    const classes = attrValues(match[3] ?? '', CLASS).split(/\s+/);
    if (!classes.some(c => c.startsWith('z-'))) continue;
    if (classes.includes('absolute')) return 'absolute';
    if (classes.includes('fixed')) seen = 'fixed';
  }
  const css = styleBlock(src);
  if (/position\s*:\s*absolute[\s\S]{0,160}?z-index/.test(css)) return 'absolute';
  if (/position\s*:\s*fixed[\s\S]{0,160}?z-index/.test(css)) seen = seen ?? 'fixed';
  return seen;
}

/** Component names rendered by this file. */
function rendersComponents(src) {
  return new Set([...markup(src).matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map(m => m[1]));
}

/**
 * Every `<Component>` rendered inside a clipping ancestor in this file.
 * @returns {{component: string, ancestor: string}[]}
 */
function clippedCallSites(src, overlayNames) {
  const css = clippingClasses(styleBlock(src));
  const m = markup(src);
  /** @type {{tag: string, cls: string, clips: boolean}[]} */
  const stack = [];
  const out = [];
  for (const match of m.matchAll(TAG)) {
    const [, closing, name, rawAttrs, selfClose] = match;
    const tag = name.toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const attrs = rawAttrs ?? '';
    const cls = attrValues(attrs, CLASS);
    const clips = TW_CLIP.test(cls)
      || OVERFLOW.test(attrValues(attrs, STYLE_ATTR))
      || cls.split(/\s+/).some(c => css.has(c));

    if (overlayNames.has(name) && /^[A-Z]/.test(name)) {
      const ancestor = stack.find(a => a.clips);
      if (ancestor) out.push({ component: name, ancestor: ancestor.cls.trim().slice(0, 60) });
    }
    if (selfClose !== '/' && !VOID.has(tag)) stack.push({ tag, cls, clips });
  }
  return out;
}

/**
 * Call sites allowed to sit inside a clipping ancestor, each with the reason
 * the overlay is not in fact clipped.
 *
 * ⛔ An entry is a CLAIM, not a preference. The two categories that hold:
 *   · the overlay is `position: fixed` and no ancestor carries a transform,
 *     filter or perspective, so it is positioned against the viewport;
 *   · the "overlay" is an in-flow decoration drawn inside its own box, or a
 *     canvas whose clipping is the entire point.
 */
const ALLOWED = {
  // Markers drawn ON the plan — clipping to the plan viewport is the point,
  // and PlanView contains nothing else that opens outward.
  'src/lib/apps/mobileplan/components/PlanView.svelte': ['MarkerOverlay'],
  'src/lib/apps/mobileplan/MobilePlanApp.svelte': ['PlanView'],
  // ⚠ A WEAKER REASON THAN THE OTHERS, and it is recorded as such. The shell is
  // full height, so it clips at the viewport edge — where a panel would be cut
  // off anyway. The only outward-opening panel below it is PackSearch's
  // suggestion list (`max-h-80`), anchored near the TOP of the sidebar. Move
  // that search to the bottom of a pane and this stops being true.
  'src/lib/apps/dossier/DossierApp.svelte': ['PackWorkspace'],
};

describe('⛔ an overlay must not be rendered inside something that clips it', () => {
  const files = svelteFiles();
  const sources = new Map(files.map(p => [p, read(p)]));

  const nameOf = (p) => p.split('/').pop().replace(/\.svelte$/, '');

  // ⛔ TRANSITIVE, and this is the part a first attempt got wrong. `FilterBar`
  // contains no positioned element of its own — it RENDERS MultiSelectDropdown,
  // which does. So the register panel's `.tmpl` wrapper was clipping an overlay
  // two components down, and a scan that only looked at direct containment
  // reported nothing. A component that renders an at-risk overlay is itself at
  // risk, however many levels deep it sits.
  const overlayNames = new Set(
    files.filter(p => overlayKind(sources.get(p)) === 'absolute').map(nameOf),
  );
  for (let changed = true; changed;) {
    changed = false;
    for (const p of files) {
      const name = nameOf(p);
      if (overlayNames.has(name)) continue;
      for (const child of rendersComponents(sources.get(p))) {
        if (overlayNames.has(child)) { overlayNames.add(name); changed = true; break; }
      }
    }
  }

  const offenders = [];
  for (const [path, src] of sources) {
    const allowed = ALLOWED[path] ?? [];
    for (const { component, ancestor } of clippedCallSites(src, overlayNames)) {
      if (!allowed.includes(component)) offenders.push(`${path} → <${component}> inside "${ancestor}"`);
    }
  }

  it('no overlay is rendered inside a clipping ancestor', () => {
    expect(offenders).toEqual([]);
  });

  it('⚠ still recognises the overlays it exists to protect', () => {
    // A scan that matches nothing passes for ever — round 14's dead claim.
    for (const name of ['MultiSelectDropdown', 'AttrFilterStrip', 'MeetingBadge', 'PlanToolbar']) {
      expect(overlayNames, name).toContain(name);
    }
    expect(overlayNames.size).toBeGreaterThanOrEqual(20);
  });

  it('⚠ every allowlist entry still names a real call site', () => {
    // Otherwise a stale exemption quietly widens the rule.
    for (const [path, names] of Object.entries(ALLOWED)) {
      const src = sources.get(path);
      expect(src, `${path} no longer exists`).toBeTruthy();
      for (const name of names) {
        expect(src.includes(`<${name}`), `${path} no longer renders <${name}>`).toBe(true);
      }
    }
  });
});
