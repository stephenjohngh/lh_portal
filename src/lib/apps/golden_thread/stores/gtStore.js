// src/lib/apps/golden_thread/stores/gtStore.js
//
// Golden Thread (L2 register) store — factory pattern (CLAUDE.md store contract).
// Owns the register's in-app state and the lifecycle MUTATORS. All DB access goes
// through api.js; every mutation is audited fire-and-forget. The DB triggers
// (gt_documents_enforce_invariants_trg + the hash-chained audit) are the ultimate
// authority — these methods stay in lockstep with gtLifecycle.js, which mirrors
// the SQL transition validator.
//
// Build status: register load + completeness + lifecycle transitions implemented
// (steps 4–5). Ingest (createDraft) is producer-side — see golden_thread/public.js
// registerDocument (step 3).

import { writable }  from 'svelte/store';
import { supabase }  from '$lib/supabaseClient';
import { api }       from '$lib/utils/api';
import { logAudit }  from '$lib/utils/auditLogger';
import { getLogger } from '$lib/utils/logger';
import { isValidTransition } from '$lib/apps/golden_thread/utils/gtLifecycle.js';
import {
  scheduleOneCompleteness, registerDocument,
  listCitations, listDocumentLinks, cite, removeLink,
  listPersons, createPerson, listAuditHistory
} from '$lib/apps/golden_thread/public.js';

const logger = getLogger('gtStore');

/** Today as an ISO date string (YYYY-MM-DD), en-GB-safe (no locale parsing). */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** effective_from + cycleDays, as an ISO date string; null when no cycle set. */
function reviewDueFrom(effectiveFromISO, cycleDays) {
  if (!cycleDays) return null;
  const d = new Date(effectiveFromISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + cycleDays);
  return d.toISOString().slice(0, 10);
}

function createGtStore() {
  const { subscribe, update } = writable({
    documents:        /** @type {any[]} */ ([]),
    selectedDocument: /** @type {any|null} */ (null),
    completeness:     /** @type {any[]} */ ([]),
    categories:       /** @type {any[]} */ ([]),   // applicable Schedule-1 categories (for the ingest form)
    persons:          /** @type {any[]} */ ([]),   // gt_persons registry (authors/reviewers)
    links:            /** @type {{ outgoing: any[], incoming: any[] }} */ ({ outgoing: [], incoming: [] }),
    auditHistory:     /** @type {any[]} */ ([]),   // gt_audit rows for the selected document (admin-readable)
    loading:          false,
    saving:           false,
    error:            ''
  });

  // ── Internal helpers ────────────────────────────────────────────────────────

  async function currentUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  }

  /**
   * Apply a status transition to a document, guarded client-side by the same
   * table the DB enforces. Returns the updated row.
   * @param {object} doc      the current document row (must hold .id and .status)
   * @param {string} toStatus
   * @param {object} extra    additional columns to write alongside the status
   * @param {string} userId
   * @param {string} auditAction
   */
  async function transition(doc, toStatus, extra, userId, auditAction) {
    if (!isValidTransition(doc.status, toStatus)) {
      throw new Error(`Invalid GT status transition: ${doc.status} → ${toStatus}`);
    }
    const updated = await api.update('gt_documents', doc.id, {
      status: toStatus,
      updated_by: userId,
      ...extra
    }, true);
    logAudit(auditAction, 'gt_document', doc.id, doc.title, {
      appId: 'golden_thread',
      eventCategory: 'golden_thread',
      severity: 'info',
      afterData: { from: doc.status, to: toStatus, ...extra }
    });
    return updated;
  }

  /** Splice an updated/created document into the in-memory list. */
  function spliceDoc(row) {
    update((s) => {
      const i = s.documents.findIndex((d) => d.id === row.id);
      const documents = i === -1 ? [row, ...s.documents]
                                 : s.documents.map((d) => (d.id === row.id ? { ...d, ...row } : d));
      const selectedDocument = s.selectedDocument?.id === row.id
        ? { ...s.selectedDocument, ...row } : s.selectedDocument;
      return { ...s, documents, selectedDocument };
    });
  }

  // ── Reads ───────────────────────────────────────────────────────────────────

  /** Load the full register (all statuses), newest first. */
  async function load() {
    update((s) => ({ ...s, loading: true, error: '' }));
    try {
      const documents = await api.getAll('gt_documents', { orderBy: 'created_at', ascending: false });
      update((s) => ({ ...s, documents, loading: false }));
    } catch (err) {
      update((s) => ({ ...s, error: err.message, loading: false }));
      throw err;
    }
  }

  /** Load one document into selectedDocument. */
  async function loadDocument(id) {
    update((s) => ({ ...s, error: '' }));
    try {
      const doc = await api.getById('gt_documents', id);
      update((s) => ({ ...s, selectedDocument: doc }));
      return doc;
    } catch (err) {
      update((s) => ({ ...s, error: err.message }));
      throw err;
    }
  }

  /** Load the applicable Schedule-1 categories (drives the ingest category picker). */
  async function loadCategories() {
    try {
      const categories = await api.get('gt_schedule1_categories', {
        filters: { applicable: true }, orderBy: 'code', ascending: true
      });
      update((s) => ({ ...s, categories }));
      return categories;
    } catch (err) {
      update((s) => ({ ...s, error: err.message }));
      throw err;
    }
  }

  /** Compute Schedule-1 completeness for the dashboard. */
  async function loadCompleteness() {
    try {
      const completeness = await scheduleOneCompleteness();
      update((s) => ({ ...s, completeness }));
    } catch (err) {
      update((s) => ({ ...s, error: err.message }));
      throw err;
    }
  }

  // ── People registry (gt_persons) ─────────────────────────────────────────────

  /** Load the author/reviewer registry. */
  async function loadPersons() {
    try {
      const persons = await listPersons();
      update((s) => ({ ...s, persons }));
      return persons;
    } catch (err) {
      update((s) => ({ ...s, error: err.message }));
      throw err;
    }
  }

  /** Add a person, then refresh the registry. */
  async function addPerson(data) {
    return run(async (userId) => {
      const person = await createPerson(data, userId);
      logAudit('create', 'gt_person', person.id, person.full_name, {
        appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info'
      });
      await loadPersons();
    });
  }

  // ── Audit history ────────────────────────────────────────────────────────────

  /** Load the immutable audit trail for a document (admin-only via RLS). */
  async function loadAuditHistory(documentId) {
    try {
      const auditHistory = await listAuditHistory(documentId);
      update((s) => ({ ...s, auditHistory }));
    } catch (err) {
      // Non-admins are blocked by RLS — treat as "no history visible", not an error.
      update((s) => ({ ...s, auditHistory: [] }));
    }
  }

  // ── Links / citations ────────────────────────────────────────────────────────

  /** Load a document's links: outgoing (it as source) + incoming citations. */
  async function loadLinks(documentId) {
    try {
      const [outgoing, incoming] = await Promise.all([
        listDocumentLinks(documentId),
        listCitations(documentId)
      ]);
      update((s) => ({ ...s, links: { outgoing, incoming } }));
    } catch (err) {
      update((s) => ({ ...s, error: err.message }));
      throw err;
    }
  }

  /** Add a citation FROM this document to another entity, then reload links. */
  async function addLink(documentId, payload) {
    return run(async (userId) => {
      await cite(documentId, payload, userId);
      logAudit('create', 'gt_link', documentId, payload.relation, {
        appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info',
        afterData: payload
      });
      await loadLinks(documentId);
    });
  }

  /** Remove a link, then reload the document's links. */
  async function removeDocumentLink(linkId, documentId) {
    return run(async (userId) => {
      await removeLink(linkId);
      logAudit('delete', 'gt_link', linkId, '', {
        appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info'
      });
      await loadLinks(documentId);
    });
  }

  // ── Ingest ───────────────────────────────────────────────────────────────────

  /**
   * Ingest a new document as a DRAFT (uploads the file + creates the metadata
   * via the L2 public interface), then splice it into the register and audit.
   * @param {object} meta    draft fields + `file`
   * @param {{ producedBy?: { type: string, id: string } } | null} [source]
   */
  async function createDraft(meta, source = null) {
    return run(async (userId) => {
      const draft = await registerDocument(meta, source, userId);
      spliceDoc(draft);
      logAudit('create', 'gt_document', draft.id, draft.title, {
        appId: 'golden_thread',
        eventCategory: 'golden_thread',
        severity: 'info',
        afterData: { reference: draft.reference, schedule1_category: draft.schedule1_category, document_type: draft.document_type }
      });
    });
  }

  // ── Lifecycle mutators (admin/editor-gated in the UI) ────────────────────────

  /** draft → under_review */
  async function submitForReview(id) {
    return run(async (userId) => {
      const doc = await api.getById('gt_documents', id);
      const row = await transition(doc, 'under_review', { reviewer_id: null }, userId, 'submit_for_review');
      spliceDoc(row);
    });
  }

  /**
   * under_review → current. Applies the supersession rule in the store (§3): set
   * the accepted doc current with effective_from=today and a computed review_due;
   * if it supersedes a prior, mark the prior superseded (effective_to=today,
   * superseded_by=this). Two updates — the trigger validates each.
   */
  async function accept(id) {
    return run(async (userId) => {
      const doc = await api.getById('gt_documents', id);
      const today = todayISO();
      const row = await transition(doc, 'current', {
        effective_from: today,
        review_due: reviewDueFrom(today, doc.review_cycle_days)
      }, userId, 'accept');
      spliceDoc(row);

      if (doc.supersedes) {
        const prior = await api.getById('gt_documents', doc.supersedes);
        const priorRow = await transition(prior, 'superseded', {
          effective_to: today,
          superseded_by: doc.id
        }, userId, 'superseded_by_acceptance');
        spliceDoc(priorRow);
      }
    });
  }

  /** under_review → returned_to_author (terminal; author makes a new draft) */
  async function returnToAuthor(id, reason) {
    return run(async (userId) => {
      const doc = await api.getById('gt_documents', id);
      const row = await transition(doc, 'returned_to_author',
        { supersession_reason: reason ?? null }, userId, 'return_to_author');
      spliceDoc(row);
    });
  }

  /** current → withdrawn (admin only — also enforced by the DB trigger) */
  async function withdraw(id, reason) {
    return run(async (userId) => {
      const doc = await api.getById('gt_documents', id);
      const row = await transition(doc, 'withdrawn',
        { supersession_reason: reason ?? null }, userId, 'withdraw');
      spliceDoc(row);
    });
  }

  /** superseded → current (reactivation) */
  async function reactivate(id) {
    return run(async (userId) => {
      const doc = await api.getById('gt_documents', id);
      const today = todayISO();
      const row = await transition(doc, 'current', {
        effective_from: today,
        effective_to: null,
        superseded_by: null,
        review_due: reviewDueFrom(today, doc.review_cycle_days)
      }, userId, 'reactivate');
      spliceDoc(row);
    });
  }

  /**
   * Wrap a mutator: resolve the user, flip saving, normalise errors to
   * { success } and surface the message in store.error.
   * @param {(userId: string) => Promise<void>} fn
   */
  async function run(fn) {
    update((s) => ({ ...s, saving: true, error: '' }));
    try {
      const userId = await currentUserId();
      if (!userId) throw new Error('Not authenticated');
      await fn(userId);
      update((s) => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ ' + err.message);
      update((s) => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  function clearError() {
    update((s) => ({ ...s, error: '' }));
  }

  return {
    subscribe,
    load,
    loadDocument,
    loadCategories,
    loadCompleteness,
    loadPersons,
    addPerson,
    loadAuditHistory,
    loadLinks,
    addLink,
    removeDocumentLink,
    createDraft,
    submitForReview,
    accept,
    returnToAuthor,
    withdraw,
    reactivate,
    clearError
  };
}

export const gtStore = createGtStore();
