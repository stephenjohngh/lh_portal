// src/lib/apps/mor/stores/morStore.js
import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { api }      from '$lib/utils/api';
import { logAudit } from '$lib/utils/auditLogger';
import { getLogger } from '$lib/utils/logger';
import { isValidTransition } from '$lib/apps/mor/utils/morHelpers';

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
  const { subscribe, update, set } = writable({
    cases:          [],
    selectedCase:   null,
    timelineEntries:[],
    mitigations:    [],
    loading:        false,
    saving:         false,
    error:          '',
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

  /** Generate next reference in MOR-YYYY-NNNNNN format */
  async function generateReference() {
    const year = new Date().getFullYear();
    const { count, error } = await supabase
      .from('mor_cases')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01T00:00:00Z`)
      .lt('created_at',  `${year + 1}-01-01T00:00:00Z`);
    if (error) throw error;
    return `MOR-${year}-${String((count ?? 0) + 1).padStart(6, '0')}`;
  }

  /** Append an immutable timeline entry */
  async function addTimelineEntry(caseId, type, content, authorId, authorName, extra = {}) {
    await api.create('mor_timeline_entries', {
      case_id:     caseId,
      entry_type:  type,
      content:     content ?? '',
      author_id:   authorId,
      author_name: authorName,
      ...extra,
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async function fetchCases() {
    update(s => ({ ...s, loading: true, error: '' }));
    try {
      const { data, error } = await supabase
        .from('mor_cases')
        .select(CASE_SELECT)
        .order('created_at', { ascending: false });
      if (error) throw error;
      update(s => ({ ...s, cases: data ?? [], loading: false }));
    } catch (err) {
      logger('❌ fetchCases:', err.message);
      update(s => ({ ...s, error: err.message, loading: false }));
    }
  }

  async function fetchCase(id) {
    update(s => ({ ...s, loading: true, error: '' }));
    try {
      const { data: caseData, error: cErr } = await supabase
        .from('mor_cases')
        .select(CASE_SELECT)
        .eq('id', id)
        .single();
      if (cErr) throw cErr;

      const { data: timeline, error: tErr } = await supabase
        .from('mor_timeline_entries')
        .select('*')
        .eq('case_id', id)
        .order('created_at', { ascending: true });
      if (tErr) throw tErr;

      const { data: mits, error: mErr } = await supabase
        .from('mor_mitigations')
        .select('*')
        .eq('case_id', id)
        .order('created_at', { ascending: true });
      if (mErr) throw mErr;

      update(s => ({
        ...s,
        selectedCase:    caseData,
        timelineEntries: timeline ?? [],
        mitigations:     mits ?? [],
        loading: false,
      }));
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
      const reference = await generateReference();
      const now = new Date().toISOString();

      const row = await api.create('mor_cases', {
        reference,
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
        created_at:          now,
        updated_at:          now,
        created_by:          user?.id ?? null,
        updated_by:          user?.id ?? null,
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

      await fetchCases();
      update(s => ({ ...s, saving: false }));
      return { success: true, case: row };
    } catch (err) {
      logger('❌ createCase:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  /** Generic status transition — records timeline entry */
  async function transitionStatus(caseId, newStatus, content, extra = {}) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user = await currentUser();
      const profile = await currentUserProfile();

      // Read current status to validate transition
      const current = await api.getById('mor_cases', caseId, 'status');
      if (!isValidTransition(current.status, newStatus)) {
        throw new Error(`Invalid transition: ${current.status} → ${newStatus}`);
      }

      const now = new Date().toISOString();
      const updates = {
        status:     newStatus,
        updated_at: now,
        updated_by: user?.id,
        ...extra,
      };
      // Stamp timestamp fields on specific transitions
      if (newStatus === 'acknowledged')     updates.acknowledged_at = now;
      if (newStatus === 'in_triage')        { /* stamped by submitTriage */ }
      if (newStatus === 'decision_pending') updates.decision_at = null; // clear on re-entry
      if (newStatus === 'closed')           updates.closed_at   = now;

      await api.update('mor_cases', caseId, updates);

      await addTimelineEntry(
        caseId, 'status_change', content,
        user?.id, profile.full_name,
        { from_status: current.status, to_status: newStatus }
      );

      logAudit('update', 'mor_case', caseId, newStatus, {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { status: newStatus },
      });

      await fetchCase(caseId);
      await fetchCases();
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

      // Determine next status from triage outcome
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
        updated_at:       now,
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

      await fetchCase(caseId);
      await fetchCases();
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
      const now     = new Date().toISOString();

      // Move to decision_pending
      const current = await api.getById('mor_cases', caseId, 'status');
      if (!isValidTransition(current.status, 'decision_pending')) {
        throw new Error('Cannot move to decision pending from current status');
      }

      await api.update('mor_cases', caseId, {
        status:     'decision_pending',
        updated_at: now,
        updated_by: user?.id,
      });

      await addTimelineEntry(
        caseId, 'assessment',
        `Technical assessment from ${advisorName || 'advisor'}: ${summary}`,
        user?.id, profile.full_name,
        { from_status: current.status, to_status: 'decision_pending' }
      );

      await fetchCase(caseId);
      await fetchCases();
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
      const now     = new Date().toISOString();

      await api.update('mor_cases', caseId, {
        decision_outcome:     outcome,
        decision_rationale:   rationale,
        decision_proposed_by: user?.id,
        decision_approved_by: null, // clear any previous approval
        updated_at:           now,
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

      await fetchCase(caseId);
      await fetchCases();
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ proposeDecision:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function approveDecision(caseId, { approvalNote }) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();
      const now     = new Date().toISOString();

      // Read case to get the decision outcome and enforce different-user check
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
        updated_at:           now,
        updated_by:           user?.id,
      };
      if (nextStatus === 'closed') updates.closed_at = now;

      await api.update('mor_cases', caseId, updates);

      await addTimelineEntry(
        caseId, 'approval',
        `Decision approved by ${profile.full_name}. Next: ${nextStatus.replace(/_/g, ' ')}.${approvalNote ? ' ' + approvalNote : ''}`,
        user?.id, profile.full_name,
        { from_status: current.status, to_status: nextStatus }
      );

      logAudit('update', 'mor_case', caseId, 'decision_approved', {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { status: nextStatus, approved_by: user?.id },
      });

      await fetchCase(caseId);
      await fetchCases();
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ approveDecision:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function rejectDecision(caseId, { rejectionReason }) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();
      const now     = new Date().toISOString();

      const current = await api.getById('mor_cases', caseId, 'status');

      // Send back to in_triage for re-evaluation
      await api.update('mor_cases', caseId, {
        status:               'in_triage',
        decision_proposed_by: null,
        decision_approved_by: null,
        decision_outcome:     null,
        decision_rationale:   null,
        decision_at:          null,
        updated_at:           now,
        updated_by:           user?.id,
      });

      await addTimelineEntry(
        caseId, 'rejection',
        `Decision rejected and returned to triage. Reason: ${rejectionReason}`,
        user?.id, profile.full_name,
        { from_status: current.status, to_status: 'in_triage' }
      );

      await fetchCase(caseId);
      await fetchCases();
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ rejectDecision:', err.message);
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

      await api.update('mor_cases', caseId, {
        bsr_notice_ref:          noticeRef.trim(),
        bsr_notice_submitted_at: submittedAt || now,
        bsr_notice_submitted_by: user?.id,
        bsr_notice_notes:        notes?.trim() || null,
        updated_at:              now,
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

      await fetchCase(caseId);
      await fetchCases();
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ recordBsrNotice:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function recordBsrReport(caseId, { reportRef, submittedAt, notes }) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();
      const now     = new Date().toISOString();

      // Transition to bsr_report
      const current = await api.getById('mor_cases', caseId, 'status');
      if (!isValidTransition(current.status, 'bsr_report')) {
        throw new Error(`Cannot record BSR report from status: ${current.status}`);
      }

      await api.update('mor_cases', caseId, {
        status:                   'bsr_report',
        bsr_report_ref:           reportRef.trim(),
        bsr_report_submitted_at:  submittedAt || now,
        bsr_report_submitted_by:  user?.id,
        bsr_report_notes:         notes?.trim() || null,
        updated_at:               now,
        updated_by:               user?.id,
      });

      await addTimelineEntry(
        caseId, 'bsr_report',
        `BSR full report submitted within 10-day deadline. Ref: ${reportRef}${notes ? '. ' + notes : ''}`,
        user?.id, profile.full_name,
        { from_status: current.status, to_status: 'bsr_report' }
      );

      logAudit('update', 'mor_case', caseId, 'bsr_report', {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { bsr_report_ref: reportRef },
      });

      await fetchCase(caseId);
      await fetchCases();
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ recordBsrReport:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function addNote(caseId, content) {
    if (!content?.trim()) return { success: false, error: 'Note cannot be empty' };
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();
      const now     = new Date().toISOString();

      await addTimelineEntry(caseId, 'note', content.trim(), user?.id, profile.full_name);

      await api.update('mor_cases', caseId, {
        updated_at: now, updated_by: user?.id,
      });

      await fetchCase(caseId);
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ addNote:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function closeCase(caseId, { lessonsLearned }) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();
      const now     = new Date().toISOString();

      const current = await api.getById('mor_cases', caseId, 'status');
      if (!isValidTransition(current.status, 'closed')) {
        throw new Error(`Cannot close case from status: ${current.status}`);
      }

      await api.update('mor_cases', caseId, {
        status:          'closed',
        closed_at:       now,
        lessons_learned: lessonsLearned?.trim() || null,
        updated_at:      now,
        updated_by:      user?.id,
      });

      await addTimelineEntry(
        caseId, 'closure',
        `Case closed.${lessonsLearned ? ' Lessons learned: ' + lessonsLearned : ''}`,
        user?.id, profile.full_name,
        { from_status: current.status, to_status: 'closed' }
      );

      logAudit('update', 'mor_case', caseId, 'closed', {
        appId: 'mor', eventCategory: 'mor', severity: 'info',
        afterData: { status: 'closed' },
      });

      await fetchCase(caseId);
      await fetchCases();
      update(s => ({ ...s, saving: false }));
      return { success: true };
    } catch (err) {
      logger('❌ closeCase:', err.message);
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
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
      `Case paused — ${label}.${reason ? ' ' + reason : ''}`
    );
  }

  async function resumeCase(caseId) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const current = await api.getById('mor_cases', caseId, 'status');
      const toStatus = current.status === 'awaiting_bsr' ? 'bsr_report' : 'in_remediation';
      update(s => ({ ...s, saving: false }));
      return transitionStatus(caseId, toStatus, 'Case resumed.');
    } catch (err) {
      update(s => ({ ...s, saving: false, error: err.message }));
      return { success: false, error: err.message };
    }
  }

  async function reopenCase(caseId, reason) {
    return transitionStatus(
      caseId, 'reopened',
      `Case reopened.${reason ? ' Reason: ' + reason : ''}`
    );
  }

  async function addMitigation(caseId, data) {
    update(s => ({ ...s, saving: true, error: '' }));
    try {
      const user    = await currentUser();
      const profile = await currentUserProfile();
      const now     = new Date().toISOString();

      await api.create('mor_mitigations', {
        case_id:     caseId,
        type:        data.type,
        description: data.description.trim(),
        owner:       data.owner?.trim() || null,
        target_date: data.target_date || null,
        status:      'open',
        notes:       data.notes?.trim() || null,
        created_at:  now,
        updated_at:  now,
        created_by:  user?.id,
        updated_by:  user?.id,
      }, true);

      await addTimelineEntry(
        caseId, 'mitigation',
        `${data.type === 'interim' ? 'Interim' : 'Permanent'} mitigation added: ${data.description.trim()}`,
        user?.id, profile.full_name
      );

      await api.update('mor_cases', caseId, { updated_at: now, updated_by: user?.id });
      await fetchCase(caseId);
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
      const now  = new Date().toISOString();
      const updates = {
        description: data.description?.trim(),
        owner:       data.owner?.trim() || null,
        target_date: data.target_date  || null,
        status:      data.status,
        notes:       data.notes?.trim() || null,
        updated_at:  now,
        updated_by:  user?.id,
      };
      if (data.status === 'complete' && !data.completed_at) updates.completed_at = now;
      await api.update('mor_mitigations', id, updates);
      await fetchCase(caseId);
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
      await fetchCase(caseId);
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
    clearError,
    clearSelected,
  };
}

export const morStore = createMorStore();
