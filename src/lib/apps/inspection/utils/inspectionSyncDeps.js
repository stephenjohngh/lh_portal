// src/lib/apps/inspection/utils/inspectionSyncDeps.js
//
// Wires the real server operations the syncer performs. Kept apart from
// inspectionSync.js so that file stays pure (deps-injected) and testable. Every
// component/inspection write still goes through the Building Assets public
// interface — the offline path does not get its own copy of those rules.

import { api } from '$lib/utils/api';
import { purgeAttachments, addAttachments } from '$lib/utils/mediaAttachments.js';
import { updateComponent, upsertComponentInspection } from '$lib/apps/building_assets/public.js';

/**
 * @returns {{
 *   upsertInspection: (row: object) => Promise<any>,
 *   upsertSession:    (row: object) => Promise<any>,
 *   completeSession:  (id: string, fields: object) => Promise<any>,
 *   purgeAttachments: typeof purgeAttachments,
 *   addAttachments:   typeof addAttachments,
 *   applyStatusPatch: (componentId: string, patch: object) => Promise<any>,
 * }}
 */
export function makeSyncDeps() {
  return {
    upsertInspection: (row) => upsertComponentInspection(row),
    upsertSession:    (row) => api.upsert('walk_sessions', row),
    completeSession:  (id, fields) => api.update('walk_sessions', id, fields, false),
    purgeAttachments,
    addAttachments,
    // The patch already carries updated_by (built by inspectionResultPatch);
    // pass it as the userId so updateComponent's stamp stays consistent.
    applyStatusPatch: (componentId, patch) => updateComponent(componentId, patch, patch.updated_by),
  };
}
