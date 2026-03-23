// src/lib/apps/walk/utils/inspectionFields.js
// Field name constants and helpers for walk_element_inspections table
// Prevents bugs from using wrong field names (result vs inspection_result, etc.)

/**
 * Field name constants for walk_element_inspections table
 * Use these instead of string literals to prevent typos
 */
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

/**
 * Valid inspection result values
 */
export const INSPECTION_RESULTS = {
  OK: 'pass',
  PROBLEM: 'problem',
  FAIL: 'failed',
  INACTIVE: 'inactive'
};

/**
 * Human-readable labels for inspection results
 */
export const RESULT_LABELS = {
  [INSPECTION_RESULTS.OK]: '✓ PASS',
  [INSPECTION_RESULTS.PROBLEM]: '✗ PROBLEM',
  [INSPECTION_RESULTS.FAIL]: '✗ FAIL',
  [INSPECTION_RESULTS.INACTIVE]: 'INACTIVE'
};

/**
 * Get human-readable label for inspection result
 * @param {string} result - Inspection result ('pass', 'fail', 'na')
 * @returns {string} Formatted label
 */
export function getResultLabel(result) {
  return RESULT_LABELS[result] || result;
}

/**
 * Normalize inspection object to use correct field names
 * Handles legacy data with old field names (result/notes)
 * @param {Object} inspection - Raw inspection object
 * @returns {Object} Normalized inspection
 */
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

/**
 * Create inspection payload for API with correct field names
 * @param {Object} params - Inspection parameters
 * @param {string} params.elementId - Element ID
 * @param {string} params.result - Result (ok,failed,problem,inactive)
 * @param {string} params.notes - Optional notes
 * @param {string} params.photoUrl - Optional photo URL
 * @returns {Object} API-ready payload
 */
export function createInspectionPayload({ elementId, result, notes, photoUrl }) {
  return {
    [INSPECTION_FIELDS.ELEMENT_ID]: elementId,
    [INSPECTION_FIELDS.RESULT]: result,
    [INSPECTION_FIELDS.NOTES]: notes || null,
    [INSPECTION_FIELDS.PHOTO_URL]: photoUrl || null
  };
}

/**
 * Extract inspection result from object (handles both field names)
 * @param {Object} inspection - Inspection object
 * @returns {string} Result value
 */
export function getInspectionResult(inspection) {
  return inspection?.[INSPECTION_FIELDS.RESULT] || inspection?.result;
}

/**
 * Extract inspector notes from object (handles both field names)
 * @param {Object} inspection - Inspection object
 * @returns {string|null} Notes value
 */
export function getInspectorNotes(inspection) {
  return inspection?.[INSPECTION_FIELDS.NOTES] || inspection?.notes || null;
}

/**
 * Check if inspection passed
 * @param {Object} inspection - Inspection object
 * @returns {boolean} True if passed
 */
export function isPassed(inspection) {
  return getInspectionResult(inspection) === INSPECTION_RESULTS.PASS;
}

/**
 * Check if inspection failed
 * @param {Object} inspection - Inspection object
 * @returns {boolean} True if failed
 */
export function isFailed(inspection) {
  return getInspectionResult(inspection) === INSPECTION_RESULTS.FAIL;
}

/**
 * Check if inspection was N/A
 * @param {Object} inspection - Inspection object
 * @returns {boolean} True if N/A
 */
export function isNA(inspection) {
  return getInspectionResult(inspection) === INSPECTION_RESULTS.NA;
}
