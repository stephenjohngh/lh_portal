// plan/reportGenerator.js
// Builds the full report payload, POSTs to the API, and triggers the file download.
// All pure logic with no Svelte store dependencies — the caller passes in
// resolved data so this module stays framework-agnostic.
//
// params: {
//   // Report configuration
//   reportTypes:              string[]  — e.g. ['plan', 'full_list', 'floor_summary', …]
//   building:                 string
//   filterSummary:            string
//   generatedAt:              string
//   includePlan:              boolean
//   includeFullComponentList: boolean
//   showNotes:                boolean   — include component notes column
//   showLinked:               boolean   — include linked-component reference column
//   showInspectionNotes:      boolean   — include inspection notes in notes column
//
//   // Data (already filtered to the desired scope)
//   filteredByFloor:         { floor, components }[]
//   plans:                   plan[]
//   inspections:             { [componentId]: inspection }
//
//   // Helper functions from the caller's closure
//   typeOfFn:                (component) => type | undefined
//   systemOfFn:              (type)      => system | undefined
//   resolveAttrsFn:          (component) => { name, value, display_type }[]
//   linkedRefsFn:            (component) => string  — joined to_component_ref values
//   conditionResultsFn:      (component) => { name, passed }[]
//                            Pre-resolved condition-attribute pass/fail array
//                            from the latest inspection's checklist_results.
//                            Empty array when component has no condition attrs
//                            or has never been inspected. The server renders
//                            this as a chip-style sub-row beneath each row.
// }
//
// Returns { filename } on success (download is triggered as a side-effect).
// Throws on validation failure or network error.

import { drawAnnotatedPlanImage } from './planImageRenderer.js';
import { authHeaders }            from '$lib/utils/authHeaders';
import { downloadResponse }       from '$lib/utils/download.js';

export async function generateReportDocument(params) {
  const {
    reportTypes, building, filterSummary, generatedAt,
    includePlan, includeFullComponentList,
    showNotes = false, showLinked = false, showInspectionNotes = false,
    filteredByFloor, plans, inspections,
    typeOfFn, systemOfFn, resolveAttrsFn,
    linkedRefsFn = () => '',
    conditionResultsFn = () => [],
  } = params;

  // -- Sort helper (System → Type → Asset ID) ----------------------------
  function sortComponents(comps) {
    return [...comps].sort((a, b) => {
      const ta = typeOfFn(a), tb = typeOfFn(b);
      const sa = systemOfFn(ta)?.name ?? '';
      const sb = systemOfFn(tb)?.name ?? '';
      return sa.localeCompare(sb) ||
             (ta?.name ?? '').localeCompare(tb?.name ?? '') ||
             (a.asset_id ?? '').localeCompare(b.asset_id ?? '',
               undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  // -- Per-floor payload (with optional annotated plan images) -----------
  const floorsPayload = await Promise.all(
    filteredByFloor.map(async ({ floor, components: comps }) => {
      const imageData = includePlan
        ? await drawAnnotatedPlanImage(floor, comps, plans, typeOfFn)
        : null;

      const sortedComps = sortComponents(comps);

      const resolvedComponents = sortedComps.map(c => {
        const t       = typeOfFn(c);
        const sys     = systemOfFn(t);
        // Latest inspection is always read so we can render the condition
        // sub-row + Last-inspected date. last_notes is only filled when
        // the user asked to include inspector-notes column.
        const insp    = inspections[c.id] ?? null;
        return {
          id:                    c.id,
          asset_id:              c.asset_id,
          label:                 c.label,
          type_code:             c.type_code,
          type_name:             t?.name    ?? c.type_code,
          type_initial:          t?.initial ?? '?',
          type_colour:           t?.colour  ?? '888888',
          system_name:           sys?.name  ?? '',
          status:                c.status,
          primary_attribute:     c.primary_attribute,
          attributes:            resolveAttrsFn(c),
          condition_results:     conditionResultsFn(c),
          notes:                 c.notes           ?? null,
          linked_component_ref:  linkedRefsFn(c),
          last_inspected:        insp?.inspected_at ?? null,
          last_notes:            showInspectionNotes ? (insp?.inspector_notes ?? null) : null,
        };
      });

      return {
        floor: {
          id:          floor.id,
          short_name:  floor.short_name,
          name:        floor.name,
          level_order: floor.level_order,
        },
        components:  resolvedComponents,
        imageBase64: imageData?.base64  ?? null,
        imageWidth:  imageData?.width   ?? null,
        imageHeight: imageData?.height  ?? null,
      };
    })
  );

  // -- Full combined component list (all floors) -------------------------
  const allComponentsPayload = includeFullComponentList
    ? filteredByFloor.flatMap(({ floor, components: comps }) =>
        sortComponents(comps).map(c => {
          const t    = typeOfFn(c);
          const sys  = systemOfFn(t);
          const insp = inspections[c.id] ?? null;
          return {
            floor_short:          floor.short_name,
            floor_order:          floor.level_order ?? 9999,
            system_name:          sys?.name ?? '',
            type_name:            t?.name   ?? c.type_code,
            asset_id:             c.asset_id,
            label:                c.label,
            status:               c.status,
            attributes:           resolveAttrsFn(c),
            condition_results:    conditionResultsFn(c),
            notes:                c.notes              ?? null,
            linked_component_ref: linkedRefsFn(c),
            last_inspected:       insp?.inspected_at   ?? null,
            last_notes:           showInspectionNotes ? (insp?.inspector_notes ?? null) : null,
          };
        })
      )
    : [];

  // -- POST to API -------------------------------------------------------
  const res = await fetch('/api/generate-report', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({
      options:       { reportTypes, building, filterSummary, generatedAt, showNotes, showLinked, showInspectionNotes },
      floors:        floorsPayload,
      allComponents: allComponentsPayload,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }

  // -- Trigger download --------------------------------------------------
  const filename = `components-${new Date().toISOString().slice(0, 10)}.docx`;
  await downloadResponse(res, filename);

  return { filename };
}
