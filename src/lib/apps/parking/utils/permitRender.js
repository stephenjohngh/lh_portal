// parking/utils/permitRender.js
// Draws a parking permit on a canvas and returns it as an A4 PDF. Browser only.
// WHERE things go is permitLayout.js (pure, tested); this file only carries
// the steps out, and fits text the layout cannot measure.
//
// The template images are document_library files, loaded through the portal's
// own file proxy (same origin), so the canvas stays readable.

import { permitLayout, PAGE } from './permitLayout.js';
import { permitFilename } from './permitModel.js';
import { jpegToPdf } from '#lib/utils/jpegPdf.js';

const FONT = 'Georgia, "Times New Roman", serif';
const MIN_SCALE = 0.4;   // a value is shrunk to fit, but never below 40% of its size

/**
 * @param {object} permit     a parking_permits row (with its number)
 * @param {object} template   the parking_permit_templates row
 * @param {{ name: string, address?: string|null }} building
 * @param {{ background?: string|null, footer?: string|null }} imageUrls
 * @returns {Promise<{ bytes: Uint8Array, filename: string }>}
 */
export async function renderPermitPdf(permit, template, building, imageUrls) {
  const [background, footer] = await Promise.all([
    loadImage(imageUrls.background, 'background'),
    loadImage(imageUrls.footer, 'bottom'),
  ]);
  const images = { background, footer };

  const canvas = document.createElement('canvas');
  canvas.width = PAGE.width;
  canvas.height = PAGE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not draw the permit.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE.width, PAGE.height);

  for (const step of permitLayout(permit, template, building)) {
    if (step.type === 'image') {
      const img = images[step.which];
      if (img) drawFitted(ctx, img, step);
    } else {
      drawText(ctx, step);
    }
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('This browser could not produce the permit image.');
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const title = `Parking permit ${permit.permit_number}`;
  return { bytes: jpegToPdf(jpeg, PAGE.width, PAGE.height, { title }), filename: permitFilename(permit) };
}

/** An image, or null when the template has none. A set image that fails to load is an error, not a blank. */
function loadImage(url, which) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(
      `The permit's ${which} image could not be loaded. Check it in Permits → Permit template.`));
    img.src = url;
  });
}

/** Draw an image into a box, filling it (cover) or fitting inside it (contain), centred. */
function drawFitted(ctx, img, box) {
  const scale = box.fit === 'cover'
    ? Math.max(box.w / img.width, box.h / img.height)
    : Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
  ctx.restore();
}

/** Text that shrinks to fit its width (and its line count), outlined in white so it reads over any background. */
function drawText(ctx, step) {
  const maxLines = step.maxLines ?? 1;
  let size = step.size;
  let lines = [step.text];
  for (; size >= step.size * MIN_SCALE; size -= Math.max(1, Math.round(step.size * 0.04))) {
    ctx.font = `${step.bold ? 'bold ' : ''}${size}px ${FONT}`;
    lines = maxLines > 1 ? wrap(ctx, step.text, step.maxWidth) : [step.text];
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= step.maxWidth)) break;
  }
  lines = lines.slice(0, maxLines);

  ctx.textAlign = step.align;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.16);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.fillStyle = step.colour;
  lines.forEach((line, i) => {
    const y = step.y + i * size * 1.25;
    ctx.strokeText(line, step.x, y, step.maxWidth);
    ctx.fillText(line, step.x, y, step.maxWidth);
  });
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
