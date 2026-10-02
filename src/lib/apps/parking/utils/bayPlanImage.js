// src/lib/apps/parking/utils/bayPlanImage.js
// The caretaker's printable bay plan: each basement plan drawn with its bays
// coloured by state and labelled with the bay number and who has it, then
// sent to /api/parking/bay-plan to become one Word page.
//
// Drawn in the browser, as the component report's plans are
// (building_assets/components/plan/planImageRenderer.js): only the browser
// can load the plan image and draw on it. The labels and the list are pure
// and tested; the canvas is not, because jsdom has none.

import { authHeaders } from '$lib/utils/authHeaders';
import { downloadResponse } from '$lib/utils/download.js';
import { fmtGenerated, today } from '$lib/utils/dates.js';
import { BAY_STATES, BAY_STATE } from './bayModel.js';

const short = (s, n = 18) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? '');

/** The holder's name as it should appear on the plan: company first. */
function holderShort(h) {
  return h ? short(h.company_name || h.display_name) : '';
}

/**
 * What a bay says on the printed plan: its number, and who has it — or that
 * it is free. A caretaker reads this at a glance, so the empty ones say FREE.
 */
export function bayPlanLabel(bay, holders = [], agreements = []) {
  const hById = new Map(holders.map(h => [h.id, h]));
  const number = bay.number ?? '?';
  switch (bay.state) {
    case 'allocated':  return { number, who: holderShort(hById.get(bay.current?.holder_id)) || 'Allocated' };
    case 'offered':    return { number, who: 'Offered' };
    // Held by a draft or a licence that starts later: never printed as FREE.
    case 'reserved':   return { number, who: holderShort(hById.get(bay.reserved?.holder_id)) || 'Reserved' };
    case 'out_of_use': return { number, who: 'OUT OF USE' };
    case 'not_for_allocation': return { number, who: 'Not allocated' };
    case 'demised': {
      // A demised bay belongs to a flat; show the flat, and the holder if recorded.
      const rec = agreements.find(a => a.bay_id === bay.bay_id
        && (a.status === 'active' || a.status === 'notice_given'));
      const who = holderShort(hById.get(rec?.holder_id));
      return { number, who: [bay.unit_ref, who].filter(Boolean).join(' · ') || 'Flat' };
    }
    default:           return { number, who: 'FREE' };
  }
}

/** The list on page two: every bay, its size, state, who has it, and the vehicles. */
export function bayPlanRows(bays = [], holders = [], agreements = [], vehicles = []) {
  const hById = new Map(holders.map(h => [h.id, h]));
  return bays.map(b => {
    const label = bayPlanLabel(b, holders, agreements);
    const holding = b.current ?? b.reserved ?? agreements.find(a => a.bay_id === b.bay_id
      && (a.status === 'active' || a.status === 'notice_given'));
    const h = hById.get(holding?.holder_id);
    return [
      b.ref,
      b.size ?? '',
      BAY_STATE[b.state]?.label ?? b.state,
      h ? `${h.company_name ? h.company_name + ' — ' : ''}${h.display_name}${b.unit_ref ? ' (' + b.unit_ref + ')' : ''}`
        : (label.who === 'FREE' ? 'Free' : label.who),
      vehicles.filter(v => v.agreement_id === holding?.id && !v.to_date).map(v => v.registration).join(', '),
    ];
  });
}

/**
 * Draw one plan with its bays. Resolves to { base64, width, height }, or null
 * if the image cannot be loaded.
 */
export function drawBayPlanImage(plan, bays, holders, agreements) {
  if (!plan?.image_url) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0);
      const W = canvas.width, H = canvas.height;
      // Text sized to survive the plan being shrunk to half a page.
      const scale = Math.max(1, W / 1500);
      const numSize = Math.round(22 * scale);
      const whoSize = Math.round(15 * scale);

      for (const bay of bays) {
        const poly = bay.space?.polygon ?? [];
        if (poly.length < 3) continue;
        const colour = BAY_STATE[bay.state]?.colour ?? '#94a3b8';
        ctx.beginPath();
        poly.forEach((v, i) => (i ? ctx.lineTo(v.x * W, v.y * H) : ctx.moveTo(v.x * W, v.y * H)));
        ctx.closePath();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = colour;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = Math.max(2, Math.round(2 * scale));
        ctx.strokeStyle = colour;
        ctx.stroke();

        // Centre of the bay, by the vertex average — bays are near-rectangles.
        const cx = poly.reduce((t, v) => t + v.x, 0) / poly.length * W;
        const cy = poly.reduce((t, v) => t + v.y, 0) / poly.length * H;
        const { number, who } = bayPlanLabel(bay, holders, agreements);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        const outline = (text, y, font) => {
          ctx.font = font;
          ctx.lineWidth = Math.max(3, Math.round(4 * scale));
          ctx.strokeStyle = '#ffffff';
          ctx.strokeText(text, cx, y);
          ctx.fillStyle = '#000000';
          ctx.fillText(text, cx, y);
        };
        outline(String(number), cy - whoSize * 0.6, `900 ${numSize}px Arial`);
        outline(who, cy + numSize * 0.6, `700 ${whoSize}px Arial`);
      }
      resolve({ base64: canvas.toDataURL('image/png').split(',')[1], width: W, height: H });
    };
    img.onerror = () => resolve(null);
    img.src = plan.image_url;
  });
}

/**
 * Draw every level that has bays and download the Word file.
 * @param {object} state  the parking store's state
 */
export async function downloadBayPlan(state, { building = 'Lancaster House' } = {}) {
  const levels = [];
  for (const floor of state.floors) {
    const bays = state.bays.filter(b => b.floor_id === floor.id);
    if (!bays.length) continue;
    const planIds = new Set(bays.map(b => b.plan_id));
    const plan = state.plans.find(p => planIds.has(p.id)) ?? state.plans.find(p => p.floor_id === floor.id);
    const img = await drawBayPlanImage(plan, bays.filter(b => b.plan_id === plan?.id), state.holders, state.agreements);
    if (img) levels.push({ name: floor.name, imageBase64: img.base64, width: img.width, height: img.height });
  }
  if (!levels.length) throw new Error('No basement plan could be drawn. Check the plans have images.');

  const res = await fetch('/api/parking/bay-plan', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      building,
      generatedAt: fmtGenerated(),
      levels,
      rows: bayPlanRows(state.bays, state.holders, state.agreements, state.vehicles),
      legend: BAY_STATES.map(s => ({ label: s.label, colour: s.colour })),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }
  const filename = `Parking_Bay_Plan_${today()}.docx`;
  await downloadResponse(res, filename);
  return { filename, levels: levels.length };
}
