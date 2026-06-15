// src/lib/server/docxHelpers.test.js
// pageProps() is the one bit of docxHelpers with a sharp edge: docx swaps
// width/height when orientation is LANDSCAPE, so pageProps must hand it the
// PORTRAIT dimensions and let it flip them. This pins that contract (a previous
// version passed pre-swapped landscape dims → page rendered portrait-width).

import { describe, it, expect } from 'vitest';
import { pageProps, PAGE_W, PAGE_H, MARGIN } from './docxHelpers.js';
import { PageOrientation } from 'docx';

describe('pageProps', () => {
  it('defaults to portrait A4 with 0.5in margins', () => {
    const p = pageProps();
    expect(p.page.size.orientation).toBe(PageOrientation.PORTRAIT);
    expect(p.page.size.width).toBe(PAGE_W);
    expect(p.page.size.height).toBe(PAGE_H);
    expect(p.page.margin).toEqual({ top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN });
  });

  it('landscape stamps the orientation flag but keeps PORTRAIT width/height (docx flips them)', () => {
    const p = pageProps({ landscape: true });
    expect(p.page.size.orientation).toBe(PageOrientation.LANDSCAPE);
    // Must be the portrait dims — docx swaps internally for landscape. Passing
    // the swapped dims here is the bug that left the page portrait-width.
    expect(p.page.size.width).toBe(PAGE_W);
    expect(p.page.size.height).toBe(PAGE_H);
  });

  it('honours an explicit margin override', () => {
    expect(pageProps({ margin: 360 }).page.margin).toEqual({ top: 360, right: 360, bottom: 360, left: 360 });
  });
});
