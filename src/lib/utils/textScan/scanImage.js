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
 * How big to draw the crop for the reader. The reader (Tesseract's LSTM) works
 * best with letters about 30–40 px tall; a plate's letters are about two-thirds
 * of its height, so the crop is drawn 48–96 px tall (2026-10-12, was 80–160,
 * which made the letters far larger than it reads well). Larger only costs time.
 * @param {number} w @param {number} h
 */
export function readSize(w, h) {
  const target = Math.min(Math.max(h, 48), 96);
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

/**
 * Black and white (2026-10-12): the threshold that best splits the picture's
 * greys into two groups (Otsu's method), so glare, shadow and a yellow rear
 * plate become plain dark-on-light. Then made dark text on a light ground —
 * the way round the reader expects — by inverting when most of it is dark.
 * Run after greyAndStretch (it reads the red channel as the grey). In place.
 * @param {Uint8ClampedArray} px  RGBA, already grey
 * @returns {{ threshold: number, inverted: boolean }}
 */
export function blackAndWhite(px) {
  const n = px.length / 4;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[px[i * 4]]++;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  let dark = 0;
  for (let i = 0; i < n; i++) if (px[i * 4] <= threshold) dark++;
  const inverted = dark > n / 2;
  for (let i = 0; i < n; i++) {
    let v = px[i * 4] <= threshold ? 0 : 255;
    if (inverted) v = 255 - v;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  return { threshold, inverted };
}

/**
 * The picture with a white margin round it (2026-10-12). The reader is known to
 * read badly when letters touch the picture's edge; a crop of a plate that fills
 * the guide box does exactly that.
 * @param {Uint8ClampedArray} px  RGBA, `w` × `h`
 * @param {number} w @param {number} h @param {number} m  margin in px
 * @returns {{ data: Uint8ClampedArray, w: number, h: number }}
 */
export function withMargin(px, w, h, m) {
  const W = w + 2 * m, H = h + 2 * m;
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < h; y++) {
    out.set(px.subarray(y * w * 4, (y + 1) * w * 4), ((y + m) * W + m) * 4);
  }
  return { data: out, w: W, h: H };
}
