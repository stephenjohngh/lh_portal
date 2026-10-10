import { describe, it, expect } from 'vitest';
import { guideCrop, readSize, greyAndStretch } from './scanImage.js';

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
    expect(readSize(200, 40).h).toBe(80);
    expect(readSize(1000, 400).h).toBe(160);
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
