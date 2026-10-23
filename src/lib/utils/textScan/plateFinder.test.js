import { describe, it, expect } from 'vitest';
import { findPlate, plateCrop, PLATE_ASPECT } from './plateFinder.js';

/** A noisy dark picture with a pale plate of black strokes at (px, py). */
function scene(W, H, plate, strokes = true) {
  const px = new Uint8ClampedArray(W * H * 4);
  let s = 5;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < W * H; i++) { const v = 50 + rnd() * 20; px.set([v, v, v, 255], i * 4); }
  if (plate) {
    for (let y = plate.y; y < plate.y + plate.h; y++) for (let x = plate.x; x < plate.x + plate.w; x++) {
      const inLetter = strokes && y > plate.y + plate.h * 0.2 && y < plate.y + plate.h * 0.8 && Math.floor((x - plate.x) / 4) % 2 === 0;
      const v = inLetter ? 20 : 230;
      px.set([v, v, v, 255], (y * W + x) * 4);
    }
  }
  return px;
}

describe('findPlate', () => {
  const W = 320, H = 133;
  it('finds a plate-shaped patch of strokes, wherever it sits', () => {
    for (const [x, y] of [[20, 20], [150, 60], [60, 90]]) {
      const plate = { x, y, w: 150, h: Math.round(150 / PLATE_ASPECT) };
      const f = findPlate(scene(W, H, plate), W, H);
      expect(f).not.toBeNull();
      const ix = Math.max(0, Math.min(f.x + f.w, plate.x + plate.w) - Math.max(f.x, plate.x));
      const iy = Math.max(0, Math.min(f.y + f.h, plate.y + plate.h) - Math.max(f.y, plate.y));
      expect((ix * iy) / (plate.w * plate.h)).toBeGreaterThan(0.6);
    }
  });
  it('finds nothing in a picture with no plate', () => {
    expect(findPlate(scene(W, H, null), W, H)).toBeNull();
  });
  it('keeps the window inside the picture and plate-shaped', () => {
    const f = findPlate(scene(W, H, { x: 100, y: 50, w: 180, h: 38 }), W, H);
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.x + f.w).toBeLessThanOrEqual(W);
    expect(f.y + f.h).toBeLessThanOrEqual(H);
    expect(f.w / f.h).toBeGreaterThan(3.5);
  });
  it('is quick enough to run on every live frame', () => {
    const px = scene(W, H, { x: 80, y: 40, w: 150, h: 32 });
    const t = performance.now();
    for (let i = 0; i < 5; i++) findPlate(px, W, H);
    expect((performance.now() - t) / 5).toBeLessThan(250);
  });
});

describe('plateCrop', () => {
  it('grows the window and stays inside the picture', () => {
    const c = plateCrop({ x: 0, y: 0, w: 100, h: 20 }, 320, 133);
    expect(c.x).toBe(0); expect(c.y).toBe(0); expect(c.w).toBeGreaterThan(100);
    const d = plateCrop({ x: 100, y: 50, w: 100, h: 20 }, 320, 133);
    expect(d.w).toBeGreaterThan(100); expect(d.x).toBeLessThan(100);
  });
});
