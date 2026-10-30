// src/lib/apps/guides/utils/guidebookRender.js
// The browser half of the guidebook: load the photos, lay the book out (guidebook.js),
// draw each page on a canvas and write one PDF (#lib/utils/jpegPdf.js — no library).
// Built on the person's own device, so nothing is sent anywhere and no server memory is
// spent on it (the same reason the Building Assets report is built in the browser).
//
// ⚠ The pages are pictures: the text in the PDF cannot be selected or searched. That is
// the trade for needing no PDF library; a guidebook is for printing and reading.

import { jpegsToPdf } from '#lib/utils/jpegPdf.js';
import { normalisePhotoUrl } from '#lib/utils/driveUtils.js';
import { layoutGuidebook, PAGE } from './guidebook.js';

const FONT = 'Arial, Helvetica, sans-serif';

/** @param {string} src @returns {Promise<HTMLImageElement|null>} null when it will not load */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * @param {Array<import('./guidebook.js').BookGuide>} guides   each guide's FROZEN published content
 * @param {{ title: string, targets: string[], generated: string }} meta
 * @returns {Promise<{ blob: Blob, missingPhotos: number }>}
 */
export async function buildGuidebookPdf(guides, meta) {
  // The proxy URL is what the canvas can load (same origin, the session cookie rides along).
  const books = guides.map((g) => ({
    ...g,
    steps: g.steps.map((s) => ({ ...s, photos: (s.photos ?? []).map((p) => ({ url: normalisePhotoUrl(p.url) })) })),
  }));
  const urls = [...new Set(books.flatMap((g) => g.steps.flatMap((s) => s.photos.map((p) => p.url))))];
  /** @type {Map<string, HTMLImageElement>} */ const images = new Map();
  await Promise.all(urls.map(async (u) => { const i = await loadImage(u); if (i) images.set(u, i); }));

  const scratch = document.createElement('canvas').getContext('2d');
  if (!scratch) throw new Error('This browser cannot draw the guidebook.');
  const measure = (/** @type {string} */ t, /** @type {number} */ px, /** @type {boolean} */ bold) => {
    scratch.font = `${bold ? 'bold ' : ''}${px}px ${FONT}`;
    return scratch.measureText(t).width;
  };

  const pages = layoutGuidebook(books, {
    ...meta, measure,
    photoSize: (u) => { const i = images.get(u); return i ? { w: i.naturalWidth, h: i.naturalHeight } : null; },
  });

  /** @type {Array<{ jpeg: Uint8Array, widthPx: number, heightPx: number }>} */
  const out = [];
  for (const page of pages) {
    const c = document.createElement('canvas');
    c.width = PAGE.w; c.height = PAGE.h;
    const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    for (const op of page.ops) {
      if (op.type === 'rect') { ctx.fillStyle = op.colour; ctx.fillRect(op.x, op.y, op.w, op.h); }
      else if (op.type === 'text') {
        ctx.fillStyle = op.colour; ctx.font = `${op.bold ? 'bold ' : ''}${op.px}px ${FONT}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(op.text, op.x, op.y);
      } else {
        const img = images.get(op.url);
        if (img) ctx.drawImage(img, op.x, op.y, op.w, op.h);
      }
    }
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
    if (!blob) throw new Error('A page of the guidebook could not be made.');
    out.push({ jpeg: new Uint8Array(await /** @type {Blob} */ (blob).arrayBuffer()), widthPx: c.width, heightPx: c.height });
  }
  const pdf = jpegsToPdf(out, { title: meta.title });
  return { blob: new Blob([pdf], { type: 'application/pdf' }), missingPhotos: urls.length - images.size };
}
