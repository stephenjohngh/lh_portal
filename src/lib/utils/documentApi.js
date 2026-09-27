// src/lib/utils/documentApi.js
// Stateless client for the shared document_library, behind /api/documents/*.
//
// One place for bearer-token handling + request/response plumbing, used by any
// app that attaches files to an entity: the admin documents store, Info notes,
// Management activities — and, coming, Golden Thread / Maintenance certificate
// ingest. Callers own their own state; these helpers just do the I/O.
//
// NOTE: uploads are multipart/form-data, so the Authorization header must be
// sent WITHOUT a Content-Type (the browser sets the multipart boundary). That
// is why this can't reuse $lib/utils/authHeaders, which forces JSON.

import { supabase } from '$lib/supabaseClient';

/** Authorization-only header (no Content-Type). */
async function bearer() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function parse(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data;
}

/**
 * List documents matching filters (GET /api/documents).
 * @param {Object} [opts] e.g. { entity_type, entity_id, doc_type, category, search, limit }
 * @returns {Promise<Object[]>}
 */
export async function listDocuments(opts = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const res = await fetch(`/api/documents?${params}`, { headers: await bearer() });
  return parse(res, 'Failed to load documents');
}

/**
 * Upload a file + metadata (POST /api/documents/upload).
 * @param {File|Blob} file
 * @param {Object} [meta] document_library fields: entity_type, entity_id,
 *   display_name, doc_type, folder_path, description, category, tags, …
 * @returns {Promise<Object>} the new document_library row
 */
export async function uploadDocument(file, meta = {}) {
  const form = new FormData();
  form.append('file', file);
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined && v !== null) {
      form.append(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
    }
  }
  const res = await fetch('/api/documents/upload', { method: 'POST', headers: await bearer(), body: form });
  return parse(res, 'Upload failed');
}

/** Delete a document — storage file + index row (DELETE /api/documents/:id). */
export async function deleteDocument(id) {
  const res = await fetch(`/api/documents/${id}`, { method: 'DELETE', headers: await bearer() });
  await parse(res, 'Delete failed');
}

/** Fresh viewable URL for a document (GET /api/documents/:id/url). */
export async function getDocumentUrl(id) {
  const res = await fetch(`/api/documents/${id}/url`, { headers: await bearer() });
  const data = await parse(res, 'Failed to get URL');
  return data.url;
}

/** Update document metadata (PATCH /api/documents/:id). */
export async function updateDocument(id, patch) {
  const res = await fetch(`/api/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await bearer()) },
    body: JSON.stringify({ patch }),
  });
  return parse(res, 'Update failed');
}

/**
 * Delete every document attached to one record — call it BEFORE deleting the
 * record itself.
 *
 * ⛔ document_library has no foreign key to anything (entity_type/entity_id
 * name the owner), so deleting a record never removes its documents: its rows
 * and its files in Drive stay behind, reachable by nothing. That happened in
 * five places before 2026-09-27 — an Info section, a Dossier pack, a
 * maintenance job, a parking draft and a Management activity.
 *
 * Throws if ANY could not be deleted, so the caller stops and KEEPS the
 * record: a record whose documents are half gone can be deleted again, while
 * documents whose record is gone can no longer be found from the screen.
 * The library delete is admin-only, and so is deleting every record that
 * calls this.
 *
 * @param {string} entity_type  e.g. 'dossier_pack', 'maintenance_document'
 * @param {string} entity_id
 * @returns {Promise<number>} how many were deleted
 */
export async function deleteDocumentsFor(entity_type, entity_id) {
  const docs = await listDocuments({ entity_type, entity_id });
  const results = await Promise.allSettled(docs.map((d) => deleteDocument(d.id)));
  const failed  = /** @type {PromiseRejectedResult[]} */ (results.filter((r) => r.status === 'rejected'));
  if (failed.length) {
    throw new Error(
      `${failed.length} of ${docs.length} attached document(s) could not be deleted `
      + `(${failed[0].reason?.message ?? failed[0].reason}), so nothing else was deleted. Try again.`,
    );
  }
  return docs.length;
}
