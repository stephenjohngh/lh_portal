// src/lib/apps/complaints/stores/complaintsStore.js
//
// BSA s.93 complaints. Design: docs/requirements/Complaints_App_Design.md.
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

import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { api }      from '$lib/utils/api';
import { logAudit } from '$lib/utils/auditLogger';
import { getLogger } from '$lib/utils/logger';
import { STATUS, stampsFor, entryTypeFor, blockedReason } from '../utils/complaintLifecycle.js';

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
  const { subscribe, update } = writable({
    cases:      [],
    selected:   null,
    timeline:   [],
    actions:    [],
    loading:    false,
    saving:     false,
    error:      null,
  });

  // ── Who is acting ─────────────────────────────────────────────────────────

  async function currentUserProfile() {
    const { data: { user } } = await supabase.auth.getUser();
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

  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const cases = await api.get('complaint_cases', {
        select: CASE_SELECT,
        orderBy: 'received_at',
        ascending: false,
      });
      update(s => ({ ...s, cases, loading: false }));
      return cases;
    } catch (err) {
      logger(`✖ load failed: ${err.message}`);
      update(s => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
  }

  /** One case, with its timeline and actions. */
  async function select(id) {
    if (!id) {
      update(s => ({ ...s, selected: null, timeline: [], actions: [] }));
      return null;
    }
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const [selected, timeline, actions] = await Promise.all([
        api.getById('complaint_cases', id, CASE_SELECT),
        api.get('complaint_timeline_entries', {
          filters: { case_id: id }, orderBy: 'created_at', ascending: true,
        }),
        api.get('complaint_actions', {
          filters: { case_id: id }, orderBy: 'created_at', ascending: true,
        }),
      ]);
      update(s => ({ ...s, selected, timeline, actions, loading: false }));
      return selected;
    } catch (err) {
      logger(`✖ select(${id}) failed: ${err.message}`);
      update(s => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
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
      return row;
    } catch (err) {
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
    } catch (err) {
      logger(`✖ save(${id}) failed: ${err.message}`);
      update(s => ({ ...s, saving: false, error: err.message }));
      throw err;
    }
  }

  /**
   * Move a complaint to a new status.
   *
   * The single place a status changes, so the date stamps and the timeline
   * entry cannot drift apart. Refuses locally first — the trigger would refuse
   * too, but a constraint violation is a poor way to learn you needed to write
   * the response.
   */
  async function transition(id, to, note = '') {
    update(s => ({ ...s, saving: true, error: null }));
    try {
      const before = await api.getById('complaint_cases', id, '*');
      const why = blockedReason(before, to);
      if (why) throw new Error(why);

      const author = await currentUserProfile();
      await api.update('complaint_cases', id, {
        status: to,
        ...stampsFor(to),
        updated_by: author.id,
      });

      await addTimelineEntry(id, entryTypeFor(to), note, author,
        { from_status: before.status, to_status: to });

      logAudit('update', 'complaint', id, before.reference, {
        appId: 'complaints', eventCategory: 'complaints',
        severity: to === STATUS.ESCALATED ? 'warning' : 'info',
        afterData: { from: before.status, to },
      });

      const row = await refresh(id);
      const timeline = await api.get('complaint_timeline_entries', {
        filters: { case_id: id }, orderBy: 'created_at', ascending: true,
      });
      update(s => ({ ...s, timeline, saving: false }));
      return row;
    } catch (err) {
      logger(`✖ transition(${id} -> ${to}) failed: ${err.message}`);
      update(s => ({ ...s, saving: false, error: err.message }));
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

  async function assign(id, userId, userName) {
    const author = await currentUserProfile();
    await api.update('complaint_cases', id, { assigned_to: userId || null, updated_by: author.id });
    await addTimelineEntry(id, 'assignment',
      userId ? `Assigned to ${userName}.` : 'Unassigned.', author);
    const timeline = await api.get('complaint_timeline_entries', {
      filters: { case_id: id }, orderBy: 'created_at', ascending: true,
    });
    update(s => ({ ...s, timeline }));
    return refresh(id);
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

  return {
    subscribe,
    load, select, refresh,
    create, save, transition, addNote, recordEscalationTold, assign,
    addAction, updateAction, deleteAction,
    clearError,
  };
}

export const complaintsStore = createComplaintsStore();
