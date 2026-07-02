// src/lib/apps/inspection/public.js
//
// PUBLIC INTERFACE of the Inspection app — the cross-app contract for inspection
// walk sessions. Other apps (the Building Assets "Inspections" tab) act on a
// session through here instead of reaching into walk_sessions /
// component_inspections / media_attachments themselves.
//
// Stateless, like building_assets/public.js: it does the DB work and returns;
// each caller refreshes its own view.

import { api }               from '$lib/utils/api';
import { purgeAttachments }  from '$lib/utils/mediaAttachments.js';
import { authHeaders }       from '$lib/utils/authHeaders';
import { registerDocument, findDocumentBySource } from '$lib/apps/golden_thread/public.js';

/**
 * Delete a walk session and everything under it, in FK-safe order: purge the
 * inspection photos (storage files + media_attachments rows), delete the
 * component_inspections, then the walk_sessions row.
 *
 * This is the single definition of "delete a session" — shared by the Inspection
 * app's own store and the Building Assets inspections tab, so the cascade order
 * can't drift between them.
 * @param {string} sessionId
 */
export async function deleteWalkSession(sessionId) {
  const inspRows = await api.getAll('component_inspections', { filters: { walk_session_id: sessionId } });
  await purgeAttachments('component_inspection', inspRows.map((r) => r.id));
  await api.deleteMany('component_inspections', { walk_session_id: sessionId });
  await api.delete('walk_sessions', sessionId);
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
