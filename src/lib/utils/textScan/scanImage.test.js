import { describe, it, expect } from 'vitest';
import { guideCrop, readSize, greyAndStretch, blackAndWhite, withMargin, darkInMiddle, clearEdgesAndSpecks, closeGaps, brightestChannel, evenRows, darkerThanPlate, clearEdgesCuttingJoins, preparePlate, whiteOutBlue, dropEdgeBars } from './scanImage.js';

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
    expect(readSize(200, 30).h).toBe(80);      // a small crop is drawn up to 80 px tall
    expect(readSize(1000, 400).h).toBe(100);   // a large one down to 100
    expect(readSize(300, 90).h).toBe(90);      // in between, as it is
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

describe('blackAndWhite — each spot against its neighbourhood (2026-10-13)', () => {
  /** A grey picture from rows of numbers (0–255). */
  const grey = (rows) => {
    const h = rows.length, w = rows[0].length;
    const px = new Uint8ClampedArray(w * h * 4);
    rows.forEach((row, y) => row.forEach((g, x) => { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = g; px[i + 3] = 255; }));
    return { px, w, h };
  };
  const marks = ({ px, w, h }) => Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (px[(y * w + x) * 4] === 0 ? '#' : '.')).join(''));

  it('keeps pale letters on a bright plate, even beside a dark car (the plate under a light)', () => {
    // dark car (20) | bright plate (250) with pale letters (200) | dark car
    const row = (letter) => [20, 20, 20, 250, 250, 250, letter, 250, 250, letter, 250, 250, 250, 20, 20, 20];
    const p = grey([row(250), row(200), row(200), row(200), row(250)]);
    blackAndWhite(p.px, p.w, p.h);    // the shipped neighbourhood
    const m = marks(p);
    expect(m[2][6]).toBe('#');        // the pale letter is dark
    expect(m[2][9]).toBe('#');
    expect(m[2][7]).toBe('.');        // the plate between is light
  });

  it('turns light letters on a dark ground round, judged from the middle', () => {
    const row = (letter) => [30, 30, 30, letter, 30, 30, letter, 30, 30, 30];
    const p = grey([row(30), row(220), row(220), row(220), row(30)]);
    const r = blackAndWhite(p.px, p.w, p.h, { win: 1, t: 0.1 });
    expect(r.inverted).toBe(true);
    expect(marks(p)[2][3]).toBe('#');  // the light letter is now the dark one
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

describe('the second way for a number plate (2026-10-17, the user\'s pictures 7–9)', () => {
  /** A grey picture w × h filled with `bg`, then `paint(set)` marks spots. */
  const pic = (w, h, bg, paint) => {
    const px = new Uint8ClampedArray(w * h * 4);
    const set = (x, y, g) => { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = g; px[i + 3] = 255; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, bg);
    paint(set);
    return { px, w, h };
  };
  const dark = ({ px, w }, x, y) => px[(y * w + x) * 4] === 0;

  it('brightestChannel: a yellow plate is as bright as a white car', () => {
    const px = new Uint8ClampedArray([250, 220, 30, 255, 250, 250, 250, 255]);
    brightestChannel(px);
    expect(px[0]).toBe(250);
    expect(px[4]).toBe(250);
  });

  it('darkerThanPlate keeps the middle of a thick, washed-out stroke — blackAndWhite kept only its edges', () => {
    // A plate (240) under a light with pale letters packed close (200): strokes
    // 10 px wide, 5 px apart, in a crop 90 px tall — picture 9's B, 1 and 5.
    const make = () => pic(200, 90, 240, (set) => {
      for (const x0 of [60, 75, 90, 105]) for (let y = 15; y < 75; y++) for (let x = x0; x < x0 + 10; x++) set(x, y, 200);
    });
    const a = make();
    darkerThanPlate(a.px, a.w, a.h);
    expect(dark(a, 80, 45)).toBe(true);     // the middle of a stroke
    expect(dark(a, 72, 45)).toBe(false);    // the gap between strokes
    expect(dark(a, 30, 45)).toBe(false);    // the plate
    const b = make();
    blackAndWhite(b.px, b.w, b.h);
    expect(dark(b, 80, 45)).toBe(false);    // the old way loses the middle (picture 9)
  });

  it('evenRows: a band of shadow over the top of the plate stays plate, the letters stay dark', () => {
    // Rows 0–19 in shadow (plate 80), rows 20–59 in light (plate 210); a letter (20) through both.
    const p = pic(120, 60, 210, (set) => {
      for (let y = 0; y < 20; y++) for (let x = 0; x < 120; x++) set(x, y, 80);
      for (let y = 5; y < 55; y++) for (let x = 50; x < 60; x++) set(x, y, 20);
    });
    evenRows(p.px, p.w, p.h);
    darkerThanPlate(p.px, p.w, p.h);
    expect(dark(p, 20, 18)).toBe(false);    // shadowed plate, just above the light (picture 7)
    expect(dark(p, 55, 10)).toBe(true);     // the letter in the shadow
    expect(dark(p, 55, 40)).toBe(true);     // the letter in the light
  });

  it('clearEdgesCuttingJoins keeps a letter that touches a thin border running to the edge — clearEdgesAndSpecks took both', () => {
    // A thin border line (2 px) along row 4 from the left edge, touching a letter block below it.
    const make = () => pic(120, 60, 255, (set) => {
      for (let x = 0; x < 100; x++) { set(x, 4, 0); set(x, 5, 0); }
      for (let y = 6; y < 50; y++) for (let x = 40; x < 52; x++) set(x, y, 0);
    });
    const a = make();
    clearEdgesCuttingJoins(a.px, a.w, a.h);
    expect(dark(a, 46, 30)).toBe(true);     // the letter is kept
    expect(dark(a, 10, 4)).toBe(false);     // the border is cleared
    const b = make();
    clearEdgesAndSpecks(b.px, b.w, b.h);
    expect(dark(b, 46, 30)).toBe(false);    // the old way cleared the letter with it (pictures 7, 9)
  });

  it('preparePlate leaves black and white, the plate light and the letter dark', () => {
    const p = pic(120, 60, 200, (set) => { for (let y = 10; y < 50; y++) for (let x = 50; x < 62; x++) set(x, y, 30); });
    preparePlate(p.px, p.w, p.h);
    expect(new Set(Array.from(p.px.filter((_, i) => i % 4 === 0)))).toEqual(new Set([0, 255]));
    expect(dark(p, 56, 30)).toBe(true);
    expect(dark(p, 20, 30)).toBe(false);
  });
});

describe('plate preparation: the country band and a stray edge bar', () => {
  /** RGBA picture, white, with filled rectangles painted [x0,y0,x1,y1,[r,g,b]]. */
  const pic = (w, h, rects) => {
    const px = new Uint8ClampedArray(w * h * 4).fill(255);
    for (const [x0, y0, x1, y1, c] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; }
    return px;
  };
  it('paints blue white, leaves black alone', () => {
    const px = pic(4, 1, [[0, 0, 1, 1, [20, 60, 160]], [1, 0, 2, 1, [10, 10, 10]]]);
    whiteOutBlue(px);
    expect(px[0]).toBe(255);
    expect(px[4]).toBe(10);
  });
  it('clears a thin tall bar set apart from the letters, not letters sitting close together', () => {
    const black = [0, 0, 0];
    const letters = [[40, 10, 60, 50, black], [66, 10, 86, 50, black], [92, 10, 112, 50, black], [118, 10, 138, 50, black]];
    const withBar = pic(150, 60, [[8, 10, 16, 50, black], ...letters]);
    dropEdgeBars(withBar, 150, 60);
    expect(withBar[(30 * 150 + 10) * 4]).toBe(255);          // the bar is gone
    expect(withBar[(30 * 150 + 50) * 4]).toBe(0);            // a letter stays
    const close = pic(150, 60, [[24, 10, 32, 50, black], ...letters]);   // 8 px from the first letter: part of the text
    dropEdgeBars(close, 150, 60);
    expect(close[(30 * 150 + 28) * 4]).toBe(0);
  });
});
