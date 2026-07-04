// src/lib/apps/inspection/public.js
//
// PUBLIC INTERFACE of the Inspection app — the cross-app contract for inspection
// walk sessions. Other apps (the Building Assets "Inspections" tab) act on a
// session through here instead of reaching into walk_sessions /
// component_inspections / media_attachments themselves.
//
// Stateless, like building_assets/public.js: it does the DB work and returns;
// each caller refreshes its own view.

import { api }                          from '$lib/utils/api';
import { purgeAttachments, listAttachments } from '$lib/utils/mediaAttachments.js';
import { normalisePhotoUrl }             from '$lib/utils/driveUtils.js';
import { authHeaders }                   from '$lib/utils/authHeaders';
import { registerDocument, findDocumentBySource } from '$lib/apps/golden_thread/public.js';

// One place owns the shape of a session's inspection rows: each row joined to its
// component + floor. Was duplicated verbatim in the Building Assets InspectionsTab
// and InspectionsReport before this accessor existed.
const SESSION_INSPECTION_SELECT =
  '*, component:components!component_id(asset_id, label, type_code, floor:floors!floor_id(short_name, level_order))';

/**
 * All inspection definitions (portal config, admin-maintained CRUD lives in the
 * Admin app), presentation order. Read by the Building Assets Inspections tab
 * and the mobile app's session-start list; due/overdue state is derived
 * client-side from these + closed sessions via computeInspectionSchedule.
 * @param {{ activeOnly?: boolean }} [opts]
 */
export function listInspectionDefinitions({ activeOnly = false } = {}) {
  const options = { orderBy: 'presentation_order' };
  if (activeOnly) options.filters = { active: true };
  return api.get('inspection_definitions', options);
}

/**
 * Rotating definitions: the most recent inspected_at per component across ALL
 * of this definition's sessions (open included — an in-progress trigger test
 * must not be re-picked). Feeds deriveNextTrigger.
 * @param {string} definitionId
 * @returns {Promise<Record<string, string>>} { componentId: ISO inspected_at }
 */
export async function lastDefinitionInspections(definitionId) {
  const sessions = await api.get('walk_sessions', {
    select:  'id',
    filters: { definition_id: definitionId },
  });
  if (sessions.length === 0) return {};
  const rows = await api.getAllIn('component_inspections', 'walk_session_id',
    sessions.map((s) => s.id), { select: 'component_id, inspected_at' });
  /** @type {Record<string, string>} */
  const last = {};
  for (const r of rows) {
    if (!r.inspected_at) continue;
    if (!last[r.component_id] || r.inspected_at > last[r.component_id]) {
      last[r.component_id] = r.inspected_at;
    }
  }
  return last;
}

/**
 * All walk sessions, newest first, with the inspector's name joined. The
 * cross-app read for the Building Assets Inspections tab (the Inspection app's
 * own store reads its own, user-scoped, subset directly).
 */
export function listWalkSessions() {
  return api.get('walk_sessions', {
    select:    '*, inspector:profiles!created_by(full_name)',
    orderBy:   'started_at',
    ascending: false,
  });
}

/**
 * A walk session's component_inspections (oldest first), each joined to its
 * component + floor. With `withPhotos`, merges photo_urls from media_attachments
 * (photos moved out of the JSONB column in migration 135). Returns raw rows —
 * callers apply flattenInspectionRows / enrichment.
 * @param {string} sessionId
 * @param {{ withPhotos?: boolean }} [opts]
 */
export async function loadSessionInspections(sessionId, { withPhotos = true } = {}) {
  // getAll paginates past the 1000-row cap (building-wide sessions can exceed it).
  const rows = await api.getAll('component_inspections', {
    select:  SESSION_INSPECTION_SELECT,
    filters: { walk_session_id: sessionId },
  });
  rows.sort((a, b) => new Date(a.inspected_at) - new Date(b.inspected_at));

  if (withPhotos && rows.length > 0) {
    const attachments = await listAttachments('component_inspection', rows.map((r) => r.id));
    const byId = {};
    for (const a of attachments) (byId[a.entity_id] ??= []).push(normalisePhotoUrl(a.storage_url));
    for (const r of rows) r.photo_urls = byId[r.id] ?? [];
  }
  return rows;
}

/**
 * Delete a walk session and everything under it.
 *
 * The component_inspections rows are removed by the DB when the session goes:
 * component_inspections.walk_session_id is FK ON DELETE CASCADE. But the
 * inspection PHOTOS in media_attachments are POLYMORPHIC (no FK — see
 * database_reference), so the cascade doesn't touch them: we must purge them
 * (storage files + rows) FIRST, while we can still read the inspection ids.
 * (A previous api.deleteMany('component_inspections', …) here was dead code —
 * component_inspections has no DELETE RLS policy, so it was a silent 0-row
 * no-op; the cascade is what actually deletes those rows.)
 *
 * This is the single definition of "delete a session" — shared by the Inspection
 * app's own store and the Building Assets inspections tab.
 * @param {string} sessionId
 */
export async function deleteWalkSession(sessionId) {
  const inspRows = await api.getAll('component_inspections', { filters: { walk_session_id: sessionId } });
  await purgeAttachments('component_inspection', inspRows.map((r) => r.id));
  await api.delete('walk_sessions', sessionId);   // FK cascade removes the component_inspections rows
}

// ── Golden Thread producer ingest (Stage B) ─────────────────────────────────
// An inspection has no stored report file — the Word report is generated on
// demand. To register a closed session, we regenerate the report and hand the
// blob to the register (which hashes it directly, since the bytes are in hand).

/**
 * Register a closed walk session's inspection report into the Golden Thread
 * register as a DRAFT, linked 'produced_by' back to the walk session.
 *
 * @param {object} session       resolved session (as the report endpoint expects)
 * @param {object[]} inspections  the session's component inspections
 * @param {{ schedule1_category?: number, title?: string }} opts
 * @param {string} userId
 * @returns {Promise<object>} the created gt_document draft
 */
export async function registerSessionReportToGoldenThread(session, inspections, opts, userId) {
  const res = await fetch('/api/generate-inspections-report', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ sessions: [{ session, inspections }], reportType: 'detailed' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Report generation failed (${res.status})`);
  }
  const blob = await res.blob();
  const file = new File([blob], `inspection-report-${session.id}.docx`,
    { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

  return registerDocument(
    {
      file,
      schedule1_category: opts?.schedule1_category ?? 10, // planned maintenance/inspection reports
      document_type:      'Inspection report',
      title:              opts?.title ?? `Inspection report — session ${String(session.id).slice(0, 8)}`,
    },
    { producedBy: { type: 'walk_session', id: session.id } },
    userId,
  );
}

/**
 * The register document produced from a walk session, or null — drives the
 * "Registered (GT-…)" state and blocks double-registration.
 * @param {string} sessionId
 */
export function findRegisteredSessionReport(sessionId) {
  return findDocumentBySource('walk_session', sessionId);
}
