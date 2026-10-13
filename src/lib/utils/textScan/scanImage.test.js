import { describe, it, expect } from 'vitest';
import { guideCrop, readSize, greyAndStretch, blackAndWhite, withMargin, darkInMiddle, clearEdgesAndSpecks, closeGaps } from './scanImage.js';

describe('the guide box, in camera pixels', () => {
  it('a portrait phone showing a landscape camera: the box is centred in what is visible', () => {
    // 1920×1080 frame shown in a 390×600 view with object-fit: cover —
    // scale 600/1080, so the view shows the middle 702 frame pixels across.
    const c = guideCrop({ frameW: 1920, frameH: 1080, viewW: 390, viewH: 600, boxFraction: 0.82, aspect: 4.2 });
    expect(c.w).toBe(Math.round(702 * 0.82));
    expect(c.h).toBe(Math.round((702 * 0.82) / 4.2));
    expect(Math.abs(c.x + c.w / 2 - 960)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.y + c.h / 2 - 540)).toBeLessThanOrEqual(1);
  });

  it('never runs off the frame, even for a tall box in a short view', () => {
    const c = guideCrop({ frameW: 1280, frameH: 720, viewW: 1000, viewH: 300, boxFraction: 0.82, aspect: 2 });
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(1280);
    expect(c.y + c.h).toBeLessThanOrEqual(720);
  });
});

describe('the size it is read at', () => {
  it('enlarges small text and shrinks huge pictures', () => {
    expect(readSize(200, 30).h).toBe(64);      // a small crop is drawn up to 64 px tall
    expect(readSize(1000, 400).h).toBe(90);    // a large one down to 90
    expect(readSize(300, 72).h).toBe(72);      // in between, as it is
    expect(readSize(4000, 200).w).toBeLessThanOrEqual(1600);
  });
});

describe('grey and stretched', () => {
  it('turns a dim, low-contrast picture into black and white', () => {
    const px = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 100; i++) {
      const v = i < 50 ? 60 : 90;            // two dull greys
      px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = 255;
    }
    greyAndStretch(px);
    expect(px[0]).toBe(0);
    expect(px[99 * 4]).toBe(255);
    expect(px[99 * 4 + 1]).toBe(px[99 * 4]);   // grey: every channel the same
  });
});

describe('blackAndWhite', () => {
  /** @param {number[]} greys */
  const img = (greys) => {
    const px = new Uint8ClampedArray(greys.length * 4);
    greys.forEach((g, i) => { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g; px[i * 4 + 3] = 255; });
    return px;
  };
  const values = (px) => Array.from({ length: px.length / 4 }, (_, i) => px[i * 4]);

  it('splits a picture into black and white at the gap between its two groups of grey', () => {
    // mostly light ground (200-ish) with some dark letters (40-ish)
    const px = img([200, 210, 205, 40, 45, 198, 202, 50, 207, 199]);
    const r = blackAndWhite(px);
    expect(r.threshold).toBeGreaterThanOrEqual(50);
    expect(r.threshold).toBeLessThan(198);
    expect(values(px)).toEqual([255, 255, 255, 0, 0, 255, 255, 0, 255, 255]);
    expect(r.inverted).toBe(false);
  });

  it('turns light text on a dark ground round, so the reader gets dark on light', () => {
    const px = img([30, 35, 220, 40, 30, 215, 32, 38, 36, 34]);
    const r = blackAndWhite(px);
    expect(r.inverted).toBe(true);
    expect(values(px)).toEqual([255, 255, 0, 255, 255, 0, 255, 255, 255, 255]);
  });
});

describe('withMargin', () => {
  it('puts the picture in the middle of a white border', () => {
    const px = new Uint8ClampedArray(2 * 1 * 4);          // 2 × 1, black
    for (let i = 0; i < 2; i++) px[i * 4 + 3] = 255;
    const m = withMargin(px, 2, 1, 1);
    expect([m.w, m.h]).toEqual([4, 3]);
    const at = (x, y) => m.data[(y * m.w + x) * 4];
    expect([at(0, 0), at(1, 1), at(2, 1), at(3, 1), at(1, 2)]).toEqual([255, 0, 0, 255, 255]);
  });
});

/** A black-and-white picture from rows of '#' (dark) and '.' (light). */
function bw(rows) {
  const h = rows.length, w = rows[0].length;
  const px = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const v = ch === '#' ? 0 : 255; const i = (y * w + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
  }));
  return { px, w, h };
}
const rowsOf = ({ px, w, h }) => Array.from({ length: h }, (_, y) =>
  Array.from({ length: w }, (_, x) => (px[(y * w + x) * 4] === 0 ? '#' : '.')).join(''));

describe('darkInMiddle — which way round, from the middle (2026-10-13)', () => {
  it('a light plate ringed by dark bodywork is still dark-on-light', () => {
    // mostly dark overall, light in the middle: the car-park picture that was turned round
    const p = bw([
      '##########',
      '##......##',
      '##.#..#.##',
      '##......##',
      '##########',
    ]);
    expect(darkInMiddle(p.px, p.w, p.h)).toBe(false);
  });
  it('light letters on a dark ground are found', () => {
    const p = bw(['##########', '##########', '###.##.###', '##########', '##########']);
    expect(darkInMiddle(p.px, p.w, p.h)).toBe(true);
  });
});

describe('clearEdgesAndSpecks', () => {
  it('clears dark areas touching the edge and specks, and keeps the letters', () => {
    const p = bw([
      '##..........##',
      '##..###.....##',
      '##..#.#..#..##',
      '##..###.....##',
      '##..........##',
    ]);
    clearEdgesAndSpecks(p.px, p.w, p.h, 2);
    expect(rowsOf(p)).toEqual([
      '..............',
      '....###.......',
      '....#.#.......',
      '....###.......',
      '..............',
    ]);
  });
});

describe('closeGaps', () => {
  it('mends a nick in a stroke and leaves the gap between letters open', () => {
    const p = bw([
      '.........',
      '.#.#...#.',
      '.###...#.',
      '.#.#...#.',
      '.........',
    ]);
    const before = rowsOf(p);
    closeGaps(p.px, p.w, p.h, 1);
    const after = rowsOf(p);
    expect(after[1][2]).toBe('#');              // the nick at the top is filled
    expect(after[2].slice(4, 7)).toBe('...');   // the gap between the two shapes stays
    expect(before[2].slice(4, 7)).toBe('...');
  });
});
