// src/lib/utils/spaceRef.js
// Shared helpers for space reference strings — the space analogue of
// componentRef.js.
//
// A space ref is COMPOSED (not stored whole): "{floorShortName}/{Type}/{assignedId}"
//   Type = kind initial: space -> 'S', slot -> 'SL'
//   e.g. "B1/SL/017" (a basement Slot) or "G/S/12" (a ground-floor Space)
//
// Only spaces.assigned_id is stored on the row; the full ref is built at read
// time so renaming a floor never leaves a stale string (mirrors buildComponentRef).
// See docs/requirements/Spaces_Enhancement_Design.md §4.2.

/** kind -> reference "Type" segment. */
export const KIND_INITIAL = { space: 'S', slot: 'SL' };
/** kind -> user-facing label. */
export const KIND_LABEL = { space: 'Space', slot: 'Slot' };

/** The Type initial for a space's kind (defaults to Space). */
export function spaceKindInitial(kind) {
  return KIND_INITIAL[kind] ?? KIND_INITIAL.space;
}

// The stored assigned-id segment, with a stable fallback (mirrors componentRef's
// asset_id -> truncated-id fallback so build/find round-trip on the same value).
function assignedSegment(space) {
  return space.assigned_id || space.id?.slice(0, 8) || '?';
}

/**
 * Build the canonical ref for a space: "{floorShortName}/{Type}/{assignedId}".
 * @param {object}   space  - space row (kind, assigned_id, floor_id, id)
 * @param {object[]} floors - all floors[]
 * @returns {string} e.g. "B1/SL/017", or "—" when space is missing
 */
export function buildSpaceRef(space, floors = []) {
  if (!space) return '—';
  const floor = floors.find(f => f.id === space.floor_id);
  return `${floor?.short_name ?? '?'}/${spaceKindInitial(space.kind)}/${assignedSegment(space)}`;
}

/**
 * Format a stored/derived ref for display — dash when empty.
 * @param {string} ref
 */
export function fmtSpaceRef(ref) {
  return ref || '—';
}

/**
 * Find the space whose composed ref matches the given ref string.
 * Format: "{floorShortName}/{Type}/{assignedId}".
 * @param {string}   ref
 * @param {object[]} spaces
 * @param {object[]} floors
 * @returns {object|null}
 */
export function findSpaceByRef(ref, spaces, floors = []) {
  if (!ref || !spaces?.length) return null;
  const parts = ref.split('/');
  if (parts.length !== 3) return null;
  const [floorSN, initial, assignedId] = parts;
  return spaces.find(sp => {
    const floor = floors.find(f => f.id === sp.floor_id);
    return floor?.short_name === floorSN
      && spaceKindInitial(sp.kind) === initial
      && assignedSegment(sp) === assignedId;
  }) ?? null;
}
