// src/lib/apps/golden_thread/public.js
//
// PUBLIC INTERFACE of the Golden Thread (L2 Common Data Environment) app — the
// cross-app contract for the document register. This is the seam the three-layer
// model calls for:
//   • L3 governance (MOR, Safety Case, BSR packs) CITES register documents here —
//     read accessors + cite(); it never mutates gt_documents directly.
//   • L1 producers (Maintenance / Inspection) INGEST certificates via
//     registerDocument().
//
// Stateless, like building_assets/public.js and inspection/public.js: it does the
// DB work through api.js and returns; each caller refreshes its own view.
// Lifecycle MUTATORS (submit/accept/supersede/withdraw) are NOT here — they are
// admin/editor-gated store methods on gtStore, not a cross-app surface.
//
// Build status: read + link surface implemented (steps 5–6). registerDocument
// (producer ingest, step 3) is a documented stub — see its body.

import { api } from '$lib/utils/api';
import { uploadDocument } from '$lib/utils/documentApi';

/** Discriminator stored in gt_links.*_type for a register document. */
export const GT_DOCUMENT_TYPE = 'gt_document';

/**
 * SHA-256 hex of a File/Blob's bytes (FR-STO-003 file integrity). Computed
 * client-side with Web Crypto so the checksum is pinned at the moment of ingest
 * and travels into the immutable audit chain via gt_documents.file_checksum.
 * @param {File|Blob} file
 * @returns {Promise<string>} lowercase hex digest
 */
export async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Reads (L3 cites these; never writes) ──────────────────────────────────────

/**
 * One document by id (full row).
 * @param {string} id
 */
export function getDocument(id) {
  return api.getById('gt_documents', id);
}

/**
 * Current (accepted) documents, newest first. Optional equality filters narrow
 * by Schedule-1 category and/or document type.
 * @param {{ schedule1_category?: number, document_type?: string }} [filters]
 */
export function listCurrentDocuments(filters = {}) {
  const f = { status: 'current' };
  if (filters.schedule1_category != null) f.schedule1_category = filters.schedule1_category;
  if (filters.document_type) f.document_type = filters.document_type;
  return api.get('gt_documents', { filters: f, orderBy: 'effective_from', ascending: false });
}

/**
 * The current document(s) satisfying a Schedule-1 category slot.
 * @param {number} categoryCode  gt_schedule1_categories.code (smallint)
 */
export function getCurrentForCategory(categoryCode) {
  return api.get('gt_documents', {
    filters: { status: 'current', schedule1_category: categoryCode },
    orderBy: 'effective_from',
    ascending: false
  });
}

/**
 * TIME-TRAVEL: the documents that were current on a given date — i.e.
 * effective_from <= d AND (effective_to IS NULL OR d < effective_to).
 *
 * The register is low-volume by design, so we fetch the candidate set and apply
 * the half-open interval test in JS rather than pushing range operators through
 * the api.js equality-filter wrapper.
 * @param {string} dateISO  'YYYY-MM-DD'
 * @param {{ schedule1_category?: number, document_type?: string }} [filters]
 */
export async function documentsCurrentOn(dateISO, filters = {}) {
  const rows = await api.getAll('gt_documents', {
    filters: { ...(filters.schedule1_category != null ? { schedule1_category: filters.schedule1_category } : {}),
               ...(filters.document_type ? { document_type: filters.document_type } : {}) }
  });
  return rows.filter((r) =>
    r.effective_from && r.effective_from <= dateISO &&
    (r.effective_to == null || dateISO < r.effective_to));
}

/**
 * Who cites this document — gt_links whose TARGET is this document.
 * @param {string} documentId
 */
export function listCitations(documentId) {
  return api.get('gt_links', {
    filters: { target_type: GT_DOCUMENT_TYPE, target_id: documentId },
    orderBy: 'created_at',
    ascending: false
  });
}

/**
 * Schedule-1 completeness: for every APPLICABLE category, how many current
 * documents satisfy it. Counts applicable categories only (PB-4) — non-applicable
 * slots are excluded, not reported "missing". Drives the completeness dashboard.
 * @returns {Promise<Array<{ code: number, name: string, currentCount: number, satisfied: boolean }>>}
 */
export async function scheduleOneCompleteness() {
  const [categories, current] = await Promise.all([
    api.get('gt_schedule1_categories', { filters: { applicable: true }, orderBy: 'code' }),
    api.getAll('gt_documents', { filters: { status: 'current' }, select: 'id, schedule1_category' })
  ]);
  const counts = new Map();
  for (const d of current) {
    counts.set(d.schedule1_category, (counts.get(d.schedule1_category) ?? 0) + 1);
  }
  return categories.map((c) => {
    const currentCount = counts.get(c.code) ?? 0;
    return { code: c.code, name: c.name, currentCount, satisfied: currentCount > 0 };
  });
}

// ── Links (L3 governance creates citations) ──────────────────────────────────

/**
 * Create a citation FROM a register document TO another entity (the L3→L2
 * cite/link, source = the gt_document). Used when governance references a
 * document as evidence.
 * @param {string} documentId  the citing register document (link source)
 * @param {{ targetType: string, targetId: string, relation: string, note?: string }} target
 * @param {string} userId
 */
export function cite(documentId, { targetType, targetId, relation, note = null }, userId) {
  return api.create('gt_links', {
    source_type: GT_DOCUMENT_TYPE,
    source_id:   documentId,
    target_type: targetType,
    target_id:   targetId,
    relation,
    note,
    created_by:  userId
  }, true);
}

/**
 * Remove a citation/link by id.
 * @param {string} linkId
 */
export function removeLink(linkId) {
  return api.delete('gt_links', linkId);
}

// ── Producer ingest (L1: Maintenance/Inspection register a certificate) ───────

/** gt_documents columns a caller may set at draft creation (others are DB defaults). */
const DRAFT_FIELDS = [
  'schedule1_category', 'document_type', 'title', 'summary', 'scope_description',
  'building_location', 'uniclass_code', 'container_id', 'author_id', 'reviewer_id',
  'effective_from', 'review_cycle_days', 'safety_critical', 'access_scope',
  'contains_pii', 'security_classification', 'tags', 'taxonomy_version'
];

/**
 * Register a document into the L2 register as a DRAFT, optionally linking it back
 * to its producing entity (a maintenance job, an inspection). Used both by L1
 * producers (cross-app) and by the Golden Thread app's own Ingest screen.
 *
 * The metadata write is CLIENT-side under the user's JWT (PB-2): auth.uid()
 * resolves inside the audit trigger and can't be forged — never route it through
 * a service-role server path. Sequence:
 *   1. compute file_checksum (SHA-256) from `file`.
 *   2. create the DRAFT gt_document (api.js → audit INSERT, actor = user).
 *   3. upload `file` to document_library linked to the draft (entity_type
 *      'gt_document'), so the AttachedDocuments viewer resolves it.
 *   4. write storage_uri back onto the draft (api.js → audit UPDATE).
 *   5. if a producing entity is given, create a 'produced_by' gt_link.
 *
 * `reference` is omitted — the DB DEFAULT stamps GT-NNNNNN from a sequence.
 *
 * @param {object} meta  draft fields (see DRAFT_FIELDS) + `file` (File|Blob)
 * @param {{ producedBy?: { type: string, id: string } } | null} source
 * @param {string} userId
 * @returns {Promise<object>} the created draft (with storage_uri set)
 */
export async function registerDocument(meta, source, userId) {
  const { file } = meta;
  if (!file) throw new Error('registerDocument: a file is required');

  const file_checksum = await sha256Hex(file);

  const draftData = { created_by: userId, file_checksum };
  for (const k of DRAFT_FIELDS) {
    if (meta[k] !== undefined && meta[k] !== null && meta[k] !== '') draftData[k] = meta[k];
  }
  const draft = await api.create('gt_documents', draftData, true);

  const uploaded = await uploadDocument(file, {
    entity_type:  GT_DOCUMENT_TYPE,
    entity_id:    draft.id,
    display_name: meta.title,
    doc_type:     meta.document_type
  });

  const updated = await api.update('gt_documents', draft.id, {
    storage_uri: uploaded?.id ? `document_library:${uploaded.id}` : null,
    updated_by:  userId
  }, true);

  if (source?.producedBy?.type && source.producedBy.id) {
    await api.create('gt_links', {
      source_type: GT_DOCUMENT_TYPE,
      source_id:   draft.id,
      target_type: source.producedBy.type,
      target_id:   source.producedBy.id,
      relation:    'produced_by',
      created_by:  userId
    });
  }

  return updated;
}
