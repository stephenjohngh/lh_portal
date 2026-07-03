// src/lib/apps/building_assets/utils/componentsCsv.js
// LOW-LEVEL cell/attribute helpers for the Components-tab reports — the building
// blocks shared by every export format. The higher-level report builders (the
// column matrix, the status pivot, the CSV serializer) live in reportModel.js,
// which imports these. Pure (no store/DOM); Type-1 testable. See CLAUDE.md.

/** Find a component's type / a type's system. Exported for reportModel. */
export const findType   = (types, c)   => types.find(t => t.code === c.type_code);
export const findSystem = (systems, t) => (t ? systems.find(s => s.id === t.building_system_id) : null);

/**
 * RFC 4180 cell escaping — quotes any value containing , " \n \r — plus a
 * formula-injection guard (CWE-1236): spreadsheet apps evaluate a CSV cell that
 * begins with = + - @ (or a leading tab/CR), so a component label/note/attribute
 * of "=…" would run as a formula (DDE / data exfil) when a victim opens the file.
 * Prefix a single quote so the cell is treated as literal text. (CSV only — the
 * .xlsx export writes typed string cells, which Excel never evaluates. A leading
 * quote is also prepended to genuine negatives like "-5"; acceptable for these
 * mostly-text inventory exports.)
 */
export function csvEsc(val) {
  let s = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

/**
 * CORE fixed-attribute resolution (the single source both public shapes derive
 * from). Returns [{ def, value }] for each visible, non-condition attribute that
 * resolves to a meaningful value — empty-equivalent values ('None'/'No'/'Unknown'/
 * blank) and unchecked checkboxes are dropped; a ticked checkbox becomes 'Yes'.
 */
function resolveFixedAttrEntries(component, types, attrDefs, componentAttrs) {
  const t = findType(types, component);
  if (!t) return [];
  const stored = componentAttrs[component.id] ?? [];
  const storedMap = {};
  for (const a of stored) storedMap[a.type_attribute_id] = a.value;

  const out = [];
  for (const def of (attrDefs[t.id] ?? [])) {
    if (def.visible === false || def.checkable) continue;
    const raw = storedMap[def.id] ?? def.default_value ?? null;
    if (raw == null || raw === '') continue;
    if (def.display_type === 'checkbox') {
      if (raw === 'true') out.push({ def, value: 'Yes' });
      continue;
    }
    const value = String(raw);
    if (value === 'None' || value === 'No' || value === 'Unknown') continue;
    out.push({ def, value });
  }
  return out;
}

/**
 * Visible FIXED (non-condition) attributes for a component, resolved to
 * { name, value, display_type }. Mirrors ComponentsTab's resolveAttrs.
 */
export function resolveFixedAttrs(component, types, attrDefs, componentAttrs) {
  return resolveFixedAttrEntries(component, types, attrDefs, componentAttrs)
    .map(({ def, value }) => ({ name: def.name, value, display_type: def.display_type ?? 'text' }));
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
 * Per-def map of a component's resolved FIXED attribute values: { [defId]: value }
 * — same resolution as resolveFixedAttrs, keyed by def id so each value can land
 * in its own CSV column.
 */
export function fixedAttrValuesByDef(component, types, attrDefs, componentAttrs) {
  return Object.fromEntries(
    resolveFixedAttrEntries(component, types, attrDefs, componentAttrs).map(({ def, value }) => [def.id, value]),
  );
}

