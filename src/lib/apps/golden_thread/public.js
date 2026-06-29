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

/** Discriminator stored in gt_links.*_type for a register document. */
export const GT_DOCUMENT_TYPE = 'gt_document';

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

/**
 * Register a producer document (a maintenance certificate, an inspection report)
 * into the L2 register as a DRAFT, and link it back to its source job/inspection.
 *
 * NOT YET IMPLEMENTED (build step 3). Ingest is deliberately TWO-STEP so the
 * audit captures the real actor (PB-2):
 *   1. server uploads `file` (via /api/documents or /api/media) → { storage_uri, file_checksum }
 *   2. CLIENT creates the DRAFT gt_document via api.js under the user's JWT, so
 *      auth.uid() resolves inside the audit trigger and can't be forged — the
 *      metadata write must NOT go through a service-role server path.
 *   + a gt_link relation 'produced_by' from the new draft to the source entity.
 *
 * @param {object} meta  { schedule1_category, document_type, title, summary, file, author, effective_from, review_cycle_days, ... }
 * @param {{ producedBy: { type: string, id: string } }} source
 * @param {string} userId
 * @returns {Promise<never>}
 */
export async function registerDocument(meta, source, userId) {
  throw new Error('registerDocument: not implemented yet (Golden Thread build step 3 — producer ingest)');
}
