// src/lib/apps/building_assets/public.js
//
// PUBLIC INTERFACE of the Building Assets app — the cross-app contract for the
// `components` aggregate.
//
// This is the ONLY part of `building_assets/` that other apps (Inspection,
// Golden Thread, Maintenance, …) may use to read or change a component.
// Everything else under `building_assets/` — the stores, the Svelte components —
// is private to the app. Other apps import from HERE and nowhere else inside
// `building_assets/`.
//
// Why this file exists: a component is shared data, but the *rules* for changing
// one — above all "an inspection result becomes the component's status" — must
// live in exactly one readable place, not be copied into every app that happens
// to write the table. Read this file and you know precisely what the rest of the
// system can do to a component and what each operation means. There are no DB
// triggers behind it and no rule duplicated across stores: the behaviour is the
// code you see here.
//
// These functions are STATELESS. Each does the DB write (and the rule) and
// returns the result; the calling app updates its own reactive cache from the
// return value, and audit logging stays at the call site so it carries that
// app's context. (Component create/delete are intentionally NOT here — they have
// a single in-app caller, so they stay private to building_assets.)

import { api } from '$lib/utils/api';

/**
 * Read a single component by id. Cross-app reads — e.g. Golden Thread citing an
 * asset — go through here rather than querying the table directly.
 * @param {string} id
 * @returns {Promise<object>} the component row
 */
export function getComponent(id) {
  return api.getById('components', id);
}

/**
 * Update component fields. The single canonical write: Building Assets' own store
 * and any other app both call this, so the write shape and the `updated_by`
 * stamp live in one place.
 * @param {string} id
 * @param {Record<string, any>} fields
 * @param {string} userId  stamped as updated_by
 * @returns {Promise<object>} the updated component row
 */
export function updateComponent(id, fields, userId) {
  return api.update('components', id, { ...fields, updated_by: userId });
}

/**
 * Apply an inspection result to a component — THE cross-app rule that an
 * inspection's result becomes the component's current status.
 *
 * This is the one and only place that rule lives. It used to be written two
 * different ways: the Inspection app set only `status` + `last_inspection_id`,
 * while the Building Assets inline panel also stamped `status_set_by` /
 * `status_set_at` — so the two paths drifted. Both now call this, which always
 * writes the full, consistent patch.
 *
 * Returns the patch applied so the caller can update its own in-memory copy.
 * @param {string} componentId
 * @param {{ result: string, inspectionId: string, userId: string }} args
 * @returns {Promise<{ status: string, last_inspection_id: string, status_set_by: string, status_set_at: string, updated_by: string }>}
 */
export async function applyInspectionResult(componentId, { result, inspectionId, userId }) {
  const patch = {
    status:             result,
    last_inspection_id: inspectionId,
    status_set_by:      userId,
    status_set_at:      new Date().toISOString(),
    updated_by:         userId,
  };
  await api.update('components', componentId, patch);
  return patch;
}

/**
 * Replace a component's full attribute set (delete-all, then re-insert the
 * non-empty values). Shared by every app that edits component attributes, so the
 * delete-then-insert shape isn't copied per app.
 * @param {string} componentId
 * @param {Record<string, string>} attrValues  { [type_attribute_id]: value }
 * @returns {Promise<Array<{ component_id: string, type_attribute_id: string, value: string }>>} the inserted rows
 */
export async function replaceComponentAttributes(componentId, attrValues) {
  await api.deleteMany('component_attributes', { component_id: componentId });
  const rows = Object.entries(attrValues)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([type_attribute_id, value]) => ({
      component_id: componentId,
      type_attribute_id,
      value: String(value),
    }));
  if (rows.length > 0) {
    await api.createMany('component_attributes', rows, false);
  }
  return rows;
}
