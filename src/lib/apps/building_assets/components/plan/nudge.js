// plan/nudge.js
// Arrow keys move the selected space, marker or note on the schematic
// (2026-11-09): one screen pixel per press, ten with Shift. Positions are
// fractions of the drawing (0–1), so a pixel is 1 / the canvas's drawn size.
// Nothing here saves; PlanViewTab shows the move at once and saves once the
// keys stop.

const STEP_LARGE = 10;

/**
 * The move one arrow key asks for, as fractions of the drawing, or null for
 * any other key.
 * @param {string} key  KeyboardEvent.key
 * @param {boolean} shift
 * @param {{width:number,height:number}} size  the canvas's drawn size in pixels
 */
export function arrowDelta(key, shift, size) {
  if (!size?.width || !size?.height) return null;
  const px = shift ? STEP_LARGE : 1;
  switch (key) {
    case 'ArrowLeft':  return { dx: -px / size.width, dy: 0 };
    case 'ArrowRight': return { dx:  px / size.width, dy: 0 };
    case 'ArrowUp':    return { dx: 0, dy: -px / size.height };
    case 'ArrowDown':  return { dx: 0, dy:  px / size.height };
    default:           return null;
  }
}

const clamp = v => Math.max(0, Math.min(1, v));

/** A marker or note moved, kept on the drawing. */
export function nudgePoint(pos, { dx, dy }) {
  return { x: clamp(pos.x + dx), y: clamp(pos.y + dy) };
}

/**
 * A space moved as a whole: the shape keeps its form, and the move is cut
 * short at the edge of the drawing rather than squashing a corner.
 * @param {{x:number,y:number}[]} polygon
 */
export function nudgePolygon(polygon, { dx, dy }) {
  if (!polygon?.length) return polygon;
  const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
  const mx = Math.max(-Math.min(...xs), Math.min(dx, 1 - Math.max(...xs)));
  const my = Math.max(-Math.min(...ys), Math.min(dy, 1 - Math.max(...ys)));
  return polygon.map(p => ({ x: p.x + mx, y: p.y + my }));
}

/**
 * Whether a key press belongs to whatever has focus rather than to the
 * schematic: typing in a box, or a control that uses the arrows itself.
 * @param {EventTarget|null} target
 */
export function keyBelongsToFocus(target) {
  const el = /** @type {HTMLElement|null} */ (target);
  if (!el || typeof el.closest !== 'function') return false;
  if (el.isContentEditable) return true;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
  return !!el.closest('[role="radio"],[role="radiogroup"],[role="slider"],[role="tab"],[role="listbox"],[role="option"],[role="menu"],[role="menuitem"],[role="spinbutton"]');
}
