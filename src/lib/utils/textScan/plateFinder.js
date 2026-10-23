// src/lib/utils/textScan/plateFinder.js
//
// Finding a number plate inside a wider camera picture (2026-10-23), so the
// reader is given a tight crop of just the plate rather than everything in a
// big guide box. Pure arithmetic on pixels, tested without a camera.
//
// A plate is a patch full of vertical strokes (the letters), in the shape of
// a plate, with calmer surroundings. So: mark where the picture changes
// sharply left-to-right, then slide plate-shaped windows over it at several
// sizes and keep the one whose inside is much busier than the ring round it.
// Colour does not matter (white front plates, yellow rear plates, a white
// car), which is why it does not look for a bright rectangle.

/** A plate's width to height (a UK one is 520 × 111 mm). */
export const PLATE_ASPECT = 4.7;

/**
 * Grey picture 0–255 from RGBA pixels, contrast stretched between the 2nd and
 * 98th percentile so a dim picture and a bright one score alike.
 * @param {Uint8ClampedArray} px @param {number} n pixels
 */
function greyStretched(px, n) {
  const g = new Float32Array(n), hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    g[i] = v; hist[Math.min(255, v | 0)]++;
  }
  let lo = 0, hi = 255, acc = 0;
  for (let t = 0; t < 256; t++) { acc += hist[t]; if (acc >= n * 0.02) { lo = t; break; } }
  acc = 0;
  for (let t = 255; t >= 0; t--) { acc += hist[t]; if (acc >= n * 0.02) { hi = t; break; } }
  const span = Math.max(100, hi - lo);   // never boost a flat, noisy picture into strokes
  for (let i = 0; i < n; i++) g[i] = Math.min(255, Math.max(0, ((g[i] - lo) / span) * 255));
  return g;
}

/**
 * Find the most plate-like window.
 *
 * @param {Uint8ClampedArray} px RGBA pixels of the search picture
 * @param {number} w @param {number} h
 * @param {{ aspect?: number, minWidth?: number, maxWidth?: number }} [o]
 *   widths as a fraction of the picture's width
 * @returns {{ x: number, y: number, w: number, h: number, score: number } | null}
 *   in the picture's pixels, or null when nothing looks like a plate
 */
export function findPlate(px, w, h, { aspect = PLATE_ASPECT, minWidth = 0.22, maxWidth = 0.98 } = {}) {
  if (w < 24 || h < 8) return null;
  const g = greyStretched(px, w * h);

  // Edge map: a left-to-right change big enough to be a letter's stroke.
  const E = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 1; x < w - 1; x++) {
    if (Math.abs(g[y * w + x + 1] - g[y * w + x - 1]) > 60) E[y * w + x] = 1;
  }
  // Integral image, one row and column bigger so sums need no edge cases.
  const W1 = w + 1;
  const I = new Uint32Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += E[y * w + x];
      I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row;
    }
  }
  /** sum of E over [x0,x1) × [y0,y1), clamped to the picture */
  const sum = (/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x1, /** @type {number} */ y1) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
    if (x1 <= x0 || y1 <= y0) return 0;
    return I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
  };
  const area = (/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x1, /** @type {number} */ y1) =>
    Math.max(0, Math.min(w, x1) - Math.max(0, x0)) * Math.max(0, Math.min(h, y1) - Math.max(0, y0));

  /** @type {{ x: number, y: number, w: number, h: number, score: number } | null} */
  let best = null;
  const step = Math.max(2, Math.round(w / 90));
  for (let f = minWidth; f <= maxWidth + 1e-6; f *= 1.07) {
    const ww = Math.round(w * f), wh = Math.round(ww / aspect);
    if (wh < 6 || wh > h) continue;
    const padY = Math.round(wh * 0.5);
    for (let y = 0; y + wh <= h; y += Math.max(1, Math.round(step / 2))) {
      for (let x = 0; x + ww <= w; x += step) {
        const a = area(x, y, x + ww, y + wh);
        const inside = sum(x, y, x + ww, y + wh) / a;
        if (inside < 0.07) continue;
        // The calm ring is only the strips above and below: a plate's own
        // letters run on to its left and right, so a window covering part of
        // it must not be penalised for the rest.
        const up = area(x, y - padY, x + ww, y), dn = area(x, y + wh, x + ww, y + wh + padY);
        const ra = up + dn;
        const ring = ra > 0 ? (sum(x, y - padY, x + ww, y) + sum(x, y + wh, x + ww, y + wh + padY)) / ra : 0;
        // Busy inside and calmer above and below; a bigger window of the same
        // kind scores higher so the whole plate wins over a part of it.
        const contrast = inside - 0.9 * ring;
        if (contrast < 0.05) continue;       // not busier than its surroundings: not a plate
        const score = contrast + 0.12 * f;
        if (!best || score > best.score) best = { x, y, w: ww, h: wh, score };
      }
    }
  }
  if (!best) return null;
  return refine(best, sum, w, h, aspect);
}

/**
 * The best window is usually only part of the plate (a few letters are enough
 * to win), so grow it along the row of letters until the strokes stop, then
 * fit the height to where the letters are.
 * @param {{ x: number, y: number, w: number, h: number, score: number }} b
 * @param {(x0: number, y0: number, x1: number, y1: number) => number} sum
 * @param {number} w @param {number} h @param {number} aspect
 */
function refine(b, sum, w, h, aspect) {
  const y0 = Math.max(0, Math.round(b.y - b.h * 0.2)), y1 = Math.min(h, Math.round(b.y + b.h * 1.2));
  const need = Math.max(1, (y1 - y0) * 0.1);               // a column with strokes in it
  const gapMax = Math.max(3, Math.round(b.w * 0.09));      // wider than the gap between letters
  const active = (/** @type {number} */ x) => sum(x, y0, x + 1, y1) >= need;
  let L = b.x, R = b.x + b.w;
  for (let gap = 0, x = L - 1; x >= 0 && gap <= gapMax; x--) { if (active(x)) { L = x; gap = 0; } else gap++; }
  for (let gap = 0, x = R; x < w && gap <= gapMax; x++) { if (active(x)) { R = x + 1; gap = 0; } else gap++; }
  // Where the letters are, up and down, over that width.
  const rowNeed = Math.max(1, (R - L) * 0.05);
  let T = Math.round(b.y), B = Math.round(b.y + b.h);
  while (T > 0 && sum(L, T - 1, R, T) >= rowNeed) T--;
  while (B < h && sum(L, B, R, B + 1) >= rowNeed) B++;
  const cx = (L + R) / 2, cy = (T + B) / 2;
  // Plate-shaped again: as wide as the letters, as tall as that needs.
  let ww = R - L, wh = Math.max(B - T, ww / aspect);
  if (wh * aspect > ww) ww = wh * aspect;
  ww = Math.min(w, ww); wh = Math.min(h, wh);
  const x = Math.min(Math.max(0, cx - ww / 2), w - ww), y = Math.min(Math.max(0, cy - wh / 2), h - wh);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(ww), h: Math.round(wh), score: b.score };
}

/**
 * The crop to read: the found window grown a little each way (so the plate's
 * own edge and the letters' tops are inside) and kept inside the picture.
 * @param {{ x: number, y: number, w: number, h: number }} r the found window
 * @param {number} W @param {number} H the picture's size
 * @param {number} [grow] fraction of the window's height added each side
 */
export function plateCrop(r, W, H, grow = 0.18) {
  const gx = r.h * grow * 1.5, gy = r.h * grow;
  const x0 = Math.max(0, r.x - gx), y0 = Math.max(0, r.y - gy);
  const x1 = Math.min(W, r.x + r.w + gx), y1 = Math.min(H, r.y + r.h + gy);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
