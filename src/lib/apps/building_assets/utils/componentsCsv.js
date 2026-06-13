// src/lib/apps/building_assets/utils/componentsCsv.js
// Pure CSV/export + attribute-resolution logic for the Components tab.
// Extracted from ComponentsTab.svelte so the silent-bug-prone data→string
// transforms can be unit-tested without rendering (Type-1 in the testing
// blueprint; see CLAUDE.md "Testing"). No store/DOM access — everything is
// passed in.
import { conditionChecklistDisplay } from '../lookups.js';
import { availableConditionDefs }    from './attrFilters.js';

const findType   = (types, c)   => types.find(t => t.code === c.type_code);
const findSystem = (systems, t) => (t ? systems.find(s => s.id === t.building_system_id) : null);

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

/** Sort components within a floor: System → Type → Asset ID (numeric-aware). */
export function sortComponentsForCsv(comps, types, systems) {
  return [...comps].sort((a, b) => {
    const ta = findType(types, a), tb = findType(types, b);
    const sa = findSystem(systems, ta)?.name ?? '', sb = findSystem(systems, tb)?.name ?? '';
    return sa.localeCompare(sb) ||
           (ta?.name ?? '').localeCompare(tb?.name ?? '') ||
           (a.asset_id ?? '').localeCompare(b.asset_id ?? '', undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Inventory CSV: one row per component, attributes pipe-joined, condition
 * summary string. Returns the CSV lines as string[] (header first).
 * ctx: { types, systems, attrDefs, componentAttrs, componentLinks, inspections,
 *        showLinked, showNotes, showInspectionNotes }
 */
export function buildInventoryCsvRows(filteredByFloor, ctx) {
  const { types, systems, attrDefs, componentAttrs, componentLinks, inspections,
          showLinked, showNotes, showInspectionNotes } = ctx;

  const headers = ['Floor', 'System', 'Type', 'Asset ID', 'Label', 'Attributes'];
  if (showLinked)          headers.push('Linked');
  if (showNotes)           headers.push('Notes');
  if (showInspectionNotes) headers.push('Insp. Notes');
  headers.push('Last Inspected', 'Condition (last)', 'Status');

  const rows = [headers.map(csvEsc).join(',')];

  for (const { floor, components: comps } of filteredByFloor) {
    for (const c of sortComponentsForCsv(comps, types, systems)) {
      const t     = findType(types, c);
      const sys   = findSystem(systems, t);
      const attrs = resolveFixedAttrs(c, types, attrDefs, componentAttrs)
        .map(a => `${a.name}: ${a.value}`).join(' | ');
      const insp  = inspections[c.id] ?? null;
      const defs  = t ? (attrDefs[t.id] ?? []) : [];
      const cond  = conditionChecklistDisplay(insp, defs)
        .map(({ def, passed }) => {
          const g = passed === true ? '✓' : passed === false ? '✗' : '—';
          return `${def.name}: ${g}`;
        })
        .join(' | ');

      const row = [
        floor.short_name,
        sys?.name  ?? '',
        t?.name    ?? c.type_code,
        c.asset_id ?? '',
        c.label    ?? '',
        attrs,
      ];
      if (showLinked)          row.push((componentLinks[c.id] ?? []).map(l => l.to_component_ref).join(' | '));
      if (showNotes)           row.push(c.notes ?? '');
      if (showInspectionNotes) row.push(insp?.inspector_notes ?? '');
      row.push(insp?.inspected_at ? insp.inspected_at.slice(0, 10) : '');
      row.push(cond);
      row.push(c.status ?? '');

      rows.push(row.map(csvEsc).join(','));
    }
  }
  return rows;
}

/**
 * Condition-audit CSV: unpivoted, one column per condition attribute across
 * the types present. Cells: ✓ passed · ✗ failed · — applies-but-unrecorded ·
 * (blank) doesn't-apply-to-this-type.
 * Returns { rows } or { error } when there are no condition attributes.
 * ctx: { types, systems, attrDefs, inspections }
 */
export function buildConditionAuditCsvRows(filteredComponents, filteredByFloor, ctx) {
  const { types, systems, attrDefs, inspections } = ctx;

  const presentCodes = new Set(filteredComponents.map(c => c.type_code));
  const condDefs     = availableConditionDefs(types, systems, attrDefs, presentCodes);
  if (condDefs.length === 0) {
    return { error: 'No condition attributes for the filtered components — nothing to audit.' };
  }

  const headers = ['Floor', 'System', 'Type', 'Asset ID', 'Label', 'Last Inspected', 'Overall'];
  for (const d of condDefs) headers.push(d.name);

  const rows = [headers.map(csvEsc).join(',')];

  for (const { floor, components: comps } of filteredByFloor) {
    for (const c of sortComponentsForCsv(comps, types, systems)) {
      const t          = findType(types, c);
      const sys        = findSystem(systems, t);
      const insp       = inspections[c.id] ?? null;
      const typeDefIds = new Set((t ? attrDefs[t.id] ?? [] : []).map(d => d.id));
      const checklist  = insp?.checklist_results ?? {};

      const row = [
        floor.short_name,
        sys?.name  ?? '',
        t?.name    ?? c.type_code,
        c.asset_id ?? '',
        c.label    ?? '',
        insp?.inspected_at ? insp.inspected_at.slice(0, 10) : '',
        insp?.inspection_result ?? '',
      ];
      for (const d of condDefs) {
        if (!typeDefIds.has(d.id)) {
          row.push('');                                   // attribute doesn't apply
        } else {
          const v = checklist[d.id];
          row.push(v === true ? '✓' : v === false ? '✗' : '—');
        }
      }
      rows.push(row.map(csvEsc).join(','));
    }
  }
  return { rows };
}
