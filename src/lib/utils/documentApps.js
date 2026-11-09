// src/lib/utils/documentApps.js
//
// Which app a document_library row belongs to, read from its entity_type
// (Admin → Records → Document library → App filter, 2026-11-09). A row with no
// entity_type was added straight to the library (Admin's own upload): "Not
// attached". Imports nothing, so the server's list query and the screen share it.

/** @type {ReadonlyArray<{ key: string, label: string, types: string[] }>} */
export const DOCUMENT_APPS = Object.freeze([
  { key: 'cases',         label: 'Cases',          types: ['case'] },
  { key: 'compliance',    label: 'Compliance',     types: ['inspection_survey'] },
  { key: 'dossier',       label: 'Dossier',        types: ['dossier_pack'] },
  { key: 'golden_thread', label: 'Golden Thread',  types: ['gt_document'] },
  { key: 'info',          label: 'Info',           types: ['info_note'] },
  { key: 'inspection',    label: 'Inspection',     types: ['component_inspection'] },
  { key: 'maintenance',   label: 'Maintenance',    types: ['maintenance_document'] },
  { key: 'management',    label: 'Management',     types: ['issue'] },
  { key: 'mor',           label: 'MOR',            types: ['mor_case'] },
  { key: 'parking',       label: 'Parking',        types: ['parking_agreement', 'parking_permit_template'] },
  { key: 'workflow',      label: 'Workflow items', types: ['workflow_item'] },
]);

/** The key for rows attached to nothing. */
export const UNATTACHED = 'none';

/** @param {string|null|undefined} entityType @returns {string} the app's label */
export function documentAppLabel(entityType) {
  if (!entityType) return 'Not attached';
  return DOCUMENT_APPS.find((a) => a.types.includes(entityType))?.label ?? entityType;
}

/** @param {string} key @returns {string[]|null} the entity types, or null for an unknown key */
export function entityTypesForApp(key) {
  return DOCUMENT_APPS.find((a) => a.key === key)?.types ?? null;
}
