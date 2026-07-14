// src/lib/apps/building_assets/utils/reportModel.js
//
// Shared, FORMAT-AGNOSTIC report data for the Components tab. One place builds
// the logical content; each export format renders it:
//   • CSV   — buildComponentsCsvRows (serialises the matrix to text rows)
//   • XLSX  — the client builds the matrix + pivots here and posts them to
//             /api/generate-xlsx, which only styles them (ExcelJS)
//   • DOCX  — /api/generate-report reuses buildStatusPivot for its summary tables
//
// Pure (no store/DOM). Type-1 testable. The low-level cell/attribute helpers it
// builds on live in componentsCsv.js.

import { csvEsc, findType, findSystem, sortComponentsForCsv, fixedAttrValuesByDef } from './componentsCsv.js';
import { availableFixedDefs, availableConditionDefs } from './attrFilters.js';

/**
 * The detail matrix — one row per component, with dynamic columns per the
 * Columns toggles. Shared by CSV and XLSX so they can never drift.
 *
 *   showLinked / showNotes / showInspectionNotes — single columns
 *   showAttributes — one column per FIXED attribute present across the filtered
 *                    components' types; cell = value, or '' if unset / N/A
 *   showConditions — one column per CONDITION attribute present; cell =
 *                    ✓ passed · ✗ failed · — applies-but-unrecorded ·
 *                    '' doesn't-apply-to-this-type
 *
 * Attribute/condition columns are sorted system → type → presentation_order
 * (via availableFixedDefs / availableConditionDefs — same shape as the filters).
 *
 * @returns {{ headers: string[], rows: (string)[][] }}
 * ctx: { types, systems, attrDefs, componentAttrs, componentLinks, inspections,
 *        showLinked, showNotes, showInspectionNotes, showAttributes, showConditions }
 */
export function buildComponentsMatrix(filteredComponents, filteredByFloor, ctx) {
  const {
    types, systems, attrDefs, componentAttrs, componentLinks, inspections,
    showLinked, showNotes, showInspectionNotes, showAttributes, showConditions,
    showSpaces, spacesByComponent = new Map(),
  } = ctx;

  const presentCodes = new Set(filteredComponents.map(c => c.type_code));
  const fixedDefs = showAttributes ? availableFixedDefs(types, systems, attrDefs, presentCodes) : [];
  const condDefs  = showConditions ? availableConditionDefs(types, systems, attrDefs, presentCodes) : [];

  const headers = ['Floor', 'System', 'Type', 'Asset ID', 'Label'];
  if (showSpaces)          headers.push('Space(s)');
  if (showLinked)          headers.push('Linked');
  if (showNotes)           headers.push('Notes');
  if (showInspectionNotes) headers.push('Insp. Notes');
  headers.push('Last Inspected');
  for (const d of fixedDefs) headers.push(d.name);
  for (const d of condDefs)  headers.push(d.name);
  headers.push('Status');

  const rows = [];
  for (const { floor, components: comps } of filteredByFloor) {
    for (const c of sortComponentsForCsv(comps, types, systems)) {
      const t          = findType(types, c);
      const sys        = findSystem(systems, t);
      const insp       = inspections[c.id] ?? null;
      const typeDefIds = new Set((t ? attrDefs[t.id] ?? [] : []).map(d => d.id));
      const fixedVals  = showAttributes ? fixedAttrValuesByDef(c, types, attrDefs, componentAttrs) : {};
      const checklist  = insp?.checklist_results ?? {};

      const row = [
        floor.short_name,
        sys?.name  ?? '',
        t?.name    ?? c.type_code,
        c.asset_id ?? '',
        c.label    ?? '',
      ];
      if (showSpaces)          row.push((spacesByComponent.get(c.id) ?? []).join(' | '));
      if (showLinked)          row.push((componentLinks[c.id] ?? []).map(l => l.to_component_ref).join(' | '));
      if (showNotes)           row.push(c.notes ?? '');
      if (showInspectionNotes) row.push(insp?.inspector_notes ?? '');
      row.push(insp?.inspected_at ? insp.inspected_at.slice(0, 10) : '');
      for (const d of fixedDefs) row.push(fixedVals[d.id] ?? '');
      for (const d of condDefs) {
        if (!typeDefIds.has(d.id)) { row.push(''); continue; }    // attribute doesn't apply
        const v = checklist[d.id];
        row.push(v === true ? '✓' : v === false ? '✗' : '—');
      }
      row.push(c.status ?? '');

      rows.push(row.map(v => String(v ?? '')));
    }
  }
  return { headers, rows };
}

/**
 * Components CSV — the detail matrix serialised to RFC-4180 text lines
 * (header first). Thin wrapper over buildComponentsMatrix.
 * @returns {string[]}
 */
export function buildComponentsCsvRows(filteredComponents, filteredByFloor, ctx) {
  const { headers, rows } = buildComponentsMatrix(filteredComponents, filteredByFloor, ctx);
  return [headers, ...rows].map(r => r.map(csvEsc).join(','));
}

/**
 * Status pivot — counts of OK/Problem/Failed/Inactive per System × Type, plus a
 * grand total. The single source of the report summaries: the DOCX endpoint and
 * the XLSX summary sheets both use it.
 *
 * Rows ordered by presentation_order (system_order, then type_order) when the
 * input carries it — matching the filters and the detail rows — falling back to
 * the system/type name. (Callers stamp system_order/type_order from the store's
 * presentation_order.)
 *
 * @param {Array<{ system_name?, type_name?, type_code?, status?, system_order?, type_order? }>} rows
 * @returns {{ pivot: Array<object>, totals: { ok, problem, failed, inactive, total } }}
 */
export function buildStatusPivot(rows) {
  const map = {};
  const totals = { ok: 0, problem: 0, failed: 0, inactive: 0, total: 0 };

  for (const c of rows ?? []) {
    const system_name = c.system_name ?? 'Other';
    const type_name   = c.type_name ?? c.type_code ?? '?';
    const key = `${system_name}|${type_name}`;
    if (!map[key]) map[key] = {
      system_name, type_name,
      system_order: c.system_order ?? 9999,
      type_order:   c.type_order ?? 9999,
      ok: 0, problem: 0, failed: 0, inactive: 0,
    };
    const s = (c.status ?? '').toLowerCase();
    if (s === 'ok' || s === 'problem' || s === 'failed' || s === 'inactive') {
      map[key][s]++;
      totals[s]++;
      totals.total++;
    }
  }

  const pivot = Object.values(map)
    .map(r => ({ ...r, total: r.ok + r.problem + r.failed + r.inactive }))
    .sort((a, b) =>
      (a.system_order - b.system_order) ||
      (a.type_order - b.type_order) ||
      a.system_name.localeCompare(b.system_name) ||
      a.type_name.localeCompare(b.type_name));

  return { pivot, totals };
}
