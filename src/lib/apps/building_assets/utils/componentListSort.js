// src/lib/apps/building_assets/utils/componentListSort.js
//
// The orders the Components table can be sorted in (user, 2026-11-09):
//   walk  — floor → system → walk order (inspection_sort_order, nulls last) → asset id.
//           The order the table always had, and still the default.
//   ref   — the reference as shown, Floor/Initial/AssetID: floor in building order (not
//           alphabetical: G before 1), then the type's initial, then the asset id as a
//           number (02 before 10).
//   label — the label as a number where it is one (flat 9 before flat 10); components
//           with no label come last either way; ties fall back to the ref order.
// Pure, no I/O.

const collate = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'en-GB', { numeric: true, sensitivity: 'base' });

export const SORT_KEYS = Object.freeze(['walk', 'ref', 'label']);

/**
 * @param {any[]} components
 * @param {{ key?: string, dir?: 'asc'|'desc' }} order
 * @param {{ floors?: any[], types?: any[], systems?: any[] }} ctx
 * @returns {any[]} a new, sorted array
 */
export function sortComponentList(components = [], { key = 'walk', dir = 'asc' } = {}, { floors = [], types = [], systems = [] } = {}) {
  const floorOrder = new Map(floors.map((f) => [f.id, f.level_order ?? 9999]));
  const typeOf = new Map(types.map((t) => [t.code, t]));
  const systemOrder = new Map(systems.map((s) => [s.id, s.presentation_order ?? 9999]));
  const level = (c) => floorOrder.get(c.floor_id) ?? 9999;
  const initial = (c) => typeOf.get(c.type_code)?.initial ?? '';

  /** @param {any} a @param {any} b */
  const byRef = (a, b) => (level(a) - level(b)) || collate(initial(a), initial(b)) || collate(a.asset_id, b.asset_id);

  /** @param {any} a @param {any} b */
  const byWalk = (a, b) => {
    if (level(a) !== level(b)) return level(a) - level(b);
    const sA = systemOrder.get(typeOf.get(a.type_code)?.building_system_id) ?? 9999;
    const sB = systemOrder.get(typeOf.get(b.type_code)?.building_system_id) ?? 9999;
    if (sA !== sB) return sA - sB;
    const iA = a.inspection_sort_order ?? null;
    const iB = b.inspection_sort_order ?? null;
    if (iA !== null && iB !== null && iA !== iB) return iA - iB;
    if (iA !== null && iB === null) return -1;
    if (iB !== null && iA === null) return 1;
    return collate(a.asset_id, b.asset_id);
  };

  const sign = dir === 'desc' ? -1 : 1;
  /** @param {any} a @param {any} b */
  const compare = (a, b) => {
    if (key === 'ref') return sign * byRef(a, b);
    if (key === 'label') {
      const la = String(a.label ?? '').trim();
      const lb = String(b.label ?? '').trim();
      if (!la !== !lb) return la ? -1 : 1;              // no label last, either way
      return sign * (collate(la, lb) || byRef(a, b));
    }
    return sign * byWalk(a, b);
  };
  return [...components].sort(compare);
}
