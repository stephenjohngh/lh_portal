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

import { api } from '$lib/utils/api';
import { uploadDocument } from '$lib/utils/documentApi';
import { postJson } from '$lib/utils/request';

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
 * Links OUT of this document — gt_links whose SOURCE is this document (e.g. the
 * 'produced_by' link to the job/inspection it came from, or an evidences/cites
 * link this document asserts).
 * @param {string} documentId
 */
export function listDocumentLinks(documentId) {
  return api.get('gt_links', {
    filters: { source_type: GT_DOCUMENT_TYPE, source_id: documentId },
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

/**
 * Which register documents cite a given external entity — the cross-app read
 * for the cited side (e.g. a MOR case showing "referenced in the Golden Thread").
 * gt_links where TARGET is the entity and SOURCE is a gt_document, resolved to
 * the citing documents (reference/title/status) so callers needn't join.
 * @param {string} targetType  gt_links.target_type (e.g. 'mor_case')
 * @param {string} targetId    the entity's id
 * @returns {Promise<Array<object & { document: object|null }>>}  links with `.document`
 */
export async function listDocumentsCiting(targetType, targetId) {
  const links = await api.get('gt_links', {
    filters: { target_type: targetType, target_id: targetId, source_type: GT_DOCUMENT_TYPE },
    orderBy: 'created_at',
    ascending: false
  });
  if (links.length === 0) return [];
  const ids  = [...new Set(links.map((l) => l.source_id))];
  const docs = await api.getAllIn('gt_documents', 'id', ids, {
    select: 'id, reference, title, status, document_type'
  });
  const byId = new Map(docs.map((d) => [d.id, d]));
  return links.map((l) => ({ ...l, document: byId.get(l.source_id) ?? null }));
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

// ── Author/reviewer registry (gt_persons) ────────────────────────────────────

/** List the people registry (authors/reviewers), name order. */
export function listPersons() {
  return api.get('gt_persons', { orderBy: 'full_name', ascending: true });
}

/**
 * Add a person to the registry.
 * @param {{ full_name: string, organisation?: string, role?: string }} data
 * @param {string} userId
 */
export function createPerson(data, userId) {
  return api.create('gt_persons', { ...data, created_by: userId }, true);
}

// ── Accountable Person / PAP register (gt_accountable_persons) ───────────────

/** List the AP/PAP register, oldest first (tenure order). */
export function listAccountablePersons() {
  return api.get('gt_accountable_persons', { orderBy: 'created_at', ascending: true });
}

/**
 * Add an accountable person.
 * @param {{ role: string, name: string, organisation?: string, duties?: string, contact?: string, appointed_on?: string|null, notes?: string }} data
 * @param {string} userId
 */
export function createAccountablePerson(data, userId) {
  return api.create('gt_accountable_persons', { ...data, created_by: userId }, true);
}

/**
 * Update an accountable person (edit details or close a tenure via ended_on).
 * @param {string} id
 * @param {object} patch
 * @param {string} userId
 */
export function updateAccountablePerson(id, patch, userId) {
  return api.update('gt_accountable_persons', id, {
    ...patch, updated_by: userId, updated_at: new Date().toISOString()
  }, true);
}

// ── Audit history (read; admin-gated by RLS) ─────────────────────────────────

/**
 * The immutable audit rows for a single document, oldest first. RLS restricts
 * gt_audit reads to admins — a non-admin gets an empty list.
 * @param {string} documentId
 */
export function listAuditHistory(documentId) {
  return api.get('gt_audit', {
    filters: { target_table: 'gt_documents', target_id: documentId },
    orderBy: 'seq',
    ascending: true
  });
}

// ── Producer ingest (L1: Maintenance/Inspection register a certificate) ───────

/** gt_documents columns a caller may set at draft creation (others are DB defaults). */
const DRAFT_FIELDS = [
  'schedule1_category', 'document_type', 'title', 'summary', 'scope_description',
  'building_location', 'uniclass_code', 'container_id', 'author_id', 'reviewer_id',
  'effective_from', 'review_cycle_days', 'safety_critical', 'access_scope',
  'contains_pii', 'security_classification', 'tags', 'taxonomy_version', 'supersedes'
];

/** Build the DRAFT insert payload from caller meta (DB defaults fill the rest). */
function draftInsert(meta, userId, extra = {}) {
  const data = { created_by: userId, ...extra };
  for (const k of DRAFT_FIELDS) {
    if (meta[k] !== undefined && meta[k] !== null && meta[k] !== '') data[k] = meta[k];
  }
  return data;
}

/** Create the 'produced_by' gt_link back to a producing entity, when supplied. */
async function linkProducedBy(draftId, source, userId) {
  if (source?.producedBy?.type && source.producedBy.id) {
    await api.create('gt_links', {
      source_type: GT_DOCUMENT_TYPE, source_id: draftId,
      target_type: source.producedBy.type, target_id: source.producedBy.id,
      relation: 'produced_by', created_by: userId,
    });
  }
}

/**
 * The register document produced from a given source entity, or null — prevents
 * double-registration and drives the producer "Registered (GT-…)" state.
 * @param {string} targetType  e.g. 'maintenance_job' | 'walk_session'
 * @param {string} targetId
 * @returns {Promise<{ id: string, reference: string, status: string } | null>}
 */
export async function findDocumentBySource(targetType, targetId) {
  const links = await api.get('gt_links', {
    filters: { source_type: GT_DOCUMENT_TYPE, target_type: targetType, target_id: targetId, relation: 'produced_by' },
    limit: 1,
  });
  if (!links.length) return null;
  return (await api.getById('gt_documents', links[0].source_id, 'id, reference, status')) ?? null;
}

/**
 * Batched findDocumentBySource — one query for a whole list instead of one per
 * row (the maintenance Documents tab / inspection report modal pre-check).
 * @param {string} targetType   e.g. 'maintenance_document' | 'walk_session'
 * @param {string[]} targetIds
 * @returns {Promise<Record<string, { id: string, reference: string, status: string }>>}
 *          map of targetId → register document (absent = not registered)
 */
export async function findDocumentsBySources(targetType, targetIds) {
  if (!targetIds?.length) return {};
  // getAllIn chunks the .in() but takes no equality filters — the extra link
  // rows are filtered here (produced_by volume is tiny).
  const links = (await api.getAllIn('gt_links', 'target_id', targetIds))
    .filter((l) => l.source_type === GT_DOCUMENT_TYPE && l.target_type === targetType && l.relation === 'produced_by');
  if (!links.length) return {};

  const docIds  = [...new Set(links.map((l) => l.source_id))];
  const docs    = await api.getAllIn('gt_documents', 'id', docIds, { select: 'id, reference, status' });
  const docById = new Map(docs.map((d) => [d.id, d]));

  const out = {};
  for (const l of links) {
    const doc = docById.get(l.source_id);
    if (doc && !out[l.target_id]) out[l.target_id] = doc;
  }
  return out;
}

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
  const draft = await api.create('gt_documents', draftInsert(meta, userId, { file_checksum }), true);

  const uploaded = await uploadDocument(file, {
    entity_type:  GT_DOCUMENT_TYPE,
    entity_id:    draft.id,
    display_name: meta.title,
    doc_type:     meta.document_type
  });

  const updated = await api.update('gt_documents', draft.id, {
    storage_uri: uploaded?.id ? `document_library:${uploaded.id}` : null,
    // The upload endpoint hashes the received bytes server-side; that value is
    // authoritative over the browser-computed one (S4 — a tampered client could
    // otherwise pin a checksum that doesn't match the stored file).
    ...(uploaded?.file_checksum ? { file_checksum: uploaded.file_checksum } : {}),
    updated_by:  userId
  }, true);

  await linkProducedBy(draft.id, source, userId);
  return updated;
}

/**
 * Register a document that ALREADY lives in document_library (a maintenance
 * certificate, an inspection report) into the register as a DRAFT — the Stage-B
 * producer path. The server copies the library file into a register-owned copy
 * (checksum pinned, independent of the producer); the DRAFT metadata write stays
 * client-side (PB-2). Then a 'produced_by' link back to the producing entity.
 *
 * @param {object} meta  draft fields (see DRAFT_FIELDS) + `sourceDocId` (document_library id)
 * @param {{ producedBy?: { type: string, id: string } } | null} source
 * @param {string} userId
 * @returns {Promise<object>} the created draft (storage_uri + file_checksum set)
 */
export async function registerExistingArtifact(meta, source, userId) {
  const { sourceDocId } = meta;
  if (!sourceDocId) throw new Error('registerExistingArtifact: sourceDocId is required');

  const draft = await api.create('gt_documents', draftInsert(meta, userId), true);

  const { storage_uri, file_checksum } = await postJson(
    '/api/golden-thread/ingest-artifact',
    { sourceDocId, entityId: draft.id },
    'Failed to copy the source file into the register',
  );

  const updated = await api.update('gt_documents', draft.id, {
    storage_uri, file_checksum, updated_by: userId,
  }, true);

  await linkProducedBy(draft.id, source, userId);
  return updated;
}
