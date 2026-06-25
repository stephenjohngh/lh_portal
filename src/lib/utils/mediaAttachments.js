// src/lib/utils/mediaAttachments.js
//
// Shared access for the polymorphic `media_attachments` table — photos/files
// keyed by (entity_type, entity_id) with no FK (migration 135). Every app stores
// its OWN entities' media here (component inspections, MOR cases, …), so the
// read / insert / purge shapes live in one module instead of being hand-rolled
// in each store (and bypassing api.js). This is to `media_attachments` what
// `documentApi.js` is to `document_library`.
//
// `purgeAttachments` deletes the underlying storage files first (best-effort,
// via driveUtils) and fetches the session token itself, so callers don't repeat
// that plumbing.

import { supabase }           from '$lib/supabaseClient';
import { deleteStorageFiles } from '$lib/utils/driveUtils.js';

/**
 * List attachments for one or more owning entities.
 * @param {string} entityType  e.g. 'component_inspection' | 'mor_case'
 * @param {string|string[]} entityIds
 * @returns {Promise<Array<{ entity_id: string, storage_url: string }>>}
 */
export async function listAttachments(entityType, entityIds) {
  const ids = Array.isArray(entityIds) ? entityIds : [entityIds];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('media_attachments')
    .select('entity_id, storage_url')
    .eq('entity_type', entityType)
    .in('entity_id', ids);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Insert attachment rows for one entity. No-op for an empty URL list.
 * @param {string} entityType
 * @param {string} entityId
 * @param {string[]} urls  storage URLs (already uploaded)
 * @param {string} userId
 * @param {{ mimeType?: string }} [opts]
 */
export async function addAttachments(entityType, entityId, urls, userId, { mimeType = 'image/jpeg' } = {}) {
  if (!urls || urls.length === 0) return;
  const now = new Date().toISOString();
  const rows = urls.map((url) => ({
    entity_type: entityType,
    entity_id:   entityId,
    storage_url: url,
    mime_type:   mimeType,
    created_at:  now,
    created_by:  userId,
  }));
  const { error } = await supabase.from('media_attachments').insert(rows);
  if (error) throw new Error(error.message);
}

/**
 * Delete all attachments for the given entities: clean up the storage files
 * (best-effort, swallowed on failure so the DB cleanup always runs) then remove
 * the rows. Safe to call when nothing matches.
 * @param {string} entityType
 * @param {string|string[]} entityIds
 */
export async function purgeAttachments(entityType, entityIds) {
  const ids = Array.isArray(entityIds) ? entityIds : [entityIds];
  if (ids.length === 0) return;
  const rows = await listAttachments(entityType, ids);
  if (rows.length > 0) {
    const { data: { session } } = await supabase.auth.getSession();
    await deleteStorageFiles(rows.map((r) => r.storage_url), session?.access_token);
  }
  const { error } = await supabase
    .from('media_attachments')
    .delete()
    .eq('entity_type', entityType)
    .in('entity_id', ids);
  if (error) throw new Error(error.message);
}
