// plan/planImageRenderer.js
// Draws annotated component markers onto a canvas copy of a floor plan image.
// Returns { base64, width, height } or null if no plan / image is available.
//
// Marker shapes match ComponentMarker.svelte exactly:
//   circle       - filled circle (default)
//   circle_inner - circle with an inner ring border
//   square       - filled square
//   square_inner - square with an inner square border ring
//   diamond      - square rotated 45 degrees (drawn as a polygon)
//
// Status badges match the live plan: yellow dot (problem), red dot (failed).
// Inactive components are drawn at 40% opacity.
//
// Parameters:
//   floor      - the floor row
//   floorComps - components[] to annotate (already filtered to this floor)
//   plans      - all plans[] (to find the one matching this floor)
//   typeOfFn   - (component) => type_row | undefined  (passed in to avoid store import)

// -- Helpers ------------------------------------------------------------------

/** Returns true when a hex colour (without #) is light enough to need dark text. */
function isLightColour(hex) {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.179;
}

/**
 * Draw the marker shape (circle, square, diamond, or _inner variants).
 * Returns with ctx.shadowBlur reset to 0.
 */
function drawShape(ctx, x, y, r, colour, shape, scale) {
  const strokeW       = Math.max(1, Math.round(2 * scale));
  const innerR        = r * 0.55;
  const lightBg       = isLightColour(colour);
  const innerColour   = lightBg ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)';

  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur  = Math.max(2, Math.round(5 * scale));
  ctx.fillStyle   = `#${colour}`;

  switch (shape) {
    case 'square':
    case 'square_inner':
      ctx.beginPath();
      ctx.rect(x - r, y - r, r * 2, r * 2);
      ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = strokeW;
      ctx.stroke();
      if (shape === 'square_inner') {
        ctx.beginPath();
        ctx.rect(x - innerR, y - innerR, innerR * 2, innerR * 2);
        ctx.strokeStyle = innerColour;
        ctx.lineWidth   = strokeW;
        ctx.stroke();
      }
      break;

    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(x,     y - r);
      ctx.lineTo(x + r, y    );
      ctx.lineTo(x,     y + r);
      ctx.lineTo(x - r, y    );
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = strokeW;
      ctx.stroke();
      break;

    case 'circle_inner':
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = strokeW;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, innerR, 0, Math.PI * 2);
      ctx.strokeStyle = innerColour;
      ctx.lineWidth   = strokeW;
      ctx.stroke();
      break;

    default: // 'circle'
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = strokeW;
      ctx.stroke();
      break;
  }

  ctx.shadowBlur = 0;
}

/** Draw a small status badge dot at the top-right of a marker. */
function drawStatusBadge(ctx, x, y, r, status, scale) {
  if (status !== 'problem' && status !== 'failed') return;
  const badgeR = Math.max(3, Math.round(5 * scale));
  const bx     = x + r * 0.68;
  const by     = y - r * 0.68;
  ctx.fillStyle = status === 'failed' ? '#ef4444' : '#facc15';
  ctx.beginPath();
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = Math.max(1, Math.round(1.5 * scale));
  ctx.stroke();
}

// -- Main export --------------------------------------------------------------

export async function drawAnnotatedPlanImage(floor, floorComps, plans, typeOfFn) {
  const plan = plans.find(p => p.floor_id === floor.id);
  if (!plan?.image_url) return null;

  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    const img    = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Scale marker sizes relative to image width so they remain legible
      // after the image is shrunk to fit the Word page (~1/3 native size).
      // Reference: 1500 px wide → scale 1.0.
      // No lower clamp — small plans get proportionally smaller markers.
      // Absolute pixel minimums keep text legible even at the smallest scale.
      // Upper clamp of 2.5 prevents enormous markers on very high-res scans.
      const scale    = Math.min(2.5, canvas.width / 1500);
      const r        = Math.max(6,  Math.round(14 * scale));   // marker radius
      const initSize = Math.max(5,  Math.round(11 * scale));   // initial font size
      const idSize   = Math.max(9,  Math.round(22 * scale));   // asset ID font size
      const outlineW = Math.max(2,  Math.round(4  * scale));   // asset ID outline width

      for (const c of floorComps) {
        if (c.x_position == null || c.y_position == null || c.plan_id !== plan.id) continue;

        const t      = typeOfFn(c);
        const colour = t?.colour ?? '8b5cf6';
        const shape  = t?.marker_shape ?? 'circle';
        const x      = c.x_position * canvas.width;
        const y      = c.y_position * canvas.height;

        // Inactive components are drawn at 40% opacity (matches live plan CSS opacity-40)
        if (c.status === 'inactive') ctx.globalAlpha = 0.4;

        // Draw marker shape
        drawShape(ctx, x, y, r, colour, shape, scale);

        // Type initial inside the marker
        const lightBg    = isLightColour(colour);
        const textColour = lightBg ? '#000000' : '#ffffff';
        ctx.fillStyle    = textColour;
        ctx.font         = `bold ${initSize}px Arial`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t?.initial ?? '?', x, y);

        // Restore opacity before drawing badge and asset ID (badge is always full opacity)
        ctx.globalAlpha = 1;

        // Status badge — top-right corner (yellow = problem, red = failed)
        drawStatusBadge(ctx, x, y, r, c.status, scale);

        // Asset ID below the marker — white text with thick dark outline for legibility
        const assetId = c.asset_id ?? '';
        if (assetId) {
          ctx.font         = `900 ${idSize}px Arial`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'top';
          ctx.lineWidth    = outlineW;
          ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
          ctx.lineJoin     = 'round';
          ctx.strokeText(assetId, x, y + r + Math.round(3 * scale));
          ctx.fillStyle    = '#ffffff';
          ctx.fillText(assetId, x, y + r + Math.round(3 * scale));
        }
      }

      resolve({
        base64: canvas.toDataURL('image/png').replace('data:image/png;base64,', ''),
        width:  canvas.width,
        height: canvas.height,
      });
    };

    img.onerror = () => resolve(null);
    img.src = plan.image_url;
  });
}
