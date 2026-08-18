// src/lib/utils/planMarker.js
// Draw one component's position on a floor plan image.
//
// Extracted from the Inspection app's "show on floor plan" popup so Building
// Assets can offer the same thing. Only the DRAWING is shared: the two apps
// have deliberately different themes — Inspection is dark, monospaced and
// touch-sized, standard apps are Tailwind — and CLAUDE.md forbids mixing them.
// So each keeps its own chrome and they agree on what the picture looks like.
//
// Positions are stored NORMALISED (0..1 of the image's width and height), which
// is what makes this independent of how big the canvas ends up: the same
// component lands in the same place on a phone and on a desktop.

/** Default marker colour — the portal accent. Inspection passes its orange. */
const DEFAULT_ACCENT = '#3c9683';

/**
 * Paint the plan and mark the component on it.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {string} opts.imageUrl
 * @param {number|null} opts.x  normalised 0..1, or null when unplaced
 * @param {number|null} opts.y
 * @param {string} [opts.accent]
 * @param {number} [opts.maxHeightRatio]  share of the viewport height to fill
 * @param {string} [opts.markerFill]      centre of the marker; matches the app's surface
 * @returns {Promise<{ placed: boolean }>}
 * @throws {Error} when there is no image, or it cannot be loaded
 */
export function drawComponentOnPlan(canvas, {
  imageUrl, x, y,
  accent = DEFAULT_ACCENT,
  maxHeightRatio = 0.6,
  markerFill = '#0f172a',
} = {}) {
  return new Promise((resolve, reject) => {
    if (!canvas) { reject(new Error('No canvas to draw on')); return; }
    if (!imageUrl) { reject(new Error('No plan image available')); return; }

    const img = new Image();
    // The plan may be served from storage on another origin; without this the
    // canvas is tainted and any later read of it throws.
    img.crossOrigin = 'anonymous';

    img.onerror = () => reject(new Error('Failed to load plan image'));

    img.onload = () => {
      // Fit inside the container, never enlarge: a small plan blown up is
      // blurred, and the marker's position is what matters, not its size.
      const container = canvas.parentElement;
      const maxWidth  = container?.clientWidth || img.width;
      const maxHeight = (typeof window !== 'undefined' ? window.innerHeight : img.height)
        * maxHeightRatio;
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);

      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const placed = x != null && y != null;
      if (placed) {
        drawMarker(ctx, x * canvas.width, y * canvas.height, accent, markerFill);
      }
      resolve({ placed });
    };

    img.src = imageUrl;
  });
}

/**
 * A ringed dot with a crosshair through it.
 *
 * The crosshair is the point of the design: on a busy plan a dot alone is hard
 * to pick out, and the lines lead the eye to it from the edges of the drawing.
 */
function drawMarker(ctx, x, y, accent, fill) {
  const r = 10;

  ctx.shadowColor = accent;
  ctx.shadowBlur  = 15;

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;

  ctx.strokeStyle = accent;
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.moveTo(x - r * 2, y); ctx.lineTo(x + r * 2, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - r * 2); ctx.lineTo(x, y + r * 2); ctx.stroke();
}
