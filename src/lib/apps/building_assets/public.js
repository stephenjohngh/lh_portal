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
 * ⚠ EXCEPTION — 'no_access': the inspector attended but could not assess the
 * component, so NO condition was observed and the status must not move. The
 * component keeps the last value anyone actually saw (and status_set_by/at keep
 * pointing at who set it). Only `last_inspection_id` advances, because the
 * attempt IS the most recent inspection event — that is what makes the UI able
 * to show "OK · last check: no access".
 *
 * Writing the status here would be worse than useless: it would overwrite a
 * known condition with a non-condition. Migration 167 backs this up by leaving
 * components_status_check without 'no_access', so if this guard is ever removed
 * the database raises instead of silently corrupting the record.
 *
 * Returns the patch applied so the caller can update its own in-memory copy.
 * @param {string} componentId
 * @param {{ result: string, inspectionId: string, userId: string }} args
 * @returns {Promise<Record<string, string>>} the fields actually written
 */
export async function applyInspectionResult(componentId, { result, inspectionId, userId }) {
  const patch = inspectionResultPatch(result, { inspectionId, userId });
  await api.update('components', componentId, patch);
  return patch;
}

/**
 * Build (without writing) the component patch an inspection result produces — the
 * pure half of applyInspectionResult, so the Inspection app's offline queue can
 * compute the patch at RECORD time (stamping status_set_at with the real
 * observation time) and have the syncer apply it later. The rule stays here; only
 * its execution moves. Keep this in lockstep with applyInspectionResult above.
 * @param {string} result  ok | problem | failed | inactive | no_access
 * @param {{ inspectionId: string, userId: string, at?: string }} args
 * @returns {Record<string, string>} the patch to apply to the component
 */
export function inspectionResultPatch(result, { inspectionId, userId, at = new Date().toISOString() }) {
  return result === 'no_access'
    ? {
        // Attempt recorded; condition unchanged (see applyInspectionResult).
        last_inspection_id: inspectionId,
        updated_by:         userId,
      }
    : {
        status:             result,
        last_inspection_id: inspectionId,
        status_set_by:      userId,
        status_set_at:      at,
        updated_by:         userId,
      };
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

// ── Component inspections ───────────────────────────────────────────────────
// An inspection record belongs to the component domain (its result drives the
// component's status — see applyInspectionResult). Both the Building Assets
// inline panel and the Inspection app create inspections, so the row shape lives
// here once rather than in each app. Applying the result to the component is a
// SEPARATE step (applyInspectionResult) so callers can do session/photo work in
// between.

/**
 * Latest inspection per component (deduped server-side RPC).
 * @param {string[]} componentIds
 */
export function getLatestInspections(componentIds) {
  return api.latestInspections(componentIds);
}

/**
 * Create a component_inspection row. `inspected_at` is stamped (now) unless the
 * caller supplies one. Returns the created row.
 * @param {object} fields  component_id, inspection_result, inspector_notes,
 *   checklist_results, inspected_by, and optionally walk_session_id / inspected_at
 */
export function createComponentInspection(fields) {
  return api.create('component_inspections', {
    inspected_at: new Date().toISOString(),
    ...fields,
  });
}

/**
 * Update an existing component_inspection (e.g. re-inspecting the same component
 * in a walk). Returns the updated row.
 * @param {string} id
 * @param {object} fields
 */
export function updateComponentInspection(id, fields) {
  return api.update('component_inspections', id, fields);
}

/**
 * Upsert a component_inspection by its (client-supplied) id — the write the
 * Inspection app's offline syncer uses so a create and a re-inspect are one
 * idempotent operation, and replaying a partly-synced queue converges.
 * @param {object} row  full component_inspections row INCLUDING id
 */
export function upsertComponentInspection(row) {
  return api.upsert('component_inspections', row);
}

// ── Floors ──────────────────────────────────────────────────────────────────
// Building Assets owns the floor model; the Admin app provides a management UI
// over it. Admin reaches floors through these functions rather than the table.

/** List floors in display order. */
export function listFloors() {
  return api.get('floors', { orderBy: 'level_order', ascending: true });
}

/**
 * Update floor fields (e.g. walk_order from the Admin Floors panel).
 * @param {string} id
 * @param {object} fields
 */
export function updateFloor(id, fields) {
  return api.update('floors', id, fields);
}

// -- Space types (admin-configurable list driving the space type pickers) ------
// `spaces.type` is free text; this list just supplies the options + the register
// filter. Managed from the Admin app (Other Config → Space Types).

/** List configured space types in display order. */
export function listSpaceTypes() {
  return api.get('space_types', { orderBy: 'presentation_order', ascending: true });
}

/** Create a type. @param {{value:string, presentation_order?:number, userId?:string|null}} data */
export function createSpaceType({ value, presentation_order = 0, userId = null }) {
  return api.create('space_types', { value: value.trim(), presentation_order, created_by: userId }, true);
}

/** Update a type (value / presentation_order). */
export function updateSpaceType(id, fields) {
  return api.update('space_types', id, fields, true);
}

/** Delete a type. Existing spaces keep their (free-text) type value. */
export function deleteSpaceType(id) {
  return api.delete('space_types', id);
}

// -- Open faults + the works schedules covering them ---------------------------
// Read by the Compliance app's position report, which shows open corrective
// work ADJACENT to the obligation figures and never inside them (a fault
// discharges no duty). Two accessors rather than one join, because they answer
// two questions and the second is only worth asking if the first returns
// anything.

/**
 * Components in one of the given statuses.
 *
 * `getAllIn` rather than `get`: it chunks the `.in()` and paginates past
 * PostgREST's 1,000-row cap. ⚠ That cap matters here — this building has 1,092
 * components, so a plain read is already inside the range where a silent
 * truncation would under-report the fault list, which is the one direction a
 * compliance surface must never be wrong in.
 *
 * @param {string[]} statuses e.g. ['failed', 'problem']
 */
export function listComponentsByStatus(statuses) {
  if (!statuses?.length) return Promise.resolve([]);
  return api.getAllIn('components', 'status', statuses, {
    select: 'id, asset_id, label, type_code, status, floor_id',
  });
}

/**
 * Works schedule lines for the given components, each with its schedule.
 *
 * ⚠ Returns lines on schedules of EVERY status, including drafts. Deciding
 * that a draft is not coverage is the reader's rule, not this accessor's —
 * `compliance/utils/correctiveWork.js` states it and a test pins it. An
 * accessor that filtered here would hide the distinction from the one place
 * that has to make it.
 *
 * @param {string[]} componentIds
 */
export function listWorksLinesFor(componentIds) {
  if (!componentIds?.length) return Promise.resolve([]);
  return api.getAllIn('works_schedule_items', 'component_id', componentIds, {
    select: 'component_id, action, schedule:works_schedules(id, title, reference, status, issued_at)',
  });
}


/**
 * Issued works schedules with an expected completion date — for the Planner.
 *
 * Only ISSUED ones: a draft has not been sent, so nobody is working to its
 * date, and a completed or cancelled one is finished. Not windowed below — a
 * completion date that has passed with the schedule still open is overdue.
 *
 * ⚠ `select: '*'` on purpose. `expected_completion` arrives with migration 219;
 * naming the column before it is applied would fail the whole read, and a
 * database without it simply returns rows with no date, which show nothing.
 *
 * @param {string} to  ISO date — nothing due after this is returned
 */
export async function listWorksDue(to) {
  const rows = await api.get('works_schedules', { select: '*', filters: { status: 'issued' } });
  return (rows ?? []).filter((w) => w.expected_completion && w.expected_completion <= to);
}
