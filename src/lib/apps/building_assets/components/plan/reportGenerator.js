// plan/reportGenerator.js
// Builds the report payload and the Word file — in this browser by default, or
// on the server (see BUILD_IN_BROWSER) — and triggers the file download.
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

import { today } from '../../../../utils/dates.js';
import { drawAnnotatedPlanImage } from './planImageRenderer.js';
import { requestDownload, downloadBlob } from '#lib/utils/download.js';

/**
 * ⭐ Where the Word file is built (2026-10-05).
 * true  — in this browser (#lib/docx/componentReport.js, loaded only when a
 *         report is asked for). The default: a whole building with plans did
 *         not fit the memory Northflank's free tier leaves the server.
 * false — on the server, /api/generate-report, which builds the same file with
 *         the same code. Kept working as the swap-back; nothing else changes.
 */
const BUILD_IN_BROWSER = true;

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function generateReportDocument(params) {
  const {
    reportTypes, building, filterSummary, generatedAt,
    includePlan, includeFullComponentList,
    planShowId = true, planShowLabel = false,
    showNotes = false, showLinked = false, showInspectionNotes = false,
    showAttributes = true, showConditions = true, showSpaces = false,
    filteredByFloor, plans, inspections,
    typeOfFn, systemOfFn, resolveAttrsFn,
    linkedRefsFn = () => '',
    conditionResultsFn = () => [],
    spacesFn = () => '',
  } = params;

  // -- Sort helper — matches the online inventory table -------------------
  // system presentation_order → inspection_sort_order (nulls last) → asset_id.
  function sortComponents(comps) {
    return [...comps].sort((a, b) => {
      const sa = systemOfFn(typeOfFn(a)), sb = systemOfFn(typeOfFn(b));
      const so = (sa?.presentation_order ?? 9999) - (sb?.presentation_order ?? 9999);
      if (so !== 0) return so;

      const iA = a.inspection_sort_order ?? null;
      const iB = b.inspection_sort_order ?? null;
      if (iA !== null && iB !== null && iA !== iB) return iA - iB;
      if (iA !== null && iB === null) return -1;
      if (iA === null && iB !== null) return 1;

      return (a.asset_id ?? '').localeCompare(b.asset_id ?? '',
        undefined, { numeric: true });
    });
  }

  // -- Per-floor payload (with optional annotated plan images) -----------
  const floorsPayload = await Promise.all(
    filteredByFloor.map(async ({ floor, components: comps }) => {
      const imageData = includePlan
        ? await drawAnnotatedPlanImage(floor, comps, plans, typeOfFn, { showId: planShowId, showLabel: planShowLabel })
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
          system_order:          sys?.presentation_order,
          type_order:            t?.presentation_order,
          inspection_sort_order: c.inspection_sort_order ?? null,
          status:                c.status,
          primary_attribute:     c.primary_attribute,
          attributes:            resolveAttrsFn(c),
          condition_results:     conditionResultsFn(c),
          notes:                 c.notes           ?? null,
          linked_component_ref:  linkedRefsFn(c),
          spaces:                spacesFn(c),
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
        image:       imageData?.blob    ?? null,
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
            system_order:         sys?.presentation_order,
            type_order:           t?.presentation_order,
            inspection_sort_order: c.inspection_sort_order ?? null,
            type_name:            t?.name   ?? c.type_code,
            asset_id:             c.asset_id,
            label:                c.label,
            status:               c.status,
            attributes:           resolveAttrsFn(c),
            condition_results:    conditionResultsFn(c),
            notes:                c.notes              ?? null,
            linked_component_ref: linkedRefsFn(c),
            spaces:               spacesFn(c),
            last_inspected:       insp?.inspected_at   ?? null,
            last_notes:           showInspectionNotes ? (insp?.inspector_notes ?? null) : null,
          };
        })
      )
    : [];

  const options = { reportTypes, building, filterSummary, generatedAt, showNotes, showLinked, showInspectionNotes, showAttributes, showConditions, showSpaces };

  // -- Build here ---------------------------------------------------------
  if (BUILD_IN_BROWSER) {
    const { buildComponentReport } = await import('#lib/docx/componentReport.js');
    const { bytes, filename } = await buildComponentReport({
      building,          // as an admin named it (Admin → Building & business)
      options,
      floors:        floorsPayload.map(({ image, ...rest }) => rest),
      allComponents: allComponentsPayload,
      async imageOf(fi) {
        const blob = floorsPayload[fi]?.image;
        return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
      },
    });
    downloadBlob(new Blob([bytes], { type: DOCX_TYPE }), filename);
    return { filename };
  }

  // -- Or POST to the server (the swap-back) -------------------------------
  // The plans travel as binary file parts beside the JSON, never as base64
  // inside it: that cost the server several copies of every plan at once.
  const form = new FormData();
  const floorsJson = floorsPayload.map(({ image, ...rest }, i) => {
    if (image) form.append(`image${i}`, image, `floor-${i}.png`);
    return { ...rest, imagePart: image ? `image${i}` : null };
  });
  form.append('payload', JSON.stringify({
    options,
    floors:        floorsJson,
    allComponents: allComponentsPayload,
  }));
  const filename = await requestDownload('/api/generate-report', {
    filename: `components-${today()}.docx`,
    body:     form,
  });

  return { filename };
}
