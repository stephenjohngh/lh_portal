// src/lib/apps/guides/utils/guidebook.js
// A GUIDEBOOK: the published guides that carry any of the chosen targets ('weekend
// cleaner', 'holiday cleaner', … — free text an administrator types on a guide), laid
// out as A4 pages for one PDF download.
//
// This file is PURE: selection, and a page layout that takes the text measurer and the
// photo sizes as arguments and returns drawing operations. The browser half
// (guidebookRender.js) loads the photos, draws the operations on a canvas and writes the
// PDF; a test can lay a whole book out with a fake measurer and read the result.
//
// What a guidebook contains is what readers are shown: the guide's FROZEN published
// version (never the draft steps), so a half-edited draft can never reach print.

import { KIND_LABEL } from './guideModel.js';

/** Page and type, in pixels at 150 dpi on A4. */
export const PAGE = Object.freeze({ w: 1240, h: 1754, margin: 96, footer: 70 });
const BODY_PX = 30;
const LINE = 42;

/** The colours a printed step uses, by kind (dark on white — it is read on paper). */
export const KIND_COLOUR = Object.freeze({
  step: '#0f766e', caution: '#b45309', stop: '#b91c1c', good: '#15803d', bad: '#9f1239',
});

/**
 * Every target in use on guides that could be in a guidebook, with how many guides
 * carry it. Compared without regard to case and spacing ('Weekend cleaner ' = 'weekend
 * cleaner'); the first spelling met is the one shown.
 * @param {Array<{ status?: string, targets?: string[]|null }>} guides
 * @returns {Array<{ target: string, count: number }>}
 */
export function allTargets(guides) {
  /** @type {Map<string, { target: string, count: number }>} */
  const map = new Map();
  for (const g of guides) {
    if (g.status !== 'published') continue;
    for (const t of g.targets ?? []) {
      const k = key(t);
      if (!k) continue;
      const e = map.get(k) ?? { target: t.trim(), count: 0 };
      e.count += 1;
      map.set(k, e);
    }
  }
  return [...map.values()].sort((a, b) => a.target.localeCompare(b.target, 'en', { sensitivity: 'base' }));
}

const key = (/** @type {string} */ t) => String(t ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The published guides carrying ANY of the chosen targets, in category order then title.
 * @template {{ status?: string, title?: string, category_key?: string|null, targets?: string[]|null }} G
 * @param {G[]} guides
 * @param {string[]} chosen
 * @param {string[]} [categoryOrder]  category keys, in the order to print them
 * @returns {G[]}
 */
export function selectGuides(guides, chosen, categoryOrder = []) {
  const want = new Set(chosen.map(key).filter(Boolean));
  if (!want.size) return [];
  const rank = (/** @type {G} */ g) => {
    const i = categoryOrder.indexOf(g.category_key ?? '');
    return i < 0 ? categoryOrder.length : i;
  };
  return guides
    .filter((g) => g.status === 'published' && (g.targets ?? []).some((t) => want.has(key(t))))
    .sort((a, b) => rank(a) - rank(b) || (a.title ?? '').localeCompare(b.title ?? '', 'en', { sensitivity: 'base' }));
}

/**
 * @typedef {{ type: 'text', x: number, y: number, text: string, px: number, bold?: boolean, colour: string }
 *   | { type: 'rect', x: number, y: number, w: number, h: number, colour: string }
 *   | { type: 'image', x: number, y: number, w: number, h: number, url: string }} Op
 * @typedef {{ ops: Op[] }} Page
 * @typedef {{ title: string, summary?: string|null, youNeed?: string|null, minutes?: number|null,
 *   steps: Array<{ kind?: string, title?: string, body?: string|null, photos?: Array<{ url: string }> }> }} BookGuide
 */

/**
 * Break text into lines no wider than `width`.
 * @param {string} text @param {number} px @param {boolean} bold @param {number} width
 * @param {(text: string, px: number, bold: boolean) => number} measure
 */
export function wrapText(text, px, bold, width, measure) {
  const out = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && measure(next, px, bold) > width) { out.push(line); line = w; }
      else line = next;
    }
    out.push(line);
  }
  return out;
}

/**
 * Lay the guides out as pages. A cover and contents come first, then each guide starts
 * on a new page. A step is kept together (heading, text, photos) and moved to the next
 * page whole rather than split.
 *
 * @param {BookGuide[]} guides
 * @param {{ title: string, targets: string[], generated: string,
 *           measure: (text: string, px: number, bold: boolean) => number,
 *           photoSize: (url: string) => { w: number, h: number } | null }} opts
 * @returns {Page[]}  each page already carries its footer ("… · page n of N")
 */
export function layoutGuidebook(guides, opts) {
  const { measure } = opts;
  const innerW = PAGE.w - PAGE.margin * 2;
  const bottom = PAGE.h - PAGE.margin - PAGE.footer;
  /** @type {Page[]} */ const pages = [];
  /** @type {Page} */ let page = { ops: [] };
  let y = PAGE.margin;

  const newPage = () => { page = { ops: [] }; pages.push(page); y = PAGE.margin; };
  const text = (/** @type {string} */ t, /** @type {number} */ px, /** @type {boolean} */ bold, /** @type {string} */ colour, x = PAGE.margin) => {
    page.ops.push({ type: 'text', x, y: y + px, text: t, px, bold, colour });
  };
  /** Lay wrapped text, returning nothing; assumes it fits (callers check the height first). */
  const paragraph = (/** @type {string} */ t, /** @type {number} */ px, /** @type {boolean} */ bold, /** @type {string} */ colour, /** @type {number} */ x, /** @type {number} */ w) => {
    for (const l of wrapText(t, px, bold, w, measure)) { if (l) text(l, px, bold, colour, x); y += Math.round(px * 1.4); }
  };
  const heightOf = (/** @type {string} */ t, /** @type {number} */ px, /** @type {boolean} */ bold, /** @type {number} */ w) =>
    wrapText(t, px, bold, w, measure).length * Math.round(px * 1.4);

  // ── Cover and contents ────────────────────────────────────────────────────
  const perContentsPage = 26;
  const contentsPages = Math.max(1, Math.ceil(guides.length / perContentsPage));
  newPage();
  y = PAGE.margin + 120;
  paragraph(opts.title, 64, true, '#0f172a', PAGE.margin, innerW);
  y += 20;
  if (opts.targets.length) paragraph(`For: ${opts.targets.join(', ')}`, 36, false, '#334155', PAGE.margin, innerW);
  y += 20;
  paragraph(`${guides.length} guide${guides.length === 1 ? '' : 's'} · ${opts.generated}`, 30, false, '#64748b', PAGE.margin, innerW);
  y += 60;
  const contentsStartY = y;
  for (let c = 1; c < contentsPages; c++) newPage();

  // ── Guides ────────────────────────────────────────────────────────────────
  /** @type {number[]} */ const startPage = [];
  for (const g of guides) {
    newPage();
    startPage.push(pages.length);                          // 1-based page number
    paragraph(g.title, 52, true, '#0f172a', PAGE.margin, innerW);
    if (g.summary) paragraph(g.summary, BODY_PX, false, '#334155', PAGE.margin, innerW);
    const meta = [g.minutes ? `About ${g.minutes} minutes` : '', g.youNeed ? `You will need: ${g.youNeed}` : ''].filter(Boolean).join(' · ');
    if (meta) { y += 6; paragraph(meta, BODY_PX - 2, false, '#64748b', PAGE.margin, innerW); }
    y += 24;

    g.steps.forEach((st, i) => {
      const kind = st.kind ?? 'step';
      const colour = KIND_COLOUR[/** @type {keyof typeof KIND_COLOUR} */ (kind)] ?? KIND_COLOUR.step;
      const textW = innerW - 28;
      const label = kind === 'step' ? '' : /** @type {Record<string, string>} */ (KIND_LABEL)[kind]?.toUpperCase() ?? '';
      const headH = (label ? LINE : 0) + heightOf(`${i + 1}. ${st.title ?? ''}`, 36, true, textW);
      const bodyH = st.body ? heightOf(st.body, BODY_PX, false, textW) + 8 : 0;
      const photos = (st.photos ?? []).map((p) => ({ url: p.url, size: opts.photoSize(p.url) })).filter((p) => p.size);
      const cell = (innerW - 28 - 20) / 2;
      /** @type {Array<Array<{ url: string, w: number, h: number }>>} */ const rows = [];
      for (let k = 0; k < photos.length; k += 2) {
        rows.push(photos.slice(k, k + 2).map((p) => {
          const s = /** @type {{ w: number, h: number }} */ (p.size);
          const scale = Math.min(cell / s.w, 460 / s.h, 1);
          return { url: p.url, w: Math.round(s.w * scale), h: Math.round(s.h * scale) };
        }));
      }
      const photoH = rows.reduce((n, r) => n + Math.max(...r.map((p) => p.h)) + 16, 0);
      const total = headH + bodyH + photoH + 34;
      if (y + total > bottom) { newPage(); }               // keep the step together

      const top = y;
      if (label) { text(label, 26, true, colour, PAGE.margin + 28); y += LINE; }
      paragraph(`${i + 1}. ${st.title ?? ''}`, 36, true, '#0f172a', PAGE.margin + 28, textW);
      if (st.body) { y += 4; paragraph(st.body, BODY_PX, false, '#1e293b', PAGE.margin + 28, textW); y += 4; }
      for (const r of rows) {
        let x = PAGE.margin + 28;
        for (const p of r) { page.ops.push({ type: 'image', x, y, w: p.w, h: p.h, url: p.url }); x += cell + 20; }
        y += Math.max(...r.map((p) => p.h)) + 16;
      }
      page.ops.push({ type: 'rect', x: PAGE.margin, y: top, w: 8, h: Math.max(10, y - top), colour });
      y += 34;
    });
  }

  // ── Contents (now that the start pages are known) ─────────────────────────
  guides.forEach((g, i) => {
    const target = pages[Math.floor(i / perContentsPage)];     // the cover, then any extra contents pages
    const yy = (i < perContentsPage ? contentsStartY : PAGE.margin) + (i % perContentsPage) * 44 + 30;
    target.ops.push({ type: 'text', x: PAGE.margin, y: yy, text: g.title, px: 30, colour: '#0f172a' });
    target.ops.push({ type: 'text', x: PAGE.w - PAGE.margin - 80, y: yy, text: String(startPage[i]), px: 30, colour: '#475569' });
  });

  // ── Footers ───────────────────────────────────────────────────────────────
  pages.forEach((p, i) => {
    p.ops.push({ type: 'text', x: PAGE.margin, y: PAGE.h - PAGE.margin + 10, text: `${opts.title} · page ${i + 1} of ${pages.length}`, px: 24, colour: '#94a3b8' });
  });
  return pages;
}
