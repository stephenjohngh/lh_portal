// src/lib/apps/walk/utils/inspectionFields.js
// Field name constants and helpers for walk_element_inspections table

export const INSPECTION_FIELDS = {
  ID: 'id',
  SESSION_ID: 'walk_session_id',
  ELEMENT_ID: 'plan_element_id',
  RESULT: 'inspection_result',
  NOTES: 'inspector_notes',
  PHOTO_URL: 'photo_url',
  INSPECTED_AT: 'inspected_at',
  INSPECTED_BY: 'inspected_by'
};

export const INSPECTION_RESULTS = {
  OK:       'OK',
  PROBLEM:  'problem',
  FAIL:     'failed',
  INACTIVE: 'inactive'
};

export const RESULT_LABELS = {
  [INSPECTION_RESULTS.OK]:       '✓ PASS',
  [INSPECTION_RESULTS.PROBLEM]:  '⚙ PROBLEM',
  [INSPECTION_RESULTS.FAIL]:     '✗ FAIL',
  [INSPECTION_RESULTS.INACTIVE]: '— INACTIVE'
};

export function getResultLabel(result) {
  return RESULT_LABELS[result] || result;
}

export function normalizeInspection(inspection) {
  if (!inspection) return null;
  return {
    id: inspection.id,
    walk_session_id: inspection.walk_session_id || inspection.session_id,
    plan_element_id: inspection.plan_element_id || inspection.element_id,
    inspection_result: inspection.inspection_result || inspection.result,
    inspector_notes: inspection.inspector_notes || inspection.notes,
    photo_url: inspection.photo_url,
    inspected_at: inspection.inspected_at,
    inspected_by: inspection.inspected_by
  };
}

export function createInspectionPayload({ elementId, result, notes, photoUrl }) {
  return {
    [INSPECTION_FIELDS.ELEMENT_ID]: elementId,
    [INSPECTION_FIELDS.RESULT]: result,
    [INSPECTION_FIELDS.NOTES]: notes || null,
    [INSPECTION_FIELDS.PHOTO_URL]: photoUrl || null
  };
}

export function getInspectionResult(inspection) {
  return inspection?.[INSPECTION_FIELDS.RESULT] || inspection?.result;
}

export function getInspectorNotes(inspection) {
  return inspection?.[INSPECTION_FIELDS.NOTES] || inspection?.notes || null;
}

export function isPassed(inspection) {
  return getInspectionResult(inspection) === INSPECTION_RESULTS.OK;
}

export function isFailed(inspection) {
  return getInspectionResult(inspection) === INSPECTION_RESULTS.FAIL;
}
