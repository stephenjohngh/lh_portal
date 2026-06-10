// plan/planMeasure.js
// Pure utility functions for plan scale and polygon measurements.
//
// Coordinate system: fractions 0–1 relative to plan image dimensions,
// matching components.x_position / y_position and spaces.polygon in the DB.
//
// AR = image aspect ratio (native width / native height).
// Distances are computed in "normalised-height" space where y is unchanged
// and x is multiplied by AR, so diagonal distances are correct regardless
// of the image's aspect ratio.

export const SPACE_TYPES = [
  'Plant Room', 'Office', 'Corridor', 'Lobby', 'Stairwell',
  'Riser', 'Car Park', 'External', 'WC', 'Store', 'Other',
];

export const SPACE_COLOURS = [
  { hex: '#a855f7', label: 'Purple' },
  { hex: '#3b82f6', label: 'Blue'   },
  { hex: '#22c55e', label: 'Green'  },
  { hex: '#f59e0b', label: 'Amber'  },
  { hex: '#ef4444', label: 'Red'    },
  { hex: '#06b6d4', label: 'Cyan'   },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#ec4899', label: 'Pink'   },
  // Special: transparent / no fill — stored as 'none' in DB
  { hex: 'none',    label: 'No fill' },
];

/**
 * Area-weighted centroid of a polygon — used for space label placement.
 * Uses the shoelace formula, which gives the correct visual centre for both
 * convex and concave (simple) polygons.  Falls back to vertex average for
 * degenerate inputs (< 3 vertices or near-zero area).
 * @param {Array<{x:number, y:number}>} polygon
 * @returns {{x:number, y:number}}
 */
export function centroid(polygon) {
  if (!polygon?.length) return { x: 0.5, y: 0.5 };
  const n = polygon.length;
  if (n < 3) {
    // Not a real polygon — average whatever vertices exist
    return {
      x: polygon.reduce((s, v) => s + v.x, 0) / n,
      y: polygon.reduce((s, v) => s + v.y, 0) / n,
    };
  }

  // Polygon area centroid (shoelace formula).
  // The vertex average used previously breaks for concave shapes such as
  // rectangles with corners cut out: extra vertices near the cutouts pull
  // the mean toward that region. The area centroid is independent of how
  // many vertices are placed along each edge.
  let area = 0;
  let cx   = 0;
  let cy   = 0;
  for (let i = 0; i < n; i++) {
    const j     = (i + 1) % n;
    const cross = polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
    area += cross;
    cx   += (polygon[i].x + polygon[j].x) * cross;
    cy   += (polygon[i].y + polygon[j].y) * cross;
  }
  area /= 2;

  if (Math.abs(area) < 1e-10) {
    // Degenerate / collinear — fall back to vertex average
    return {
      x: polygon.reduce((s, v) => s + v.x, 0) / n,
      y: polygon.reduce((s, v) => s + v.y, 0) / n,
    };
  }

  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/**
 * Derive metres_per_unit from a stored scale reference.
 * @param {{ x1:number, y1:number, x2:number, y2:number, metres:number }|null} scaleRef
 * @param {number|null} AR  image aspect ratio (width / height)
 * @returns {number|null}
 */
export function computeMetresPerUnit(scaleRef, AR) {
  if (!scaleRef || !AR) return null;
  const { x1, y1, x2, y2, metres } = scaleRef;
  const d = Math.sqrt(((x2 - x1) * AR) ** 2 + (y2 - y1) ** 2);
  return d > 0 ? metres / d : null;
}

/**
 * Polygon perimeter in metres (closed loop).
 * @param {Array<{x:number, y:number}>} polygon
 * @param {number} AR
 * @param {number} mpu  metres_per_unit
 * @returns {number|null}
 */
export function measurePerimeter(polygon, AR, mpu) {
  if (!polygon?.length || !AR || !mpu) return null;
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += Math.sqrt(((b.x - a.x) * AR) ** 2 + (b.y - a.y) ** 2);
  }
  return sum * mpu;
}

/**
 * Polygon floor area in m² via the shoelace formula in AR-corrected space.
 * @param {Array<{x:number, y:number}>} polygon
 * @param {number} AR
 * @param {number} mpu  metres_per_unit
 * @returns {number|null}
 */
export function measureArea(polygon, AR, mpu) {
  if (!polygon?.length || !AR || !mpu) return null;
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    area += (a.x * AR) * b.y - (b.x * AR) * a.y;
  }
  return Math.abs(area / 2) * mpu * mpu;
}

/**
 * Space volume in m³ = floor area × ceiling height.
 * Returns null if area or height is unavailable.
 * @param {Array<{x:number, y:number}>} polygon
 * @param {number} AR
 * @param {number} mpu   metres_per_unit
 * @param {number|null} heightM  ceiling height in metres
 * @returns {number|null}
 */
export function measureVolume(polygon, AR, mpu, heightM) {
  if (!heightM) return null;
  const area = measureArea(polygon, AR, mpu);
  return area != null ? area * heightM : null;
}

/**
 * All polygon edge lengths in metres, sorted ascending.
 * Useful for deriving the shortest and longest side of a space.
 * Returns [] if the polygon has fewer than 2 vertices or scale is unavailable.
 * @param {Array<{x:number, y:number}>} polygon
 * @param {number} AR
 * @param {number} mpu  metres_per_unit
 * @returns {number[]}
 */
export function measureSides(polygon, AR, mpu) {
  if (!polygon?.length || !AR || !mpu) return [];
  const sides = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sides.push(Math.sqrt(((b.x - a.x) * AR) ** 2 + (b.y - a.y) ** 2) * mpu);
  }
  return sides.sort((a, b) => a - b);
}

/**
 * Format a number to 1 decimal place, or '—' if null/undefined.
 * @param {number|null} n
 * @returns {string}
 */
export function fmt1(n) {
  return n != null ? n.toFixed(1) : '—';
}
