// src/lib/server/documentLibrary.js
// High-level document library functions used by API routes.
// A NEW file goes to the active storageProvider. An EXISTING file is read,
// linked or deleted through the provider recorded on its row (`provider`) —
// see providerFor() below.
// All DB index operations use the service-role Supabase client.

import { createHash }                from 'node:crypto';
import { createClient }              from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }                 from '$env/dynamic/private';
import { storageProvider, ownerOf } from './storage/index.js';
import { sanitizeIlikeTerm }          from '$lib/utils/pgFilter.js';
import { docTypeFromMime, isUnclassifiedDocType } from '$lib/utils/documentUtils.js';
import { getLogger }                  from '$lib/utils/logger';

const logger = getLogger('DocumentLibrary');

// Module-level singleton; createClient is cheap but no need to make per-call.
const db = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');

function getDb() {
  return db;
}

/**
 * The provider that holds an ALREADY-WRITTEN document.
 *
 * ⛔ Not `storageProvider`. That is how this deployment is configured today; a
 * file's provider is a property of when it was written, and `provider` on the
 * row records it. Using today's setting for an old file is what stranded 30
 * media files when STORAGE_PROVIDER changed (PROJECT_STATUS §6hh, §6ii) — the
 * media fix reached `media_attachments`; this is the same fix for documents.
 *
 * · A recorded provider this deployment knows → that one, whatever is
 *   configured.
 * · Nothing recorded (a row older than the column being filled) → the
 *   configured provider, because it is the only information there is.
 * · A recorded provider this deployment does NOT know → refuse. Guessing would
 *   send a file id to a provider that never issued it.
 *
 * @param {{ provider?: string|null }} doc
 */
export function providerFor(doc) {
  return ownerOf(doc?.provider);
}

/**
 * Which provider holds each of these files, by provider_file_id — for callers
 * that were handed a bare file id (a publication manifest written before it
 * recorded providers, or a client naming a shelf file). An id not in the
 * library is absent from the map; the caller decides what that means.
 * @param {string[]} fileIds
 * @returns {Promise<Map<string, string|null>>}
 */
export async function providersForFileIds(fileIds = []) {
  const ids = [...new Set((fileIds ?? []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await getDb()
    .from('document_library').select('provider_file_id, provider').in('provider_file_id', ids);
  if (error) throw error;
  return new Map((data ?? []).map(r => [r.provider_file_id, r.provider ?? null]));
}

/**
 * The library row that holds a storage file id, or null. For a route handed a
 * raw file id, so it can ask canAccessDocument() about the DOCUMENT rather
 * than only whether the file is in the library at all.
 * @param {string} fileId
 * @returns {Promise<{ id: string, entity_type: string|null, entity_id: string|null, provider: string|null } | null>}
 */
export async function getDocumentByFileId(fileId) {
  const { data, error } = await getDb()
    .from('document_library')
    .select('id, entity_type, entity_id, provider')
    .eq('provider_file_id', fileId)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

/**
 * Upload a file to storage and insert a record in document_library.
 *
 * @param {Buffer}  buffer
 * @param {string}  filename
 * @param {string}  mimeType
 * @param {Object}  meta        - see document_library columns
 * @param {string}  userId      - auth.uid() of uploader
 * @returns {Promise<Object>}   The inserted document_library row
 */
export async function uploadDocument(buffer, filename, mimeType, meta = {}, userId) {
  const folderPath = meta.folder_path ?? '';
  const folderId   = await storageProvider.ensurePath(
    folderPath ? folderPath.split('/').filter(Boolean) : ['documents'],
  );

  logger('Uploading:', filename, 'to', folderId);
  const result = await storageProvider.uploadFile(buffer, filename, mimeType, folderId);

  // A record's folder is reused under its new name when the record has been
  // renamed (the Drive provider finds it by its short-id ending). The files
  // already in it still record the old path, so bring them into step. Only a
  // label — best-effort, never a reason to fail the upload.
  if (folderPath) {
    const { error: pathErr } = await getDb()
      .from('document_library')
      .update({ folder_path: folderPath })
      .eq('provider_folder_id', folderId)
      .neq('folder_path', folderPath);
    if (pathErr) logger('⚠ could not update folder paths:', pathErr.message);
  }

  // SHA-256 of the bytes — file integrity (FR-STO-003); pinned by GT ingest.
  const file_checksum = createHash('sha256').update(buffer).digest('hex');

  const db = getDb();
  const { data, error } = await db
    .from('document_library')
    .insert({
      provider:           storageProvider.name,
      provider_file_id:   result.fileId,
      provider_folder_id: result.folderId,
      filename,
      display_name:       meta.display_name      ?? filename,
      mime_type:          mimeType,
      file_size:          buffer.byteLength,
      file_checksum,
      web_view_url:       result.webViewUrl,
      thumbnail_url:      result.thumbnailUrl,
      // Derived here rather than at each call site, because every call site got
      // it wrong: the whole library was 'other' — an .odt, a .pdf and a .jpg
      // indistinguishable in the list — while docTypeFromMime sat unused
      // outside one admin form. 'other' counts as unstated (see
      // isUnclassifiedDocType); a caller with a real classification keeps it.
      doc_type:           isUnclassifiedDocType(meta.doc_type)
                            ? docTypeFromMime(mimeType)
                            : meta.doc_type,
      category:           meta.category          ?? null,
      entity_type:        meta.entity_type       ?? null,
      entity_id:          meta.entity_id         ?? null,
      title:              meta.title             ?? null,
      description:        meta.description       ?? null,
      document_date:      meta.document_date     ?? null,
      expiry_date:        meta.expiry_date       ?? null,
      reference_number:   meta.reference_number  ?? null,
      issuer:             meta.issuer            ?? null,
      tags:               meta.tags              ?? [],
      folder_path:        folderPath             || null,
      uploaded_by:        userId                 ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  logger('Indexed:', data.id);
  return data;
}

/**
 * Copy an existing document_library file into a NEW, independent document_library
 * entry (its own stored file + row) under a different entity. Used by Golden
 * Thread producer ingest: a maintenance certificate / inspection report already
 * in the library is copied into a gt_document-owned entry, so the register holds
 * its own immutable copy (survives the producer deleting theirs). The checksum is
 * recomputed on the copy by uploadDocument and will match the source.
 *
 * @param {string} sourceId  document_library row to copy
 * @param {Object} meta       overrides for the new row (entity_type, entity_id, display_name, …)
 * @param {string} userId
 * @returns {Promise<Object>} the new document_library row (with file_checksum)
 */
export async function copyDocument(sourceId, meta = {}, userId) {
  const src = await getDocument(sourceId);
  const { data: buffer } = await providerFor(src).getFileStream(src.provider_file_id);
  return uploadDocument(buffer, src.filename, src.mime_type, {
    display_name:     src.display_name,
    doc_type:         src.doc_type,
    document_date:    src.document_date,
    expiry_date:      src.expiry_date,
    reference_number: src.reference_number,
    issuer:           src.issuer,
    ...meta,
  }, userId);
}

/**
 * List documents from document_library, with optional filters.
 *
 * @param {Object} opts
 * @param {string} [opts.entity_type]
 * @param {string} [opts.entity_id]
 * @param {string} [opts.doc_type]
 * @param {string} [opts.category]
 * @param {string} [opts.folder_path]
 * @param {string} [opts.search]   - substring match on display_name / title
 * @param {number} [opts.limit]
 * @returns {Promise<Object[]>}
 */
export async function listDocuments(opts = {}) {
  const db = getDb();
  let q = db
    .from('document_library')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.entity_type) q = q.eq('entity_type', opts.entity_type);
  if (opts.entity_id)   q = q.eq('entity_id',   opts.entity_id);
  if (opts.doc_type)    q = q.eq('doc_type',     opts.doc_type);
  if (opts.category)    q = q.eq('category',     opts.category);
  if (opts.folder_path) q = q.eq('folder_path',  opts.folder_path);
  if (opts.search) {
    // Strip PostgREST filter-grammar chars so a search term can't inject
    // additional conditions into the .or() string (see pgFilter.js).
    const s = sanitizeIlikeTerm(opts.search);
    if (s) q = q.or(`display_name.ilike.%${s}%,title.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Get a single document_library record by id.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getDocument(id) {
  const db = getDb();
  const { data, error } = await db
    .from('document_library')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Get a fresh browser-viewable URL for a document.
 * For Google Drive this re-fetches from the API; for Supabase it reconstructs from path.
 * @param {string} id   document_library row id
 * @returns {Promise<string>}
 */
export async function getDocumentUrl(id) {
  const doc = await getDocument(id);
  // ⛔ A Drive file is private to the Drive account since the security review
  // (2026-09-27): Google's own link needs a Google sign-in with access. The
  // portal's proxy is the way in, and it checks who is asking.
  if (doc.provider === 'google_drive' && doc.provider_file_id) {
    return `/api/media/file/${doc.provider_file_id}`;
  }
  return providerFor(doc).getFileUrl(doc.provider_file_id);
}

/**
 * Update document_library metadata (not the actual stored file).
 * @param {string} id
 * @param {Object} patch   - subset of document_library columns
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function updateDocument(id, patch, userId) {
  const db = getDb();
  const { data, error } = await db
    .from('document_library')
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Delete a document from storage AND from the document_library index.
 * @param {string} id
 */
export async function deleteDocument(id) {
  const doc = await getDocument(id);
  await providerFor(doc).deleteFile(doc.provider_file_id);
  logger('Deleted from storage:', doc.provider_file_id);

  const db = getDb();
  const { error } = await db.from('document_library').delete().eq('id', id);
  if (error) throw error;
  logger('Removed from index:', id);

  // The folder it leaves behind: binned if it is a record's folder and now
  // empty (the provider decides what counts — never a category folder). Best-
  // effort: an empty folder is untidy, not harmful, and must never fail a
  // delete that has already happened.
  await tidyFolder(providerFor(doc), doc.provider_folder_id);
}

/**
 * Bin a record's folder if it is now empty, when the provider can.
 * @param {any} provider
 * @param {string|null|undefined} folderId
 */
export async function tidyFolder(provider, folderId) {
  if (!folderId || typeof provider?.trashFolderIfEmpty !== 'function') return;
  try {
    await provider.trashFolderIfEmpty(folderId);
  } catch (/** @type {any} */ err) {
    logger('⚠ could not tidy folder', folderId, '—', err?.message ?? err);
  }
}

/**
 * Return folder/prefix entries from storage at a given path.
 * @param {string} [folderPath]
 * @returns {Promise<import('./storage/storageProvider.js').FileEntry[]>}
 */
export async function listFolders(folderPath) {
  return storageProvider.listFiles(folderPath ?? '', { foldersOnly: true });
}
