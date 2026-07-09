// src/lib/server/documentLibrary.js
// High-level document library functions used by API routes.
// All storage operations go through the active storageProvider.
// All DB index operations use the service-role Supabase client.

import { createHash }                from 'node:crypto';
import { createClient }              from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }                 from '$env/dynamic/private';
import { storageProvider }            from './storage/index.js';
import { sanitizeIlikeTerm }          from '$lib/utils/pgFilter.js';
import { getLogger }                  from '$lib/utils/logger';

const logger = getLogger('DocumentLibrary');

// Module-level singleton; createClient is cheap but no need to make per-call.
const db = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');

function getDb() {
  return db;
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
      doc_type:           meta.doc_type          ?? 'other',
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
  const { data: buffer } = await storageProvider.getFileStream(src.provider_file_id);
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
  return storageProvider.getFileUrl(doc.provider_file_id);
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
  await storageProvider.deleteFile(doc.provider_file_id);
  logger('Deleted from storage:', doc.provider_file_id);

  const db = getDb();
  const { error } = await db.from('document_library').delete().eq('id', id);
  if (error) throw error;
  logger('Removed from index:', id);
}

/**
 * Return folder/prefix entries from storage at a given path.
 * @param {string} [folderPath]
 * @returns {Promise<import('./storage/storageProvider.js').FileEntry[]>}
 */
export async function listFolders(folderPath) {
  return storageProvider.listFiles(folderPath ?? '', { foldersOnly: true });
}
