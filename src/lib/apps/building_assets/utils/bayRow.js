// src/lib/apps/building_assets/utils/bayRow.js
// "Draw a row of bays": split one four-cornered outline into N parking bays.
// docs/requirements/app_designs/Parking_App_Design.md §7 — drawing bays one at a
// time is the setup cost that makes a car park tedious, and a cycle rack of
// ten bays unbearable.
//
// Pure: fractional plan coordinates in, polygons and numbers out. The outline
// may be at any angle and need not be a perfect rectangle — each bay is cut
// between matching points on the two long edges, so a row drawn along a
// slanted wall gives bays along that wall.

/**
 * Length of an edge in normalised-height units, the frame planMeasure uses:
 * x is scaled by the image's aspect ratio so a diagonal is measured truly.
 */
function edgeLen(a, b, AR = 1) {
  return Math.hypot((b.x - a.x) * AR, b.y - a.y);
}

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * Which pair of opposite sides is the LONG one: 0 for p0→p1 / p3→p2, 1 for
 * p1→p2 / p0→p3. A row of bays is split along its long side.
 */
export function longSide(poly, AR = 1) {
  const [p0, p1, p2, p3] = poly;
  const a = edgeLen(p0, p1, AR) + edgeLen(p3, p2, AR);
  const b = edgeLen(p1, p2, AR) + edgeLen(p0, p3, AR);
  return a >= b ? 0 : 1;
}

/**
 * Split a four-cornered outline into `n` bays along one pair of sides.
 * @param {{x:number,y:number}[]} poly  exactly four points, in drawing order
 * @param {number} n
 * @param {0|1} side  0 cuts along p0→p1, 1 along p1→p2
 * @returns {{x:number,y:number}[][]} n quadrilaterals, in order from the start of the side
 */
export function splitQuad(poly, n, side = 0) {
  if (!Array.isArray(poly) || poly.length !== 4) throw new Error('A row must be drawn with exactly four corners.');
  if (!Number.isInteger(n) || n < 1) throw new Error('Say how many bays.');
  // Rotate so the side being cut runs p0→p1, with p3→p2 opposite it.
  const [p0, p1, p2, p3] = side === 1 ? [poly[1], poly[2], poly[3], poly[0]] : poly;
  const bays = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    bays.push([lerp(p0, p1, t0), lerp(p0, p1, t1), lerp(p3, p2, t1), lerp(p3, p2, t0)]);
  }
  return bays;
}

/** Bay numbers: `prefix` + start, start+step, … — e.g. B1, B2 or 22, 24, 26. */
export function bayNumbers(n, start = 1, step = 1, prefix = '') {
  return Array.from({ length: n }, (_, i) => `${prefix ?? ''}${Number(start) + i * Number(step)}`);
}

/**
 * Numbers already used by a Parking bay on this floor. A reference is
 * floor/PK/number, so two bays with one number on one floor would share it.
 */
export function numberClashes(numbers, spaces, floorId, ignoreId = null) {
  const taken = new Set((spaces ?? [])
    .filter(s => s.kind === 'slot' && s.floor_id === floorId && s.id !== ignoreId && s.assigned_id)
    .map(s => String(s.assigned_id).trim().toUpperCase()));
  return numbers.filter(n => taken.has(n.toUpperCase()));
}

/**
 * The problem with a row, or null.
 * @param {{count:any, start:any, step:any}} opts
 */
export function validateRow(poly, { count, start, step }) {
  if (!Array.isArray(poly) || poly.length !== 4) return 'Only an outline with exactly four corners can be split into a row.';
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1) return 'Enter how many bays, a whole number.';
  if (n > 100) return 'That is more than 100 bays in one row. Split it into shorter rows.';
  if (!Number.isInteger(Number(start))) return 'The first bay number must be a whole number.';
  if (!Number.isInteger(Number(step)) || Number(step) < 1) return 'Number the bays in steps of 1 or more.';
  return null;
}
