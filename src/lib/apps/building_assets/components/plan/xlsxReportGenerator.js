// plan/xlsxReportGenerator.js
// Builds the Excel report payload from the SHARED report model (the same matrix
// the CSV uses + the same pivot the Word summaries use), POSTs it to
// /api/generate-xlsx, and triggers the download. The server only styles the
// supplied data — all report logic lives in reportModel.js.
//
// params: {
//   building, filterSummary, generatedAt,
//   filteredComponents, filteredByFloor,
//   includeFloorSummary, includeFullSummary,   // which summary sheets to add
//   matrixCtx,                                 // ctx for buildComponentsMatrix
//   typeOfFn, systemOfFn,                       // resolve system/type names for pivots
// }
// Returns { filename }; throws on error.

import { buildComponentsMatrix, buildStatusPivot } from '../../utils/reportModel.js';
import { authHeaders }      from '$lib/utils/authHeaders';
import { downloadResponse } from '$lib/utils/download.js';

export async function generateXlsxDocument(params) {
  const {
    building, filterSummary, generatedAt,
    filteredComponents, filteredByFloor,
    includeFloorSummary = false, includeFullSummary = false,
    matrixCtx, typeOfFn, systemOfFn,
  } = params;

  // Detail matrix — identical to the CSV.
  const detail = buildComponentsMatrix(filteredComponents, filteredByFloor, matrixCtx);

  // Map components to the pivot input shape — carries presentation_order so the
  // summaries sort like the filters (not alphabetically).
  const pivotRows = (comps) => comps.map((c) => {
    const t   = typeOfFn(c);
    const sys = systemOfFn(t);
    return {
      system_name:  sys?.name ?? 'Other',
      type_name:    t?.name ?? c.type_code,
      status:       c.status,
      system_order: sys?.presentation_order,
      type_order:   t?.presentation_order,
    };
  });

  const floorSummaries = includeFloorSummary
    ? filteredByFloor.map(({ floor, components }) => ({
        floor: `${floor.short_name} — ${floor.name}`,
        ...buildStatusPivot(pivotRows(components)),
      }))
    : [];

  const fullSummary = includeFullSummary ? buildStatusPivot(pivotRows(filteredComponents)) : null;

  const res = await fetch('/api/generate-xlsx', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ building, filterSummary, generatedAt, detail, floorSummaries, fullSummary }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }

  const filename = `components-${new Date().toISOString().slice(0, 10)}.xlsx`;
  await downloadResponse(res, filename);
  return { filename };
}
