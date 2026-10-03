// src/lib/utils/mediaAttachments.js
//
// Shared access for the polymorphic `media_attachments` table — photos/files
// keyed by (entity_type, entity_id) with no FK (migration 135). Every app stores
// its OWN entities' media here (component inspections, MOR cases, …), so the
// read / insert / purge shapes live in one module instead of being hand-rolled
// in each store (and bypassing api.js). This is to `media_attachments` what
// `documentApi.js` is to `document_library`.
//
// `purgeAttachments` deletes the underlying storage files first (best-effort)
// and fetches the session token itself, so callers don't repeat that plumbing.
//
// ⛔ EVERY ROW RECORDS WHICH PROVIDER WROTE IT, and that is load-bearing rather
// than bookkeeping. `storage_provider` sat on this table unpopulated from the
// day it was created, so deletion had nothing to route on and fell back to the
// globally-active provider — which is a fact about today's configuration, not
// about the file. Changing STORAGE_PROVIDER therefore stranded everything
// written before it, permanently and silently. 30 files accumulated that way.
// PROJECT_STATUS §6hh.

import { supabase } from '$lib/supabaseClient';
import { accessToken } from '$lib/utils/authHeaders';
import { api } from '$lib/utils/api';

/**
 * List attachments for one or more owning entities.
 * @param {string} entityType  e.g. 'component_inspection' | 'mor_case'
 * @param {string|string[]} entityIds
 * @returns {Promise<Array<{ entity_id: string, storage_url: string }>>}
 */
export async function listAttachments(entityType, entityIds) {
  const ids = Array.isArray(entityIds) ? entityIds : [entityIds];
  if (ids.length === 0) return [];
  // ⛔ Chunked and paged (getAllIn). A building-wide walk has over a thousand
  // inspections: one .in() of every id overruns the request URL, and a single
  // read stops at 1,000 rows — and purge then deleted rows for files it had
  // never listed, leaving those files in storage with nothing naming them.
  return api.getAllIn('media_attachments', 'entity_id', ids, {
    // ⚠ `storage_provider` is selected because purge routes on it. Dropping it
    // from this list silently returns deletion to guessing.
    select:  'id, entity_id, storage_url, storage_provider',
    filters: { entity_type: entityType },
  });
}

/**
 * Delete stored files, each from the provider that owns it. It never throws —
 * it REPORTS, and the caller decides. ⛔ A caller about to remove the rows
 * should check `failed` first and keep them if it is not zero: a row pointing
 * at a missing file is recoverable, and a file with no row naming it is not
 * (purgeAttachments does, since 2026-09-27).
 *
 * ⚠ Returns the per-file results rather than swallowing them. The old version
 * discarded everything, which is how 30 undeletable files went unnoticed —
 * nothing failed loudly, nothing failed quietly, nothing was reported at all.
 *
 * ⛔ With no session, every file FAILS. It used to return "0 failed" when it had
 * no token, so a caller checking `failed` went on to remove the rows and left
 * the files in storage with nothing naming them (fixed 2026-10-02).
 *
 * @param {Array<{ storage_url: string, storage_provider?: string|null }>} rows
 * @returns {Promise<{ deleted: number, failed: number, results: any[] }>}
 */
export async function deleteStorageObjects(rows) {
  const files = (rows ?? [])
    .filter((r) => r?.storage_url)
    .map((r) => ({ url: r.storage_url, provider: r.storage_provider ?? null }));
  if (files.length === 0) return { deleted: 0, failed: 0, results: [] };
  const token = await accessToken();
  if (!token) return { deleted: 0, failed: files.length, results: [] };

  try {
    const res = await fetch('/api/media/file', {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ files }),
    });
    if (!res.ok) return { deleted: 0, failed: files.length, results: [] };
    return await res.json();
  } catch {
    // Network error — the caller proceeds with the DB cleanup regardless.
    return { deleted: 0, failed: files.length, results: [] };
  }
}

/**
 * Insert attachment rows for one entity. No-op for an empty URL list.
 * @param {string} entityType
 * @param {string} entityId
 * @param {Array<string|{ url: string, provider?: string|null, sizeBytes?: number|null }>} urls
 *   A bare string is still accepted for callers that have no provider to hand,
 *   but ⚠ prefer the object form: a row written without a provider can only be
 *   deleted by inferring one from its URL, which works today and is a weaker
 *   guarantee than recording what actually wrote it.
 * @param {string} userId
 * @param {{ mimeType?: string, provider?: string|null }} [opts]
 *   `provider` applies to every url in the call — the common case, since one
 *   upload batch goes to one provider.
 */
export async function addAttachments(
  entityType, entityId, urls, userId, { mimeType = 'image/jpeg', provider = null } = {},
) {
  if (!urls || urls.length === 0) return;
  const rows = buildRows(entityType, entityId, normaliseItems(urls), userId, { mimeType, provider });
  const { error } = await supabase.from('media_attachments').insert(rows);
  if (error) throw new Error(error.message);
}

/** A bare url or an object, to one shape. Deduped on url — the same file
 *  attached twice to one entity is a duplicate row, not two photos. */
function normaliseItems(items) {
  const seen = new Set();
  const out = [];
  for (const u of items ?? []) {
    const item = typeof u === 'string' ? { url: u } : u;
    if (!item?.url || seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

function buildRows(entityType, entityId, items, userId, { mimeType, provider }) {
  const now = new Date().toISOString();
  return items.map((item) => ({
    entity_type:      entityType,
    entity_id:        entityId,
    storage_url:      item.url,
    // ⛔ The column that makes this row deletable after a provider change.
    storage_provider: item.provider ?? provider ?? null,
    size_bytes:       item.sizeBytes ?? null,
    mime_type:        mimeType,
    created_at:       now,
    created_by:       userId,
  }));
}

/**
 * Make an entity's attachment set EXACTLY `items`: remove what is no longer
 * referenced, add what is new, and leave what is unchanged alone.
 *
 * ⛔ THIS EXISTS BECAUSE PURGE-THEN-ADD DESTROYED FILES IT WAS ABOUT TO REUSE.
 * The offline syncer purged an inspection's attachments and re-added the same
 * urls, which is idempotent for the ROWS and catastrophic for the FILES: on a
 * replay after a partially-completed op, purge deleted the storage objects the
 * very next call was about to reference, leaving rows pointing at nothing.
 * Nothing errored — the rows looked perfect. PROJECT_STATUS §6jj.
 *
 * ⭐ The fix is a set reconciliation rather than a delete-and-rewrite, and the
 * distinction is the whole thing: **a file is deleted only when it is no
 * longer referenced**, never merely because the set is being rewritten. That
 * also keeps the behaviour purge-then-add was there for — a re-inspection
 * genuinely dropping a photo still removes its file.
 *
 * @param {string} entityType
 * @param {string} entityId
 * @param {Array<string|{ url: string, provider?: string|null, sizeBytes?: number|null }>} items
 * @param {string} userId
 * @param {{ mimeType?: string, provider?: string|null }} [opts]
 */
export async function setAttachments(
  entityType, entityId, items, userId, { mimeType = 'image/jpeg', provider = null } = {},
) {
  const desired      = normaliseItems(items);
  const desiredUrls  = new Set(desired.map((d) => d.url));
  const existing     = await listAttachments(entityType, entityId);
  const existingUrls = new Set(existing.map((r) => r.storage_url));

  // Gone from the set → the file is genuinely unreferenced, so it goes.
  const removed = existing.filter((r) => !desiredUrls.has(r.storage_url));
  if (removed.length > 0) {
    await deleteStorageObjects(removed);
    const { error } = await supabase
      .from('media_attachments')
      .delete()
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .in('storage_url', removed.map((r) => r.storage_url));
    if (error) throw new Error(error.message);
  }

  // ⚠ Already present → left completely alone. Re-inserting would mean
  // deleting first, which is the fault this function removes.
  const toAdd = desired.filter((d) => !existingUrls.has(d.url));
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('media_attachments')
      .insert(buildRows(entityType, entityId, toAdd, userId, { mimeType, provider }));
    if (error) throw new Error(error.message);
  }
}

/**
 * Delete all attachments for the given entities: the storage files first, then
 * the rows. Safe to call when nothing matches.
 *
 * ⛔ THROWS, AND KEEPS EVERY ROW, IF ANY FILE COULD NOT BE DELETED (2026-09-27).
 * It used to swallow the failure and remove the rows anyway — leaving files in
 * storage that nothing names, the one state that cannot be recovered from the
 * screen. The caller (a walk session, a component) then stops too, so trying
 * again finishes the job. A file already gone from Drive counts as deleted.
 * @param {string} entityType
 * @param {string|string[]} entityIds
 */
export async function purgeAttachments(entityType, entityIds) {
  const ids = Array.isArray(entityIds) ? entityIds : [entityIds];
  if (ids.length === 0) return;
  const rows = await listAttachments(entityType, ids);
  if (rows.length > 0) {
    // ⚠ Whole rows, not just URLs — the provider travels with each file so the
    // server can route it. Passing `rows.map(r => r.storage_url)` here is
    // exactly the regression this fix removed.
    const result = await deleteStorageObjects(rows);
    if (result?.failed) {
      throw new Error(`${result.failed} of ${rows.length} photo(s) could not be deleted from storage, `
        + 'so nothing else was deleted. Try again.');
    }
  }
  // Delete exactly the rows that were listed, and in chunks: one .in() of a
  // building walk's ids overruns the request URL.
  const rowIds = rows.map((r) => r.id);
  for (let i = 0; i < rowIds.length; i += DELETE_CHUNK) {
    const { error } = await supabase
      .from('media_attachments')
      .delete()
      .in('id', rowIds.slice(i, i + DELETE_CHUNK));
    if (error) throw new Error(error.message);
  }
}

const DELETE_CHUNK = 300;
