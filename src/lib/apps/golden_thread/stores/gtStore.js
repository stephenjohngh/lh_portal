// src/lib/apps/golden_thread/stores/gtStore.js
//
// Golden Thread (L2 register) store — factory pattern (CLAUDE.md store contract).
// Owns the register's in-app state and the lifecycle MUTATORS. All DB access goes
// through api.js; every mutation is audited fire-and-forget. The DB triggers
// (gt_documents_enforce_invariants_trg + the hash-chained audit) are the ultimate
// authority — these methods stay in lockstep with gtLifecycle.js, which mirrors
// the SQL transition validator.
//
// ⭐ Since migration 264 a document MOVES through the shared workflow manager
// ('gt_document', seeded from utils/gtWorkflow.js): its step is its status, and
// workflow_move() makes the change — one UPDATE of the row, so the hash-chained
// audit records it exactly as it did when this store wrote the row itself.
// Accepting a successor supersedes the prior in the same transaction (R4 gone). Ingest (createDraft) is producer-side — see golden_thread/public.js
// registerDocument (step 3).

import { writable }  from 'svelte/store';
import { api }       from '#lib/utils/api.js';
import { logAudit }  from '#lib/utils/auditLogger.js';
import { getLogger } from '#lib/utils/logger.js';
import { makeRun, readGtWorkflow, setUpGtWorkflow } from './gtStoreHelpers.js';
import { itemHistory, moveItem, assignItem, listAssignees } from '#lib/workflow/workflowApi.js';
import { DEFAULT_GT_DOCUMENT_WORKFLOW, GT_DOCUMENT_WORKFLOW_KEY } from '#lib/apps/golden_thread/utils/gtWorkflow.js';
import {
  scheduleOneCompleteness, registerDocument,
  listCitations, listDocumentLinks, cite, removeLink,
  listPersons, createPerson, updatePerson, listAuditHistory,
  listAccountablePersons, createAccountablePerson, updateAccountablePerson,
  listSafetyCaseNotifications, createSafetyCaseNotification, markSafetyCaseNotified
} from '#lib/apps/golden_thread/public.js';
import { storeLoader } from '../../../utils/storeLoad.js';

const logger = getLogger('gtStore');

function createGtStore() {
  const { subscribe, update } = writable({
    documents:        /** @type {any[]} */ ([]),
    selectedDocument: /** @type {any|null} */ (null),
    completeness:     /** @type {any[]} */ ([]),
    categories:       /** @type {any[]} */ ([]),   // applicable Schedule-1 categories (for the ingest form)
    persons:          /** @type {any[]} */ ([]),   // gt_persons registry (authors/reviewers)
    accountablePersons: /** @type {any[]} */ ([]), // gt_accountable_persons (AP/PAP register)
    safetyCaseNotifications: /** @type {any[]} */ ([]), // gt_safety_case_notifications (EXT-13.R2)
    links:            /** @type {{ outgoing: any[], incoming: any[] }} */ ({ outgoing: [], incoming: [] }),
    auditHistory:     /** @type {any[]} */ ([]),   // gt_audit rows for the selected document (admin-readable)
    // The document workflow (264) and its items: where each document is, and who has it.
    workflow:         /** @type {any|null} */ (null),
    steps:            /** @type {any[]} */ ([]),
    moves:            /** @type {any[]} */ ([]),
    fields:           /** @type {any[]} */ ([]),
    items:            /** @type {any[]} */ ([]),
    loading:          false,
    saving:           false,
    error:            ''
  });

  // ── Internal helpers ────────────────────────────────────────────────────────

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
  const load = storeLoader(update,
    async () => {
      const [documents, wf] = await Promise.all([
        api.getAll('gt_documents', { orderBy: 'created_at', ascending: false }),
        readGtWorkflow(GT_DOCUMENT_WORKFLOW_KEY),
      ]);
      return { documents, ...wf };
    },
    (data) => data,
    { what: 'the Golden Thread register', clearError: '' });

  /** Re-read only the workflow's items (after a move or an assignment). */
  async function reloadItems() {
    const wf = await readGtWorkflow(GT_DOCUMENT_WORKFLOW_KEY);
    update((s) => ({ ...s, ...wf }));
  }

  /** Admin: save the shipped document workflow when there is none, attach the register, then read. */
  async function setUpWorkflow() {
    await setUpGtWorkflow(DEFAULT_GT_DOCUMENT_WORKFLOW);
    logAudit('create', 'workflow', null, DEFAULT_GT_DOCUMENT_WORKFLOW.name, { appId: 'golden_thread', eventCategory: 'golden_thread' });
    await load();
  }

  /** @param {string} docId */
  function itemFor(docId) {
    let item = null;
    update((s) => { item = s.items.find((i) => i.subject_id === docId) ?? null; return s; });
    if (!item) throw new Error('This document is not in its workflow yet — an administrator opening Golden Thread sets it up.');
    return /** @type {any} */ (item);
  }

  /** Load one document into selectedDocument. */
  async function loadDocument(id) {
    update((s) => ({ ...s, error: '' }));
    try {
      const doc = await api.getById('gt_documents', id);
      update((s) => ({ ...s, selectedDocument: doc }));
      return doc;
    } catch (/** @type {any} */ err) {
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
    } catch (/** @type {any} */ err) {
      update((s) => ({ ...s, error: err.message }));
      throw err;
    }
  }

  /** Compute Schedule-1 completeness for the dashboard. */
  async function loadCompleteness() {
    try {
      const completeness = await scheduleOneCompleteness();
      update((s) => ({ ...s, completeness }));
    } catch (/** @type {any} */ err) {
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
    } catch (/** @type {any} */ err) {
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

  /** Update a person (competencies / expiry — Stage E), then refresh. */
  async function editPerson(id, patch) {
    return run(async (userId) => {
      await updatePerson(id, patch, userId);
      logAudit('update', 'gt_person', id, patch.full_name ?? '', {
        appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info'
      });
      await loadPersons();
    });
  }

  // ── Accountable Person / PAP register ────────────────────────────────────────

  /** Load the AP/PAP register. */
  async function loadAccountablePersons() {
    try {
      const accountablePersons = await listAccountablePersons();
      update((s) => ({ ...s, accountablePersons }));
      return accountablePersons;
    } catch (/** @type {any} */ err) {
      update((s) => ({ ...s, error: err.message }));
      throw err;
    }
  }

  /** Add an accountable person, then refresh the register. */
  async function addAccountablePerson(data) {
    return run(async (userId) => {
      const person = await createAccountablePerson(data, userId);
      logAudit('create', 'gt_accountable_person', person.id, person.name, {
        appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info'
      });
      await loadAccountablePersons();
    });
  }

  /** Update an accountable person (edit / close a tenure), then refresh. */
  async function editAccountablePerson(id, patch) {
    return run(async (userId) => {
      await updateAccountablePerson(id, patch, userId);
      logAudit('update', 'gt_accountable_person', id, patch.name ?? '', {
        appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info', afterData: patch
      });
      await loadAccountablePersons();
    });
  }

  // ── Safety-case revision -> regulator notification (EXT-13.R2) ───────────────

  /** Load the notification log. */
  async function loadSafetyCaseNotifications() {
    try {
      const safetyCaseNotifications = await listSafetyCaseNotifications();
      update((s) => ({ ...s, safetyCaseNotifications }));
      return safetyCaseNotifications;
    } catch (/** @type {any} */ err) {
      update((s) => ({ ...s, error: err.message }));
      throw err;
    }
  }

  /** Log a safety-case revision, then refresh. */
  async function addSafetyCaseNotification(data) {
    return run(async (userId) => {
      const n = await createSafetyCaseNotification(data, userId);
      logAudit('create', 'gt_safety_case_notification', n.id, n.description, {
        appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info'
      });
      await loadSafetyCaseNotifications();
    });
  }

  /** Mark a notification as told to the regulator, then refresh. */
  async function notifyRegulator(id, patch) {
    return run(async (userId) => {
      await markSafetyCaseNotified(id, patch, userId);
      logAudit('update', 'gt_safety_case_notification', id, patch?.notification_reference ?? '', {
        appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info'
      });
      await loadSafetyCaseNotifications();
    });
  }

  // ── Audit history ────────────────────────────────────────────────────────────

  /**
   * Load the immutable audit trail for a document. RLS restricts gt_audit reads
   * to admins, but that path does NOT throw — non-admins simply get an empty
   * list. So anything that *does* throw here is a genuine failure (network, DB)
   * and is surfaced, rather than being disguised as "no history" (R5 fix).
   */
  async function loadAuditHistory(documentId) {
    try {
      const auditHistory = await listAuditHistory(documentId);
      update((s) => ({ ...s, auditHistory }));
    } catch (/** @type {any} */ err) {
      update((s) => ({ ...s, auditHistory: [], error: `Audit history failed to load: ${err.message}` }));
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
    } catch (/** @type {any} */ err) {
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

  // ── Moves (the workflow's — 264) ─────────────────────────────────────────

  /**
   * Move a document on through its workflow. The database sets the status and
   * its dates (accepting: effective from today and the next review; a
   * successor supersedes its prior in the same transaction; withdrawing closes
   * the effective window) — each one UPDATE of a row, chained in gt_audit.
   * @param {string} docId @param {string} to @param {string} [note]
   */
  async function moveDocument(docId, to, note = '') {
    return run(async () => {
      const item = itemFor(docId);
      const from = item.step_key;
      await moveItem(item.id, to, note);
      let reference = '';
      update((s) => { reference = s.documents.find((d) => d.id === docId)?.reference ?? ''; return s; });
      logAudit('update', 'gt_document', docId, reference, {
        appId: 'golden_thread', eventCategory: 'golden_thread', severity: 'info', afterData: { from, to },
      });
      // The document, and — when accepting superseded another — the one it replaced.
      const row = await api.getById('gt_documents', docId);
      spliceDoc(row);
      if (to === 'current' && row?.supersedes) spliceDoc(await api.getById('gt_documents', row.supersedes));
      await reloadItems();
    });
  }

  /** Give a document to someone, or to nobody — the workflow's assignee. */
  async function assign(docId, userId) {
    return run(async () => {
      const result = await assignItem(itemFor(docId).id, userId || null);
      await reloadItems();
      return { changed: !!result?.changed };
    });
  }

  /** Who a document may be given to. */
  function assignees() {
    let wf = null;
    update((s) => { wf = s.workflow; return s; });
    return wf ? listAssignees(/** @type {any} */ (wf).id) : Promise.resolve([]);
  }

  /** One item's history (for the printable record). @param {string} itemId */
  function history(itemId) {
    return itemHistory(itemId);
  }

  /** Show a failure the screen met (e.g. setting the workflow up). @param {string} message */
  function reportError(message) {
    update((s) => ({ ...s, error: message }));
  }

  /**
   * Wrap a mutator: resolve the user, flip saving, normalise errors to
   * { success } and surface the message in store.error.
   *
   * ERROR CONVENTION (R6): MUTATORS go through run() and resolve to
   * { success, error } — components branch on the result. LOADERS (load,
   * loadDocument, …) throw — callers/onMount let the error state surface.
   * New methods should pick the side that matches their kind.
   * @param {(userId: string) => Promise<void>} fn
   */
  const run = makeRun(update, logger);

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
    editPerson,
    loadAccountablePersons,
    addAccountablePerson,
    editAccountablePerson,
    loadSafetyCaseNotifications,
    addSafetyCaseNotification,
    notifyRegulator,
    loadAuditHistory,
    loadLinks,
    addLink,
    removeDocumentLink,
    createDraft,
    setUpWorkflow,
    reloadItems,
    moveDocument,
    assign,
    assignees,
    history,
    reportError,
    clearError
  };
}

export const gtStore = createGtStore();
