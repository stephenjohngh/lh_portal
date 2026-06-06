// src/lib/apps/mor/stores/morStore.js
import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { api }      from '$lib/utils/api';
import { logAudit } from '$lib/utils/auditLogger';
import { getLogger } from '$lib/utils/logger';
import { isValidTransition } from '$lib/apps/mor/utils/morHelpers';
import { generateMorReference } from '$lib/utils/morReference';
import { generateVerificationCode } from '$lib/utils/morVerificationCode';

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

function createMorStore() {
  const { subscribe, update } = writable({
    cases:                  [],
    selectedCase:           null,
    timelineEntries:        [],
    mitigations:            [],
    // Map<case_id, TimelineEntry[]> — reporter_contact entries for every
    // currently-loaded case. Populated by fetchCases() and kept fresh by
    // recordReporterContact(). Drives the dashboard backlog widgets.
    reporterContactsByCase: {},
    loading:                false,
    saving:                 false,
    error:                  '',
  });

  // ── Internal helpers ───────────────────────────────────────────────────────

  async function currentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }

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
      update(s => ({ ...s, reporterContactsByCase: {} }));
      return;
    }
    try {
      const { data, error } = await supabase
        .from('mor_timeline_entries')
        .select('id, case_id, entry_type, contact_kind, content, created_at')
        .eq('entry_type', 'reporter_contact')
        .in('case_id', caseIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const byCase = {};
      for (const row of (data ?? [])) {
        (byCase[row.case_id] ??= []).push(row);
      }
      update(s => ({ ...s, reporterContactsByCase: byCase }));
    } catch (err) {
      logger('⚠ loadReporterContactsForCases (non-fatal):', err.message);
    }
  }

  async function fetchCases() {
    update(s => ({ ...s, loading: true, error: '' }));
    try {
      const { data, error } = await supabase
        .from('mor_cases')
        .select(CASE_SELECT)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const cases = data ?? [];
      update(s => ({ ...s, cases, loading: false }));
      // Reporter-contact map is dashboard-only; load it in the background
      // and don't block the case list on it.
      loadReporterContactsForCases(cases.map(c => c.id));
    } catch (err) {
      logger('❌ fetchCases:', err.message);
      update(s => ({ ...s, error: err.message, loading: false }));
    }
  }

  async function fetchCase(id) {
    update(s => ({ ...s, loading: true, error: '' }));
    try {
      await refreshCase(id);
      update(s => ({ ...s, loading: false }));
    } catch (err) {
      logger('❌ fetchCase:', err.message);
      update(s => ({ ...s, error: err.message, loading: false }));
    }
  }

  async function createCase(data) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user = await currentUser();
      const profile = await currentUserProfile();
      // Use the user-token client so RLS still applies (vs service role).
      const reference = await generateMorReference(supabase);
      const now = new Date().toISOString();

      const row = await api.create('mor_cases', {
        reference,
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
    } catch (err) {
      logger('❌ createCase:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  /**
   * Generic status transition — validates, updates row, records timeline entry.
   * @param {string}  caseId
   * @param {string}  newStatus
   * @param {string}  content                      Human-readable summary.
   * @param {object} [options]
   * @param {string} [options.entryType]           Timeline entry type override
   *                                               (default 'status_change').
   * @param {object} [options.extraFields]         Additional column updates.
   */
  async function transitionStatus(caseId, newStatus, content, options = {}) {
    const { entryType = 'status_change', extraFields = {} } = options;
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user = await currentUser();
      const profile = await currentUserProfile();

      const current = await api.getById('mor_cases', caseId, 'status');
      if (!isValidTransition(current.status, newStatus)) {
        throw new Error(`Invalid transition: ${current.status} → ${newStatus}`);
      }

      const now = new Date().toISOString();
      const updates = {
        status:     newStatus,
        updated_by: user?.id,
        ...extraFields,
      };
      // Stamp workflow milestones (updated_at handled by DB trigger).
      if (newStatus === 'acknowledged') updates.acknowledged_at = now;
      if (newStatus === 'closed')       updates.closed_at       = now;

      await api.update('mor_cases', caseId, updates);

      await addTimelineEntry(
        caseId, entryType, content,
        user?.id, profile.full_name,
        { from_status: current.status, to_status: newStatus }
      );

      logAudit('update', 'mor_case', caseId, newStatus, {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { status: newStatus },
      });

      await refreshCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ transitionStatus:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function acknowledge(caseId) {
    return transitionStatus(caseId, 'acknowledged', 'Case acknowledged to reporter.');
  }

  async function startTriage(caseId) {
    return transitionStatus(caseId, 'in_triage', 'Triage started.');
  }

  async function submitTriage(caseId, { outcome, rationale }) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();
      const now     = new Date().toISOString();

      const nextStatus =
        outcome === 'clearly_reportable'  ? 'decision_pending' :
        outcome === 'possibly_reportable' ? 'in_assessment' :
        'reclassified'; // not_reportable → reclassified

      const current = await api.getById('mor_cases', caseId, 'status');
      if (!isValidTransition(current.status, nextStatus)) {
        throw new Error(`Invalid transition for triage outcome: ${outcome}`);
      }

      await api.update('mor_cases', caseId, {
        status:           nextStatus,
        triage_outcome:   outcome,
        triage_rationale: rationale,
        triage_by:        user?.id,
        triaged_at:       now,
        updated_by:       user?.id,
      });

      await addTimelineEntry(
        caseId, 'triage',
        `Outcome: ${outcome.replace(/_/g, ' ')}. ${rationale}`,
        user?.id, profile.full_name,
        { from_status: current.status, to_status: nextStatus }
      );

      logAudit('update', 'mor_case', caseId, 'triage', {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { triage_outcome: outcome },
      });

      await refreshCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ submitTriage:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function recordAssessment(caseId, { advisorName, summary }) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();

      const current = await api.getById('mor_cases', caseId, 'status');
      if (!isValidTransition(current.status, 'decision_pending')) {
        throw new Error('Cannot move to decision pending from current status');
      }

      await api.update('mor_cases', caseId, {
        status:     'decision_pending',
        updated_by: user?.id,
      });

      await addTimelineEntry(
        caseId, 'assessment',
        `Technical assessment from ${advisorName || 'advisor'}: ${summary}`,
        user?.id, profile.full_name,
        { from_status: current.status, to_status: 'decision_pending' }
      );

      logAudit('update', 'mor_case', caseId, 'assessment', {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { assessment_advisor: advisorName },
      });

      await refreshCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ recordAssessment:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
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
    } catch (err) {
      logger('❌ proposeDecision:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function approveDecision(caseId) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();
      const now     = new Date().toISOString();

      const current = await api.getById('mor_cases', caseId,
        'status, decision_outcome, decision_proposed_by');

      if (current.decision_proposed_by === user?.id) {
        throw new Error('The approver must be a different user from the person who proposed the decision.');
      }

      const nextStatus =
        current.decision_outcome === 'bsr'       ? 'bsr_notice' :
        current.decision_outcome === 'internal'  ? 'in_remediation' :
        'closed';

      if (!isValidTransition(current.status, nextStatus)) {
        throw new Error(`Cannot transition from ${current.status} to ${nextStatus}`);
      }

      const updates = {
        status:               nextStatus,
        decision_approved_by: user?.id,
        decision_at:          now,
        updated_by:           user?.id,
      };
      if (nextStatus === 'closed') updates.closed_at = now;

      await api.update('mor_cases', caseId, updates);

      await addTimelineEntry(
        caseId, 'approval',
        `Decision approved by ${profile.full_name}. Next: ${nextStatus.replace(/_/g, ' ')}.`,
        user?.id, profile.full_name,
        { from_status: current.status, to_status: nextStatus }
      );

      logAudit('update', 'mor_case', caseId, 'decision_approved', {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { status: nextStatus, approved_by: user?.id },
      });

      await refreshCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ approveDecision:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function rejectDecision(caseId, { rejectionReason }) {
    return transitionStatus(
      caseId, 'in_triage',
      `Decision rejected and returned to triage. Reason: ${rejectionReason}`,
      {
        entryType: 'rejection',
        extraFields: {
          decision_proposed_by: null,
          decision_approved_by: null,
          decision_outcome:     null,
          decision_rationale:   null,
          decision_at:          null,
        },
      }
    );
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
    } catch (err) {
      logger('❌ recordBsrNotice:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function recordBsrReport(caseId, { reportRef, submittedAt, notes }) {
    const user = await currentUser();
    return transitionStatus(
      caseId, 'bsr_report',
      `BSR full report submitted within 10-day deadline. Ref: ${reportRef}${notes ? '. ' + notes : ''}`,
      {
        entryType: 'bsr_report',
        extraFields: {
          bsr_report_ref:           reportRef.trim(),
          bsr_report_submitted_at:  submittedAt || new Date().toISOString(),
          bsr_report_submitted_by:  user?.id,
          bsr_report_notes:         notes?.trim() || null,
        },
      }
    );
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
    } catch (err) {
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
    } catch (err) {
      logger('❌ recordReporterContact:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function closeCase(caseId, { lessonsLearned }) {
    return transitionStatus(
      caseId, 'closed',
      `Case closed.${lessonsLearned ? ' Lessons learned: ' + lessonsLearned : ''}`,
      {
        entryType: 'closure',
        extraFields: { lessons_learned: lessonsLearned?.trim() || null },
      }
    );
  }

  function clearError() {
    update(s => ({ ...s, error: '' }));
  }

  function clearSelected() {
    update(s => ({ ...s, selectedCase: null, timelineEntries: [], mitigations: [] }));
  }

  // ── Phase 1d — Mitigations, remediation, pause, reopen ────────────────────

  async function markRemediationComplete(caseId) {
    return transitionStatus(
      caseId, 'remediated',
      'Permanent remediation complete. Awaiting formal close-out.'
    );
  }

  async function pauseCase(caseId, pauseType, reason) {
    const toStatus = pauseType === 'bsr' ? 'awaiting_bsr' : 'awaiting_reporter';
    const label    = pauseType === 'bsr' ? 'awaiting BSR response' : 'awaiting reporter information';
    return transitionStatus(
      caseId, toStatus,
      `Case paused — ${label}.${reason ? ' ' + reason : ''}`,
      { entryType: 'sla_pause' }
    );
  }

  async function resumeCase(caseId) {
    let toStatus;
    try {
      const current = await api.getById('mor_cases', caseId, 'status');
      toStatus = current.status === 'awaiting_bsr' ? 'bsr_report' : 'in_remediation';
    } catch (err) {
      update(s => ({ ...s, error: err.message }));
      return { success: false, error: err.message };
    }
    return transitionStatus(
      caseId, toStatus,
      'Case resumed.',
      { entryType: 'sla_resume' }
    );
  }

  async function reopenCase(caseId, reason) {
    return transitionStatus(
      caseId, 'reopened',
      `Case reopened.${reason ? ' Reason: ' + reason : ''}`,
      { entryType: 'reopened' }
    );
  }

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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
    acknowledge,
    startTriage,
    submitTriage,
    recordAssessment,
    proposeDecision,
    approveDecision,
    rejectDecision,
    recordBsrNotice,
    recordBsrReport,
    addNote,
    closeCase,
    markRemediationComplete,
    pauseCase,
    resumeCase,
    reopenCase,
    addMitigation,
    updateMitigation,
    deleteMitigation,
    recordReporterContact,
    loadReporterContactsForCases,
    clearError,
    clearSelected,
  };
}

export const morStore = createMorStore();
