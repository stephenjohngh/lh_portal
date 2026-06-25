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
