// src/lib/utils/textScan/scanImage.js
//
// Getting the camera's picture ready to read (2026-10-10). Pure arithmetic on
// sizes and pixels, so it is tested without a camera.

/**
 * The part of the camera frame inside the on-screen guide box.
 *
 * The video fills its view with `object-fit: cover`, so the view shows a
 * centred crop of the frame. The guide box is `boxFraction` of the view's
 * width, `aspect` wide to 1 high, centred. Returned in FRAME pixels.
 * @param {{ frameW: number, frameH: number, viewW: number, viewH: number, boxFraction: number, aspect: number }} a
 */
export function guideCrop({ frameW, frameH, viewW, viewH, boxFraction, aspect }) {
  const scale = Math.max(viewW / frameW, viewH / frameH);   // cover
  const visW = viewW / scale, visH = viewH / scale;          // the visible frame, in frame pixels
  let w = visW * boxFraction;
  let h = w / aspect;
  if (h > visH * 0.9) { h = visH * 0.9; w = h * aspect; }
  return {
    x: Math.round((frameW - w) / 2), y: Math.round((frameH - h) / 2),
    w: Math.round(w), h: Math.round(h),
  };
}

/**
 * How big to draw the crop for the reader: text reads best around 60–120 px
 * tall, and a larger picture only costs time.
 * @param {number} w @param {number} h
 */
export function readSize(w, h) {
  const target = Math.min(Math.max(h, 80), 160);
  let s = target / h;
  if (w * s > 1600) s = 1600 / w;
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/**
 * Grey, with the contrast stretched so the darkest 2% is black and the
 * lightest 2% white — a dim basement picture becomes a clear one. In place,
 * on canvas RGBA pixels.
 * @param {Uint8ClampedArray} px
 */
export function greyAndStretch(px) {
  const n = px.length / 4;
  const grey = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const g = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000 | 0;
    grey[i] = g; hist[g]++;
  }
  const cut = Math.floor(n * 0.02);
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > cut) break; }
  acc = 0;
  for (; hi > 0; hi--) { acc += hist[hi]; if (acc > cut) break; }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) {
    const v = Math.min(255, Math.max(0, ((grey[i] - lo) * 255) / span));
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  return px;
}
