// src/lib/apps/building_assets/utils/spacePaste.js
// Copy and paste a space on a schematic (Schematics → ⬡ Spaces, 2026-11-09).
// Many spaces are alike (a row of parking bays, a run of stores), so a space
// can be copied and pasted: every detail comes with it, the copy lands BESIDE
// the one it was pasted from, and pasting again carries on along the row.
//
// What is copied: label, name, type, kind, colour, height, label shown and its
// size, notes, the outline. What is not: member overrides (pinned or excluded
// components belong to where the original is), and a parking bay's Parking
// record (Parking's own data; the copy is a bay with defaults until set there).
//
// The ID (assigned_id) must differ: a floor holds one space of a kind per ID
// (index spaces_ref_unique). An ID ending in a number goes up to the next free
// one (12 → 13, B07 → B08); a label or name that WAS the ID follows it. An ID
// with no number is left blank on the copy, to be typed.

// To 1/10,000 of the drawing: an arrow-key nudge is one screen pixel (2026-11-09).
const round4 = v => Math.round(v * 10000) / 10000;

/** @param {{x:number,y:number}[]} polygon */
export function polygonBounds(polygon = []) {
  const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const shift = (polygon, dx, dy) => polygon.map(p => ({ x: round4(p.x + dx), y: round4(p.y + dy) }));
const fits = polygon => { const b = polygonBounds(polygon); return b.minX >= 0 && b.minY >= 0 && b.maxX <= 1 && b.maxY <= 1; };

/**
 * Where the next copy goes: directly to the right of `polygon`, touching it;
 * if that leaves the schematic, directly below; failing both, a small step
 * down and right (kept on the schematic), so it can be dragged into place.
 * @param {{x:number,y:number}[]} polygon
 */
export function besidePolygon(polygon) {
  const b = polygonBounds(polygon);
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const right = shift(polygon, w, 0);
  if (fits(right)) return right;
  const below = shift(polygon, 0, h);
  if (fits(below)) return below;
  const dx = Math.min(0.02, 1 - b.maxX), dy = Math.min(0.02, 1 - b.maxY);
  return shift(polygon, Math.max(dx, -b.minX), Math.max(dy, -b.minY));
}

/**
 * Where to put the copy on `targetSpaces` (the target schematic's spaces):
 * at `base` if nothing there has that exact outline, otherwise beside it,
 * stepping on until the place is free (at most 50 steps).
 * @param {{x:number,y:number}[]} base
 * @param {{polygon:any}[]} targetSpaces
 */
export function pastePolygon(base, targetSpaces = []) {
  const sig = p => JSON.stringify(p.map(v => ({ x: round4(v.x), y: round4(v.y) })));
  const taken = new Set(targetSpaces.map(s => sig(s.polygon || [])));
  let poly = base.map(v => ({ x: round4(v.x), y: round4(v.y) }));
  for (let i = 0; i < 50 && taken.has(sig(poly)); i++) {
    const next = besidePolygon(poly);
    if (sig(next) === sig(poly)) break;
    poly = next;
  }
  return poly;
}

/**
 * The next free ID after `id` among `taken` (e.g. "12" → "13", "B07" → "B08",
 * "9" → "10"); null when `id` is blank or does not end in a number.
 * @param {string|null|undefined} id
 * @param {Set<string>} taken  IDs already used by this kind on the floor
 */
export function nextFreeId(id, taken = new Set()) {
  const m = /^(.*?)(\d+)$/.exec((id || '').trim());
  if (!m) return null;
  const [, prefix, digits] = m;
  let n = Number(digits);
  for (let i = 0; i < 10000; i++) {
    n += 1;
    const candidate = prefix + String(n).padStart(digits.length, '0');
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

/**
 * The fields of the pasted copy, ready for buildingAssetsStore.createSpace.
 * @param {object} source  the copied space row
 * @param {{ schematicId:string, floorId:string|null, polygon:{x:number,y:number}[],
 *           takenIds:Set<string> }} opts  takenIds: IDs of the same kind on the target floor
 */
export function buildPasteRow(source, { schematicId, floorId, polygon, takenIds = new Set() }) {
  const oldId  = (source.assigned_id || '').trim();
  const newId  = oldId ? nextFreeId(oldId, takenIds) : null;
  const follow = text => (oldId && newId && (text ?? '').trim() === oldId) ? newId : text;
  return {
    schematic_id: schematicId,
    floor_id:     floorId || null,
    label:        follow(source.label ?? null),
    name:         follow(source.name ?? ''),
    type:         source.type ?? null,
    kind:         source.kind === 'slot' ? 'slot' : 'space',
    colour:       source.colour,
    height_m:     source.height_m ?? null,
    show_label:   source.show_label ?? true,
    label_size:   source.label_size || 'normal',
    notes:        source.notes ?? null,
    polygon,
    assigned_id:  newId,
  };
}
