// plan/planImageRenderer.js
// Draws annotated component markers onto a canvas copy of a floor plan image.
// Returns { base64, width, height } or null if no plan / image is available.
//
// Parameters:
//   floor      — the floor row
//   floorComps — components[] to annotate (already filtered to this floor)
//   plans      — all plans[] (to find the one matching this floor)
//   typeOfFn   — (component) => type_row | undefined  (passed in to avoid store import)

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
      const r        = Math.max(6,  Math.round(14 * scale));   // circle radius
      const initSize = Math.max(5,  Math.round(11 * scale));   // type initial inside circle
      const idSize   = Math.max(9,  Math.round(22 * scale));   // asset ID label
      const outlineW = Math.max(2,  Math.round(4  * scale));   // text outline width

      for (const c of floorComps) {
        if (c.x_position == null || c.y_position == null || c.plan_id !== plan.id) continue;
        const t      = typeOfFn(c);
        const colour = t?.colour ? `#${t.colour}` : '#8b5cf6';
        const x      = c.x_position * canvas.width;
        const y      = c.y_position * canvas.height;

        // Filled circle with white border
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur  = Math.max(2, Math.round(5 * scale));
        ctx.fillStyle   = colour;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = Math.max(1, Math.round(2 * scale));
        ctx.stroke();

        // Type initial inside circle
        ctx.fillStyle    = '#ffffff';
        ctx.font         = `bold ${initSize}px Arial`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t?.initial ?? '?', x, y);

        // Asset ID below circle — thick dark outline for legibility on any background
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
