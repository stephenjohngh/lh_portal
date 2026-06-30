// src/lib/apps/building_assets/utils/componentsCsv.js
// LOW-LEVEL cell/attribute helpers for the Components-tab reports — the building
// blocks shared by every export format. The higher-level report builders (the
// column matrix, the status pivot, the CSV serializer) live in reportModel.js,
// which imports these. Pure (no store/DOM); Type-1 testable. See CLAUDE.md.

/** Find a component's type / a type's system. Exported for reportModel. */
export const findType   = (types, c)   => types.find(t => t.code === c.type_code);
export const findSystem = (systems, t) => (t ? systems.find(s => s.id === t.building_system_id) : null);

/** RFC 4180 cell escaping — quotes any value containing , " \n \r */
export function csvEsc(val) {
  const s = String(val ?? '');
  return (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

/**
 * Visible FIXED (non-condition) attributes for a component, resolved to
 * { name, value, display_type }. Mirrors ComponentsTab's resolveAttrs.
 * Empty-equivalent values ('None'/'No'/'Unknown'/blank) and unchecked
 * checkboxes are dropped.
 */
export function resolveFixedAttrs(component, types, attrDefs, componentAttrs) {
  const t = findType(types, component);
  if (!t) return [];
  const defs   = attrDefs[t.id] ?? [];
  const stored = componentAttrs[component.id] ?? [];
  const storedMap = {};
  for (const a of stored) storedMap[a.type_attribute_id] = a.value;
  return defs
    .filter(d => d.visible !== false && !d.checkable)
    .map(d => {
      const raw = storedMap[d.id] ?? d.default_value ?? null;
      if (raw == null || raw === '') return null;
      if (d.display_type === 'checkbox') {
        return raw === 'true' ? { name: d.name, value: 'Yes', display_type: 'checkbox' } : null;
      }
      const value = String(raw);
      if (value === 'None' || value === 'No' || value === 'Unknown') return null;
      return { name: d.name, value, display_type: d.display_type ?? 'text' };
    })
    .filter(Boolean);
}

/**
 * Sort components within a floor to MATCH THE ONLINE inventory table:
 * system presentation_order → inspection_sort_order (nulls last) → asset_id.
 * (Type is intentionally not a key — the online display doesn't sort by it.)
 */
export function sortComponentsForCsv(comps, types, systems) {
  return [...comps].sort((a, b) => {
    const sa = findSystem(systems, findType(types, a));
    const sb = findSystem(systems, findType(types, b));
    const so = (sa?.presentation_order ?? 9999) - (sb?.presentation_order ?? 9999);
    if (so !== 0) return so;

    // inspection_sort_order, nulls last
    const iA = a.inspection_sort_order ?? null;
    const iB = b.inspection_sort_order ?? null;
    if (iA !== null && iB !== null && iA !== iB) return iA - iB;
    if (iA !== null && iB === null) return -1;
    if (iA === null && iB !== null) return 1;

    return (a.asset_id ?? '').localeCompare(b.asset_id ?? '', undefined, { numeric: true });
  });
}

/**
 * Per-def map of a component's resolved FIXED attribute values: { [defId]: value }.
 * Same resolution as resolveFixedAttrs (drops empty-equivalent values + unticked
 * checkboxes) but keyed by def id, so each value can land in its own CSV column.
 */
export function fixedAttrValuesByDef(component, types, attrDefs, componentAttrs) {
  const t = findType(types, component);
  if (!t) return {};
  const defs   = attrDefs[t.id] ?? [];
  const stored = componentAttrs[component.id] ?? [];
  const storedMap = {};
  for (const a of stored) storedMap[a.type_attribute_id] = a.value;
  const out = {};
  for (const d of defs) {
    if (d.visible === false || d.checkable) continue;
    const raw = storedMap[d.id] ?? d.default_value ?? null;
    if (raw == null || raw === '') continue;
    if (d.display_type === 'checkbox') { if (raw === 'true') out[d.id] = 'Yes'; continue; }
    const value = String(raw);
    if (value === 'None' || value === 'No' || value === 'Unknown') continue;
    out[d.id] = value;
  }
  return out;
}

