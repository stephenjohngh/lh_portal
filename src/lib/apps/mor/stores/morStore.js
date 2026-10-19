// src/lib/apps/mor/stores/morStore.js
//
// ⭐ Since migration 263 a case MOVES through the shared workflow manager
// ('mor_case' workflow, seeded from utils/morWorkflow.js): its step is its
// status, and workflow_move() sets the status, stamps the dates and writes the
// case's timeline. ⛔ Never update mor_cases.status directly — the database
// refuses it. A triage and the BSR report are recorded and moved together
// (mor_triage, mor_record_bsr_report); an approval is the workflow's move,
// refused by the database unless a different person proposed that decision.
import { errMessage } from '../../../utils/errors.js';
import { writable } from 'svelte/store';
import { supabase } from '#lib/supabaseClient.js';
import { readAllPages, chunks } from '#lib/utils/readAllPages.js';
import { api }      from '#lib/utils/api.js';
import { logAudit } from '#lib/utils/auditLogger.js';
import { getLogger } from '#lib/utils/logger.js';
import { generateVerificationCode } from '#lib/utils/caseVerificationCode.js';
import { listDocumentsCiting } from '#lib/apps/golden_thread/public.js';
import { storeLoader } from '#lib/utils/storeLoad.js';
import { currentUser } from '#lib/utils/currentUser.js';
import { loadWorkflow, listItems, itemHistory, moveItem, saveWorkflow, assignItem, listAssignees } from '#lib/workflow/workflowApi.js';
import { MOR_WORKFLOW_KEY, DEFAULT_MOR_WORKFLOW, TRIAGE_OUTCOME_FOR } from '../utils/morWorkflow.js';

const logger = getLogger('morStore');

// SELECT fragment used for both list and detail — includes joined profiles
const CASE_SELECT = `
  *,
  created_by_profile:profiles!created_by(full_name),
  updated_by_profile:profiles!updated_by(full_name),
  triage_by_profile:profiles!triage_by(full_name),
  decision_proposed_by_profile:profiles!decision_proposed_by(full_name),
  decision_approved_by_profile:profiles!decision_approved_by(full_name),
  bsr_notice_by_profile:profiles!bsr_notice_submitted_by(full_name),
  bsr_report_by_profile:profiles!bsr_report_submitted_by(full_name),
  component:components!component_id(id, label, type_code, asset_id)
`.trim();

/**
 * Store state, typed so consumers get Row types instead of `never`.
 *
 * ⚠ The `& Record<string, any>` on each row type is deliberate and is NOT
 * laziness: `CASE_SELECT` above joins profile and component aliases
 * (`created_by_profile`, `component`, …) that are not columns of the table, so a
 * bare `Tables<'mor_cases'>` would trade every "does not exist on type 'never'"
 * for a "does not exist on type 'MorCase'". The intersection keeps the real
 * column types — which is the whole benefit — while tolerating the joins.
 *
 * @typedef {import('#lib/database.types.ts').Tables<'mor_cases'> & Record<string, any>} MorCase
 * @typedef {import('#lib/database.types.ts').Tables<'mor_timeline_entries'> & Record<string, any>} TimelineEntry
 * @typedef {import('#lib/database.types.ts').Tables<'mor_mitigations'> & Record<string, any>} Mitigation
 * @typedef {{
 *   cases: MorCase[],
 *   selectedCase: MorCase | null,
 *   timelineEntries: TimelineEntry[],
 *   mitigations: Mitigation[],
 *   gtCitations: Record<string, any>[],
 *   reporterContactsByCase: Record<string, TimelineEntry[]>,
 *   reporterContactsUnavailable: boolean,
 *   workflow: any|null, steps: any[], moves: any[], fields: any[], items: any[],
 *   loading: boolean,
 *   saving: boolean,
 *   error: string
 * }} MorState
 */

function createMorStore() {
  const { subscribe, update } = writable(/** @type {MorState} */ ({
    cases:                  [],
    selectedCase:           null,
    timelineEntries:        [],
    mitigations:            [],
    // Golden Thread register documents citing the selected case (cross-app read
    // via golden_thread/public.js). Non-fatal — empty if GT is unavailable.
    gtCitations:            [],
    // Map<case_id, TimelineEntry[]> — reporter_contact entries for every
    // currently-loaded case. Populated by fetchCases() and kept fresh by
    // recordReporterContact(). Drives the dashboard backlog widgets.
    reporterContactsByCase: {},
    // ⛔ The contact history could not be read. The nudges would then treat
    // every case as never contacted, so the dashboard says so instead.
    reporterContactsUnavailable: false,
    // The workflow and its items: where each case is, and who has it.
    workflow:               null,
    steps:                  [],
    moves:                  [],
    fields:                 [],
    items:                  [],
    loading:                false,
    saving:                 false,
    error:                  '',
  }));

  // ── Internal helpers ───────────────────────────────────────────────────────

  async function currentUserProfile() {
    const user = await currentUser();
    if (!user) return { id: null, full_name: 'Unknown' };
    try {
      const profile = await api.getById('profiles', user.id, 'id, full_name');
      return profile ?? { id: user.id, full_name: user.email ?? 'Unknown' };
    } catch {
      return { id: user.id, full_name: user.email ?? 'Unknown' };
    }
  }

  /** Append an immutable timeline entry */
  async function addTimelineEntry(caseId, type, content, authorId, authorName, extra = {}) {
    return api.create('mor_timeline_entries', {
      case_id:     caseId,
      entry_type:  type,
      content:     content ?? '',
      author_id:   authorId,
      author_name: authorName,
      ...extra,
    }, true);
  }

  /**
   * Refresh a single case + its timeline + mitigations and splice the result
   * into the store's in-memory list. Replaces the previous fetchCase + fetchCases
   * double round-trip after every mutation.
   */
  async function refreshCase(caseId) {
    const [{ data: caseData, error: cErr },
           { data: timeline, error: tErr },
           { data: mits, error: mErr }] = await Promise.all([
      supabase.from('mor_cases').select(CASE_SELECT).eq('id', caseId).single(),
      supabase.from('mor_timeline_entries').select('*').eq('case_id', caseId)
              .order('created_at', { ascending: true }),
      supabase.from('mor_mitigations').select('*').eq('case_id', caseId)
              .order('created_at', { ascending: true }),
    ]);
    if (cErr) throw cErr;
    if (tErr) throw tErr;
    if (mErr) throw mErr;

    update(s => {
      const idx = s.cases.findIndex(c => c.id === caseId);
      const nextCases = idx >= 0
        ? s.cases.map((c, i) => i === idx ? caseData : c)
        : [caseData, ...s.cases]; // not yet in list — prepend
      // Mirror the per-case reporter_contact entries into the dashboard map
      // so the backlog widgets reflect the latest state without a refetch.
      const contacts = (timeline ?? []).filter(t => t.entry_type === 'reporter_contact');
      return {
        ...s,
        cases:           nextCases,
        selectedCase:    s.selectedCase?.id === caseId ? caseData : s.selectedCase,
        timelineEntries: timeline ?? [],
        mitigations:     mits ?? [],
        reporterContactsByCase: { ...s.reporterContactsByCase, [caseId]: contacts },
      };
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Batch-load reporter_contact timeline entries for the given case ids and
   * splice them into `reporterContactsByCase`. Cheap because the partial
   * index from migration 139 covers this exact predicate.
   */
  async function loadReporterContactsForCases(caseIds) {
    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      update(s => ({ ...s, reporterContactsByCase: {}, reporterContactsUnavailable: false }));
      return;
    }
    try {
      // Chunked and paged: every case's contacts, however many cases.
      const data = [];
      for (const ids of chunks(caseIds)) {
        data.push(...await readAllPages(() => supabase
          .from('mor_timeline_entries')
          .select('id, case_id, entry_type, contact_kind, content, created_at')
          .eq('entry_type', 'reporter_contact')
          .in('case_id', ids)
          .order('created_at', { ascending: true })
          .order('id')));
      }
      data.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
      const byCase = {};
      for (const row of (data ?? [])) {
        (byCase[row.case_id] ??= []).push(row);
      }
      update(s => ({ ...s, reporterContactsByCase: byCase, reporterContactsUnavailable: false }));
    } catch (/** @type {any} */ err) {
      logger('⚠ loadReporterContactsForCases:', err.message);
      update(s => ({ ...s, reporterContactsUnavailable: true }));
    }
  }

  // A failure stays on the store (`error`) and is not re-thrown, as before.
  /** The workflow and its items. */
  async function readWorkflow() {
    const wf = await loadWorkflow(MOR_WORKFLOW_KEY);
    if (!wf) return { workflow: null, steps: [], moves: [], fields: [], items: [] };
    return { ...wf, items: await listItems(wf.workflow.id) };
  }

  // A failure stays on the store (`error`) and is not re-thrown, as before.
  const fetchCases = storeLoader(update,
    async () => {
      // Every page: one read stops at 1,000 cases and says nothing.
      const [cases, wf] = await Promise.all([
        readAllPages(() => supabase
          .from('mor_cases')
          .select(CASE_SELECT)
          .order('created_at', { ascending: false })
          .order('id')),
        readWorkflow(),
      ]);
      return { cases, ...wf };
    },
    (data) => {
      // Reporter-contact map is dashboard-only; load it in the background
      // and don't block the case list on it.
      loadReporterContactsForCases(data.cases.map(c => c.id));
      return data;
    },
    { what: 'the cases', clearError: '', rethrow: false, log: logger });

  /** Re-read only the workflow's items (after a move or an assignment). */
  async function reloadItems() {
    const wf = await readWorkflow();
    update(s => ({ ...s, ...wf }));
  }

  /**
   * Admin: save the shipped workflow when there is none (the seed rule), attach
   * any case logged before it existed, then read.
   */
  async function setUpWorkflow() {
    await saveWorkflow(DEFAULT_MOR_WORKFLOW);
    await api.rpc('mor_attach_to_workflow', {});
    logAudit('create', 'workflow', null, DEFAULT_MOR_WORKFLOW.name, { appId: 'mor', eventCategory: 'mor' });
    await fetchCases();
  }

  /** @param {string} caseId */
  function itemFor(caseId) {
    let item = null;
    update(s => { item = s.items.find(i => i.subject_id === caseId) ?? null; return s; });
    if (!item) throw new Error('This case is not in its workflow yet — an administrator opening MOR sets it up.');
    return /** @type {any} */ (item);
  }

  /** A write with the store's saving/error flags, answering { success, error }. */
  async function run(name, fn) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const out = await fn();
      update(s => ({ ...s, saving: false }));
      return { success: true, ...(out ?? {}) };
    } catch (/** @type {any} */ err) {
      logger(`❌ ${name}:`, errMessage(err));
      update(s => ({ ...s, saving: false, error: errMessage(err) }));
      return { success: false, error: errMessage(err) };
    }
  }

  /** After a move: the case, its timeline and the items. */
  async function afterMove(caseId, from, to) {
    let reference = '';
    update(s => { reference = s.cases.find(c => c.id === caseId)?.reference ?? ''; return s; });
    logAudit('update', 'mor_case', caseId, reference, {
      appId: 'mor', eventCategory: 'mor', severity: to === 'bsr_notice' ? 'warning' : 'info',
      afterData: { from, to },
    });
    await refreshCase(caseId);
    await reloadItems();
  }

  async function fetchCase(id) {
    update(s => ({ ...s, loading: true, error: '' }));
    try {
      await refreshCase(id);
      update(s => ({ ...s, loading: false }));
    } catch (/** @type {any} */ err) {
      logger('❌ fetchCase:', err.message);
      update(s => ({ ...s, error: err.message, loading: false }));
    }
  }

  async function createCase(data) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user = await currentUser();
      const profile = await currentUserProfile();
      const now = new Date().toISOString();

      // `reference` is omitted — the DB DEFAULT stamps it atomically, GT-style
      // (the old count(*)+1 raced). Migration 150 introduced it as
      // mor_next_reference(); 186 replaced that with the shared
      // case_next_reference('MOR'), so every case system gets the same
      // advisory-lock fix rather than a copy of it.
      const row = await api.create('mor_cases', {
        verification_code:   generateVerificationCode(),
        status:              'submitted',
        description:         data.description.trim(),
        location_text:       data.location_text?.trim() || null,
        mechanism:           data.mechanism || 'unknown',
        urgency:             data.urgency ?? false,
        channel:             data.channel ?? 'staff_logged',
        reporter_type:       data.reporter_type ?? 'unknown',
        reporter_name:       data.is_anonymous ? null : (data.reporter_name?.trim() || null),
        reporter_contact:    data.is_anonymous ? null : (data.reporter_contact?.trim() || null),
        is_anonymous:        data.is_anonymous ?? false,
        identification_date: data.identification_date ?? now,
        received_date:       now,
        created_by:          user?.id ?? null,
        updated_by:          user?.id ?? null,
        // updated_at/created_at stamped by DB defaults + trigger (mig 137)
      }, true);

      await addTimelineEntry(
        row.id, 'status_change',
        'Case created and submitted.',
        user?.id, profile.full_name,
        { from_status: null, to_status: 'submitted' }
      );

      logAudit('create', 'mor_case', row.id, row.reference, {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { reference: row.reference, status: 'submitted', urgency: row.urgency },
      });

      await refreshCase(row.id);
      update(s => ({ ...s, saving: false }));
      return { success: true, case: row };
    } catch (/** @type {any} */ err) {
      logger('❌ createCase:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  /**
   * Move a case on through its workflow — any move the workflow offers; the
   * database checks the move, its note, who may make it, and MOR's own rules.
   * @param {string} caseId @param {string} to @param {string} [note]
   */
  async function moveCase(caseId, to, note = '') {
    return run('moveCase', async () => {
      const item = itemFor(caseId);
      await moveItem(item.id, to, note);
      await afterMove(caseId, item.step_key, to);
    });
  }

  /** Triage: the outcome, its reasons and the move it decides, together (mor_triage). */
  async function submitTriage(caseId, { outcome, rationale }) {
    return run('submitTriage', async () => {
      const item = itemFor(caseId);
      await api.rpc('mor_triage', { p_case: caseId, p_outcome: outcome, p_rationale: rationale });
      const to = Object.keys(TRIAGE_OUTCOME_FOR).find((k) => TRIAGE_OUTCOME_FOR[k] === outcome) ?? 'in_triage';
      await afterMove(caseId, item.step_key, to);
    });
  }

  /** The technical assessment, recorded as the move to a decision. */
  async function recordAssessment(caseId, { advisorName, summary }) {
    return moveCase(caseId, 'decision_pending',
      `Technical assessment from ${advisorName?.trim() || 'advisor'}: ${summary?.trim() ?? ''}`);
  }

  async function proposeDecision(caseId, { outcome, rationale }) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();

      // Validate that the case is in a state where a decision can be proposed.
      const current = await api.getById('mor_cases', caseId, 'status');
      if (current.status !== 'decision_pending') {
        throw new Error('A decision can only be proposed when the case is in decision_pending.');
      }

      await api.update('mor_cases', caseId, {
        decision_outcome:     outcome,
        decision_rationale:   rationale,
        decision_proposed_by: user?.id,
        decision_approved_by: null, // clear any previous approval
        updated_by:           user?.id,
      });

      await addTimelineEntry(
        caseId, 'decision',
        `Decision proposed: ${outcome.replace(/_/g, ' ')}. ${rationale}`,
        user?.id, profile.full_name
      );

      logAudit('update', 'mor_case', caseId, 'decision_proposed', {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { decision_outcome: outcome },
      });

      await refreshCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (/** @type {any} */ err) {
      logger('❌ proposeDecision:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function recordBsrNotice(caseId, { noticeRef, submittedAt, notes }) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();
      const now     = new Date().toISOString();

      // Stays in bsr_notice — only the report submission advances to bsr_report.
      await api.update('mor_cases', caseId, {
        bsr_notice_ref:          noticeRef.trim(),
        bsr_notice_submitted_at: submittedAt || now,
        bsr_notice_submitted_by: user?.id,
        bsr_notice_notes:        notes?.trim() || null,
        updated_by:              user?.id,
      });

      await addTimelineEntry(
        caseId, 'bsr_notice',
        `BSR notice submitted. Ref: ${noticeRef}${notes ? '. ' + notes : ''}`,
        user?.id, profile.full_name
      );

      logAudit('update', 'mor_case', caseId, 'bsr_notice', {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { bsr_notice_ref: noticeRef },
      });

      await refreshCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (/** @type {any} */ err) {
      logger('❌ recordBsrNotice:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  /** The BSR full report: its reference and the move, together (mor_record_bsr_report). */
  async function recordBsrReport(caseId, { reportRef, submittedAt, notes }) {
    return run('recordBsrReport', async () => {
      const item = itemFor(caseId);
      await api.rpc('mor_record_bsr_report', {
        p_case: caseId, p_ref: reportRef, p_submitted_at: submittedAt || null, p_notes: notes || null,
      });
      await afterMove(caseId, item.step_key, 'bsr_report');
    });
  }

  async function addNote(caseId, content) {
    if (!content?.trim()) return { success: false, error: 'Note cannot be empty' };
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();

      await addTimelineEntry(caseId, 'note', content.trim(), user?.id, profile.full_name);

      // Touch the case row so updated_at reflects activity.
      await api.update('mor_cases', caseId, { updated_by: user?.id });

      await refreshCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (/** @type {any} */ err) {
      logger('❌ addNote:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  /**
   * Phase 2c — record a reporter-contact event.
   * Writes an immutable timeline entry (entry_type='reporter_contact') with
   * the canonical contact_kind. Touches the case row so updated_at advances.
   */
  async function recordReporterContact(caseId, { kind, content }) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();

      await addTimelineEntry(
        caseId,
        'reporter_contact',
        (content ?? '').trim() || null,
        user?.id, profile.full_name,
        { contact_kind: kind }
      );

      // Touch the case so updated_at advances (DB trigger stamps it).
      await api.update('mor_cases', caseId, { updated_by: user?.id });

      logAudit('update', 'mor_case', caseId, 'reporter_contact', {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { contact_kind: kind },
      });

      await refreshCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (/** @type {any} */ err) {
      logger('❌ recordReporterContact:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  /** Close-out: the lessons learned, then the move to Closed. */
  async function closeCase(caseId, { lessonsLearned }) {
    const lessons = lessonsLearned?.trim() || null;
    return run('closeCase', async () => {
      const item = itemFor(caseId);
      const user = await currentUser();
      await api.update('mor_cases', caseId, { lessons_learned: lessons, updated_by: user?.id });
      await moveItem(item.id, 'closed', lessons ? `Case closed. Lessons learned: ${lessons}` : '');
      await afterMove(caseId, item.step_key, 'closed');
    });
  }

  /** Give a case to someone, or to nobody — the workflow's assignee. */
  async function assign(caseId, userId) {
    return run('assign', async () => {
      const result = await assignItem(itemFor(caseId).id, userId || null);
      await reloadItems();
      return { changed: !!result?.changed };
    });
  }

  /** Who a case may be given to. */
  function assignees() {
    let wf = null;
    update(s => { wf = s.workflow; return s; });
    return wf ? listAssignees(/** @type {any} */ (wf).id) : Promise.resolve([]);
  }

  /** One item's history (for the printable record). @param {string} itemId */
  function history(itemId) {
    return itemHistory(itemId);
  }

  function clearError() {
    update(s => ({ ...s, error: '' }));
  }

  /** Show a failure the screen met (e.g. setting the workflow up). @param {string} message */
  function reportError(message) {
    update(s => ({ ...s, error: message }));
  }

  // Golden Thread register documents citing this case — cross-app read through
  // golden_thread/public.js. Non-fatal: empty on error / no GT permission.
  async function loadGtCitations(caseId) {
    if (!caseId) { update(s => ({ ...s, gtCitations: [] })); return; }
    try {
      const gtCitations = await listDocumentsCiting('mor_case', caseId);
      update(s => ({ ...s, gtCitations }));
    } catch (err) {
      logger('gtCitations load failed (non-fatal):', errMessage(err));
      update(s => ({ ...s, gtCitations: [] }));
    }
  }

  function clearSelected() {
    update(s => ({ ...s, selectedCase: null, timelineEntries: [], mitigations: [], gtCitations: [] }));
  }

  // ── Phase 1d — Mitigations, remediation, pause, reopen ────────────────────

  async function addMitigation(caseId, data) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();

      await api.create('mor_mitigations', {
        case_id:     caseId,
        type:        data.type,
        description: data.description.trim(),
        owner:       data.owner?.trim() || null,
        target_date: data.target_date || null,
        status:      'open',
        notes:       data.notes?.trim() || null,
        created_by:  user?.id,
        updated_by:  user?.id,
      }, true);

      await addTimelineEntry(
        caseId, 'mitigation',
        `${data.type === 'interim' ? 'Interim' : 'Permanent'} mitigation added: ${data.description.trim()}`,
        user?.id, profile.full_name
      );

      // Touch the case row so updated_at reflects activity (trigger stamps it).
      await api.update('mor_cases', caseId, { updated_by: user?.id });
      await refreshCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (/** @type {any} */ err) {
      logger('❌ addMitigation:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function updateMitigation(id, caseId, data) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user = await currentUser();
      // completed_at is auto-set by the DB trigger when status flips to 'complete'.
      const updates = {
        description: data.description?.trim(),
        owner:       data.owner?.trim() || null,
        target_date: data.target_date  || null,
        status:      data.status,
        notes:       data.notes?.trim() || null,
        updated_by:  user?.id,
      };
      await api.update('mor_mitigations', id, updates);
      await refreshCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (/** @type {any} */ err) {
      logger('❌ updateMitigation:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function deleteMitigation(id, caseId) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      await api.delete('mor_mitigations', id);
      await refreshCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (/** @type {any} */ err) {
      logger('❌ deleteMitigation:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  return {
    subscribe,
    fetchCases,
    fetchCase,
    createCase,
    setUpWorkflow,
    reloadItems,
    moveCase,
    submitTriage,
    recordAssessment,
    proposeDecision,
    recordBsrNotice,
    recordBsrReport,
    addNote,
    closeCase,
    assign,
    assignees,
    history,
    addMitigation,
    updateMitigation,
    deleteMitigation,
    recordReporterContact,
    loadReporterContactsForCases,
    loadGtCitations,
    clearError,
    reportError,
    clearSelected,
  };
}

export const morStore = createMorStore();
