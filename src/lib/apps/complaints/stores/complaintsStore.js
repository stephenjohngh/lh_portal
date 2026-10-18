// src/lib/apps/complaints/stores/complaintsStore.js
//
// BSA s.93 complaints. Design: docs/requirements/app_designs/Complaints_App_Design.md.
//
// Follows morStore's shape deliberately — a case, an append-only timeline, a
// transition method that stamps dates and writes the timeline in one place —
// because the two are the same kind of record and somebody reading one should
// recognise the other. What is NOT shared is the state machine, which lives in
// utils/complaintLifecycle.js and is mirrored by SQL (migration 187).
//
// The database is the guarantee: the invariant trigger refuses an illegal
// transition, an immutable reference and a response with no text. Everything
// here is so a person is told before they press the button rather than by a
// constraint violation afterwards.
//
// ⭐ Since migration 252 a complaint MOVES through the shared workflow manager
// ('complaint' workflow, seeded from utils/complaintWorkflow.js): its step is
// its status, the database sets the status, dates and timeline in the same
// transaction, and the item carries the two clocks (step deadlines) and who it
// is with (the workflow's assignee). A direct status update is refused.

import { writable } from 'svelte/store';
import { api }      from '#lib/utils/api.js';
import { logAudit } from '#lib/utils/auditLogger.js';
import { getLogger } from '#lib/utils/logger.js';
import { STATUS, blockedReason } from '../utils/complaintLifecycle.js';
import { loadWorkflow, listItems, itemHistory, moveItem, saveWorkflow, assignItem, listAssignees } from '#lib/workflow/workflowApi.js';
import { ensureNonWorkingDays } from '#lib/workflow/nonWorkingDays.js';
import { COMPLAINT_WORKFLOW_KEY, DEFAULT_COMPLAINT_WORKFLOW } from '../utils/complaintWorkflow.js';
import { storeLoader } from '../../../utils/storeLoad.js';
import { currentUser } from '#lib/utils/currentUser.js';
import { errMessage } from '#lib/utils/errors.js';

const logger = getLogger('complaintsStore');

// Joined names, so a list does not need a second round trip to say who owns a
// case. `component` is optional and only present when one was linked.
const CASE_SELECT = `
  *,
  assigned_to_profile:profiles!assigned_to(full_name),
  created_by_profile:profiles!created_by(full_name),
  component:components!component_id(id, label, type_code, asset_id)
`.trim();

function createComplaintsStore() {
  /**
 * Store state, typed so consumers get Row types instead of `never`.
 * `& Record<string, any>` tolerates the joined aliases these queries select;
 * without it a bare Tables<> swaps one error message for another.
   *
   * @typedef {import('#lib/database.types.ts').Tables<'complaint_cases'> & Record<string, any>} ComplaintCase
   * @typedef {{
   *   cases: ComplaintCase[],
   *   selected: ComplaintCase | null,
   *   timeline: (import('#lib/database.types.ts').Tables<'complaint_timeline_entries'> & Record<string, any>)[],
   *   actions: (import('#lib/database.types.ts').Tables<'complaint_actions'> & Record<string, any>)[],
   *   workflow: any|null, steps: any[], moves: any[], fields: any[], items: any[],
   *   loading: boolean,
   *   saving: boolean,
   *   error: string | null
   * }} ComplaintsState
   */
  const { subscribe, update } = writable(/** @type {ComplaintsState} */ ({
    cases:      [],
    selected:   null,
    timeline:   [],
    actions:    [],
    workflow:   null,
    steps:      [],
    moves:      [],
    fields:     [],
    items:      [],
    loading:    false,
    saving:     false,
    error:      null,
  }));

  // ── Who is acting ─────────────────────────────────────────────────────────

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

  /**
   * Append to the timeline.
   *
   * `author_name` is denormalised on purpose: a deleted profile must not erase
   * who acted on a statutory record.
   */
  async function addTimelineEntry(caseId, type, content, author, extra = {}) {
    return api.create('complaint_timeline_entries', {
      case_id:     caseId,
      entry_type:  type,
      content:     content ?? '',
      author_id:   author.id,
      author_name: author.full_name,
      ...extra,
    }, true);
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  /** The workflow and its items: where each complaint is, its deadline, who has it. */
  async function readWorkflow() {
    const wf = await loadWorkflow(COMPLAINT_WORKFLOW_KEY);
    if (!wf) return { workflow: null, steps: [], moves: [], fields: [], items: [] };
    return { ...wf, items: await listItems(wf.workflow.id) };
  }

  const load = storeLoader(update,
    async () => {
      const [cases, wf] = await Promise.all([
        api.getAll('complaint_cases', { select: CASE_SELECT, orderBy: 'received_at', ascending: false }),
        readWorkflow(),
      ]);
      return { cases, ...wf };
    },
    (data) => data,
    { what: 'the complaints', log: logger });

  /** Re-read only the workflow's items (after a move or an assignment). */
  async function reloadItems() {
    const wf = await readWorkflow();
    update(s => ({ ...s, ...wf }));
  }

  /**
   * Admin: save the shipped workflow when there is none (the seed rule), attach
   * any complaint logged before it existed, then read.
   */
  async function setUpWorkflow() {
    await ensureNonWorkingDays();                 // the clocks count working days
    await saveWorkflow(DEFAULT_COMPLAINT_WORKFLOW);
    await api.rpc('complaint_attach_to_workflow', {});
    logAudit('create', 'workflow', null, DEFAULT_COMPLAINT_WORKFLOW.name, { appId: 'complaints', eventCategory: 'complaints' });
    await load();
  }

  /**
   * One case, with its timeline and actions; `select(null)` closes it.
   * ⚠ Closing goes through the same loader on purpose: it is then the newest
   * request, so a case still loading when Back was pressed cannot reopen
   * itself when it arrives.
   */
  const loadCase = storeLoader(update,
    async (id) => {
      if (!id) return { selected: null, timeline: [], actions: [] };
      const [selected, timeline, actions] = await Promise.all([
        api.getById('complaint_cases', id, CASE_SELECT),
        api.get('complaint_timeline_entries', {
          filters: { case_id: id }, orderBy: 'created_at', ascending: true,
        }),
        api.get('complaint_actions', {
          filters: { case_id: id }, orderBy: 'created_at', ascending: true,
        }),
      ]);
      return { selected, timeline, actions };
    },
    (one) => one,
    { what: 'the complaint', log: logger });

  async function select(id) {
    const one = await loadCase(id ?? null);
    return one?.selected ?? null;
  }

  /** Re-read one case into the list and, if it is open, the detail. */
  async function refresh(id) {
    const row = await api.getById('complaint_cases', id, CASE_SELECT);
    update(s => ({
      ...s,
      cases: s.cases.map(c => (c.id === id ? row : c)),
      selected: s.selected?.id === id ? row : s.selected,
    }));
    return row;
  }

  // ── Writing ───────────────────────────────────────────────────────────────

  /**
   * Log a complaint.
   *
   * `reference` is omitted — the column default calls case_next_reference('CMP')
   * (migration 186), which serialises concurrent inserts. A client-computed
   * reference would race, which is the bug MOR already fixed once.
   */
  async function create(data) {
    update(s => ({ ...s, saving: true, error: null }));
    try {
      const author = await currentUserProfile();
      const row = await api.create('complaint_cases', {
        ...data,
        status: STATUS.RECEIVED,
        created_by: author.id,
        updated_by: author.id,
      }, true);

      await addTimelineEntry(row.id, 'status_change',
        `Complaint logged (${row.channel.replace(/_/g, ' ')}).`, author,
        { to_status: STATUS.RECEIVED });

      // An out-of-scope judgement made at logging is itself a decision, and the
      // regulator may ask how many were made and why.
      if (!row.in_scope) {
        await addTimelineEntry(row.id, 'scope_decision',
          `Judged out of scope: ${row.scope_rationale}`, author);
      }

      logAudit('create', 'complaint', row.id, row.reference, {
        appId: 'complaints', eventCategory: 'complaints', severity: 'info',
        afterData: { reference: row.reference, subject: row.subject, in_scope: row.in_scope },
      });

      update(s => ({ ...s, cases: [row, ...s.cases], saving: false }));
      await reloadItems();                       // the database made its workflow item
      return row;
    } catch (/** @type {any} */ err) {
      logger(`✖ create failed: ${err.message}`);
      update(s => ({ ...s, saving: false, error: err.message }));
      throw err;
    }
  }

  /** Edit the case's own fields. Never the status — that is `transition`. */
  async function save(id, fields) {
    update(s => ({ ...s, saving: true, error: null }));
    try {
      const author = await currentUserProfile();
      const { status, reference, received_at, ...safe } = fields;   // eslint-disable-line no-unused-vars
      await api.update('complaint_cases', id, { ...safe, updated_by: author.id });

      logAudit('update', 'complaint', id, safe.subject ?? '', {
        appId: 'complaints', eventCategory: 'complaints', severity: 'info',
        afterData: safe,
      });

      const row = await refresh(id);
      update(s => ({ ...s, saving: false }));
      return row;
    } catch (/** @type {any} */ err) {
      logger(`✖ save(${id}) failed: ${err.message}`);
      update(s => ({ ...s, saving: false, error: err.message }));
      throw err;
    }
  }

  /**
   * Move a complaint on, through its workflow (migration 252).
   *
   * Refuses locally first — s.93's machine and "write the response first" —
   * and the database refuses the same things: the workflow's move and its
   * conditions, then the case's own trigger and CHECK. The database sets the
   * status and dates and writes the case's timeline in the same transaction.
   */
  async function transition(id, to, note = '') {
    update(s => ({ ...s, saving: true, error: null }));
    try {
      const before = await api.getById('complaint_cases', id, '*');
      const why = blockedReason(before, to);
      if (why) throw new Error(why);
      let item = null;
      update(s => { item = s.items.find(i => i.subject_id === id) ?? null; return s; });
      if (!item) throw new Error('This complaint is not in its workflow yet — an administrator opening Complaints sets it up.');

      await moveItem(/** @type {any} */ (item).id, to, note);

      logAudit('update', 'complaint', id, before.reference, {
        appId: 'complaints', eventCategory: 'complaints',
        severity: to === STATUS.ESCALATED ? 'warning' : 'info',
        afterData: { from: before.status, to },
      });

      const row = await refresh(id);
      const timeline = await api.get('complaint_timeline_entries', {
        filters: { case_id: id }, orderBy: 'created_at', ascending: true,
      });
      await reloadItems();
      update(s => ({ ...s, timeline, saving: false }));
      return row;
    } catch (/** @type {any} */ err) {
      logger(`✖ transition(${id} -> ${to}) failed: ${err.message}`);
      update(s => ({ ...s, saving: false, error: errMessage(err) }));
      throw err;
    }
  }

  /** A note on the record, changing nothing else. */
  async function addNote(id, content) {
    if (!String(content ?? '').trim()) return null;
    const author = await currentUserProfile();
    const entry = await addTimelineEntry(id, 'note', content.trim(), author);
    update(s => ({ ...s, timeline: [...s.timeline, entry] }));
    return entry;
  }

  /**
   * Record that the complainant was told they may escalate to the BSR.
   *
   * Its own method because it is its own fact — see the design, §5.1. It is
   * evidence that the duty was discharged, and it happens whether or not
   * anybody ever escalates.
   */
  async function recordEscalationTold(id) {
    const author = await currentUserProfile();
    await api.update('complaint_cases', id, {
      escalation_told_at: new Date().toISOString(),
      updated_by: author.id,
    });
    await addTimelineEntry(id, 'escalation',
      'Complainant told of their right to escalate to the Building Safety Regulator.', author);

    logAudit('update', 'complaint', id, '', {
      appId: 'complaints', eventCategory: 'complaints', severity: 'info',
      afterData: { escalation_told: true },
    });

    const timeline = await api.get('complaint_timeline_entries', {
      filters: { case_id: id }, orderBy: 'created_at', ascending: true,
    });
    update(s => ({ ...s, timeline }));
    return refresh(id);
  }

  /**
   * Give a complaint to someone, or to nobody — the workflow's assignee
   * (migration 250), the same as every workflow. The case's own `assigned_to`
   * column is no longer written. Also noted on the case's timeline.
   */
  async function assign(id, userId, userName) {
    let item = null;
    update(s => { item = s.items.find(i => i.subject_id === id) ?? null; return s; });
    if (!item) throw new Error('This complaint is not in its workflow yet.');
    const result = await assignItem(/** @type {any} */ (item).id, userId || null);
    if (result?.changed) {
      const author = await currentUserProfile();
      await addTimelineEntry(id, 'assignment', userId ? `Given to ${userName}.` : 'Now with no one.', author);
      const timeline = await api.get('complaint_timeline_entries', {
        filters: { case_id: id }, orderBy: 'created_at', ascending: true,
      });
      update(s => ({ ...s, timeline }));
    }
    await reloadItems();
    return result;
  }

  /** Who a complaint may be given to. */
  function assignees() {
    let wf = null;
    update(s => { wf = s.workflow; return s; });
    return wf ? listAssignees(/** @type {any} */ (wf).id) : Promise.resolve([]);
  }

  /** One item's history (for the printable record). @param {string} itemId */
  function history(itemId) {
    return itemHistory(itemId);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function addAction(caseId, data) {
    const author = await currentUserProfile();
    const row = await api.create('complaint_actions', {
      ...data, case_id: caseId, created_by: author.id, updated_by: author.id,
    }, true);
    update(s => ({ ...s, actions: [...s.actions, row] }));
    return row;
  }

  async function updateAction(id, fields) {
    const author = await currentUserProfile();
    const row = await api.update('complaint_actions', id, { ...fields, updated_by: author.id }, true);
    update(s => ({ ...s, actions: s.actions.map(a => (a.id === id ? row : a)) }));
    return row;
  }

  async function deleteAction(id) {
    await api.delete('complaint_actions', id);
    update(s => ({ ...s, actions: s.actions.filter(a => a.id !== id) }));
  }

  function clearError() {
    update(s => ({ ...s, error: null }));
  }

  /** A write that shows its own failure, then rethrows — as save and transition do. */
  function reported(fn) {
    return async (...args) => {
      update(st => ({ ...st, error: null }));
      try {
        return await fn(...args);
      } catch (/** @type {any} */ err) {
        logger('❌', fn.name, err);
        update(st => ({ ...st, saving: false, error: errMessage(err) }));
        throw err;
      }
    };
  }

  return {
    subscribe,
    load, select, refresh, setUpWorkflow, reloadItems, assignees, history,
    create, save, transition,
    // ⛔ These six did not set `error` when they failed, and the screen swallows
    // the throw on the understanding that the store has shown it — so a failed
    // note, or a failed record that the complainant was told of their right to
    // escalate (evidence of the s.93 duty), vanished without a word (2026-10-03).
    addNote:              reported(addNote),
    recordEscalationTold: reported(recordEscalationTold),
    assign:               reported(assign),
    addAction:            reported(addAction),
    updateAction:         reported(updateAction),
    deleteAction:         reported(deleteAction),
    clearError,
  };
}

export const complaintsStore = createComplaintsStore();
