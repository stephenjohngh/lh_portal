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
 * best with letters a few tens of px tall; a plate's letters are about two-
 * thirds of its height, so the crop is drawn 64–90 px tall (2026-10-13, from the
 * user's car-park pictures: 64 and 90 read every frame, 48 dropped letters; it
 * was 80–160 before 2026-10-12). Larger only costs time.
 * @param {number} w @param {number} h
 */
export function readSize(w, h) {
  const target = Math.min(Math.max(h, 64), 90);
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
 * the way round the reader expects — by inverting when the MIDDLE is mostly
 * dark (pass `w` and `h`; see darkInMiddle), or the whole picture without them.
 * Run after greyAndStretch (it reads the red channel as the grey). In place.
 * @param {Uint8ClampedArray} px  RGBA, already grey
 * @param {number} [w] @param {number} [h]  the picture's size, to judge from its middle
 * @returns {{ threshold: number, inverted: boolean }}
 */
export function blackAndWhite(px, w = 0, h = 0) {
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
  for (let i = 0; i < n; i++) {
    const v = px[i * 4] <= threshold ? 0 : 255;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  // Which way round: from the middle when the size is known (darkInMiddle —
  // the whole crop is fooled by the dark bodywork round a plate), else the
  // whole picture.
  let inverted;
  if (w && h) inverted = darkInMiddle(px, w, h);
  else {
    let dark = 0;
    for (let i = 0; i < n; i++) if (px[i * 4] === 0) dark++;
    inverted = dark > n / 2;
  }
  if (inverted) invert(px);
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

/**
 * Which way round a black-and-white picture is, judged from its MIDDLE only
 * (2026-10-13). The whole crop will not do: a plate in the guide box is ringed
 * by dark bodywork, so a picture that is mostly dark at the edges is still dark
 * letters on a light plate in the middle — and judging by the whole crop turned
 * some frames round and not others, so the reading swung from exact to wild
 * with the phone held still. Light letters on a dark ground (some door numbers)
 * are still found, because then the middle is mostly dark too.
 * @param {Uint8ClampedArray} px  RGBA, black and white
 * @param {number} w @param {number} h
 * @returns {boolean} true when the middle is mostly dark (light text on dark)
 */
export function darkInMiddle(px, w, h) {
  const x0 = Math.floor(w * 0.2), x1 = Math.ceil(w * 0.8);
  const y0 = Math.floor(h * 0.3), y1 = Math.ceil(h * 0.7);
  let dark = 0, all = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) { all++; if (px[(y * w + x) * 4] === 0) dark++; }
  }
  return all > 0 && dark > all / 2;
}

/** Invert a black-and-white picture in place. @param {Uint8ClampedArray} px */
export function invert(px) {
  for (let i = 0; i < px.length; i += 4) { const v = 255 - px[i]; px[i] = px[i + 1] = px[i + 2] = v; }
}

/**
 * Tidy a dark-on-light black-and-white picture for the reader (2026-10-13), in
 * place: dark areas touching the picture's edge are made white — the bodywork,
 * bumper and plate border round a plate, which the reader otherwise reads as
 * letters — and so are dark specks too small to be a letter (dust, the dealer's
 * small print). What is left is the letters, which sit inside the plate and do
 * not touch the edge.
 * @param {Uint8ClampedArray} px  RGBA, black and white, dark text on light
 * @param {number} w @param {number} h
 * @param {number} [minArea]  smaller dark patches are specks; default 0.15% of the picture
 * @returns {{ edgeCleared: number, specksCleared: number }}  pixels made white
 */
export function clearEdgesAndSpecks(px, w, h, minArea = Math.max(4, Math.round(w * h * 0.0015))) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let edgeCleared = 0, specksCleared = 0;
  const isDark = (i) => px[i * 4] === 0;
  /** @param {number} start @returns {number[]} the patch's pixels, and whether it touched the edge */
  const patch = (start) => {
    const cells = [];
    let touches = false, top = 0;
    stack[top++] = start; seen[start] = 1;
    while (top) {
      const i = stack[--top];
      cells.push(i);
      const x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
      if (x > 0     && !seen[i - 1] && isDark(i - 1)) { seen[i - 1] = 1; stack[top++] = i - 1; }
      if (x < w - 1 && !seen[i + 1] && isDark(i + 1)) { seen[i + 1] = 1; stack[top++] = i + 1; }
      if (y > 0     && !seen[i - w] && isDark(i - w)) { seen[i - w] = 1; stack[top++] = i - w; }
      if (y < h - 1 && !seen[i + w] && isDark(i + w)) { seen[i + w] = 1; stack[top++] = i + w; }
    }
    return { cells, touches };
  };
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !isDark(i)) continue;
    const { cells, touches } = patch(i);
    if (touches || cells.length < minArea) {
      for (const c of cells) { px[c * 4] = px[c * 4 + 1] = px[c * 4 + 2] = 255; }
      if (touches) edgeCleared += cells.length; else specksCleared += cells.length;
    }
  }
  return { edgeCleared, specksCleared };
}


/**
 * Close small gaps in the letters (2026-10-13): a dark pixel is added wherever
 * one lies within `r` on every side, so a letter's stroke with a nick in it —
 * the plate font's D, which the reader then read as "II" — is whole again,
 * while the gap BETWEEN two letters (much wider than 2r) stays open.
 * (Dilate the dark, then erode it: a morphological closing.) In place.
 * @param {Uint8ClampedArray} px  RGBA, black and white, dark text on light
 * @param {number} w @param {number} h @param {number} [r]
 */
export function closeGaps(px, w, h, r = 1) {
  const n = w * h;
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) dark[i] = px[i * 4] === 0 ? 1 : 0;
  const grown = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let any = 0;
      for (let j = -r; j <= r && !any; j++) {
        const Y = y + j; if (Y < 0 || Y >= h) continue;
        for (let k = -r; k <= r; k++) { const X = x + k; if (X >= 0 && X < w && dark[Y * w + X]) { any = 1; break; } }
      }
      grown[y * w + x] = any;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let all = 1;
      for (let j = -r; j <= r && all; j++) {
        const Y = y + j; if (Y < 0 || Y >= h) continue;
        for (let k = -r; k <= r; k++) { const X = x + k; if (X >= 0 && X < w && !grown[Y * w + X]) { all = 0; break; } }
      }
      const v = all ? 0 : 255;
      const q = (y * w + x) * 4; px[q] = px[q + 1] = px[q + 2] = v;
    }
  }
}
