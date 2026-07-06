<!-- src/lib/apps/mor/components/CaseDetail.svelte -->
<!-- Full case workflow view. Every action that writes to the store is
     surfaced through a modal — no inline expanding boxes. The status of
     the case drives which "next step" button(s) are shown in the action
     panel; everything else (mitigations, timeline, header) is always-on. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { supabase }    from '$lib/supabaseClient';
  import { morStore }    from '$lib/apps/mor/stores/morStore';
  import Badge          from '$lib/components/common/Badge.svelte';
  import Button         from '$lib/components/common/Button.svelte';
  import ErrorDisplay   from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import ConfirmDialog  from '$lib/components/common/ConfirmDialog.svelte';
  import SlaClocks      from '$lib/apps/mor/components/SlaClocks.svelte';
  import TimelineEntry  from '$lib/apps/mor/components/TimelineEntry.svelte';
  import TriageForm     from '$lib/apps/mor/components/TriageForm.svelte';
  import DecisionForm   from '$lib/apps/mor/components/DecisionForm.svelte';
  import RejectionForm  from '$lib/apps/mor/components/RejectionForm.svelte';
  import AssessmentForm from '$lib/apps/mor/components/AssessmentForm.svelte';
  import CloseForm      from '$lib/apps/mor/components/CloseForm.svelte';
  import ReopenForm     from '$lib/apps/mor/components/ReopenForm.svelte';
  import PauseForm      from '$lib/apps/mor/components/PauseForm.svelte';
  import BsrHelper      from '$lib/apps/mor/components/BsrHelper.svelte';
  import MitigationForm from '$lib/apps/mor/components/MitigationForm.svelte';
  import ReporterContactPanel from '$lib/apps/mor/components/ReporterContactPanel.svelte';
  import {
    STATUS_LABEL, STATUS_COLOUR,
    MECHANISM_LABEL, MECHANISM_COLOUR,
    CHANNEL_LABEL, REPORTER_TYPE_LABEL,
    DECISION_LABEL, TRIAGE_LABEL, TRIAGE_COLOUR,
  } from '$lib/apps/mor/utils/morHelpers';
  import { formatVerificationCode } from '$lib/utils/morVerificationCode';
  import { GT_STATUS_LABELS, GT_STATUS_BADGE } from '$lib/apps/golden_thread/utils/gtLifecycle.js';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates';

  const dispatch = createEventDispatcher();

  $: c   = $morStore.selectedCase;
  $: tl  = $morStore.timelineEntries;
  $: loading = $morStore.loading;
  $: saving  = $morStore.saving;
  $: error   = $morStore.error;       // bound directly — no local mirror

  $: isAdmin = $permissions.isAdmin;
  $: canEdit = $permissions.isAdmin || $permissions.canModify;
  $: userId  = $auth.user?.id;

  $: mitigations   = $morStore.mitigations ?? [];
  $: interimMits   = mitigations.filter(m => m.type === 'interim');
  $: permanentMits = mitigations.filter(m => m.type === 'permanent');

  // Golden Thread register documents citing this case (cross-app, read-only).
  $: gtCitations = $morStore.gtCitations ?? [];
  let loadedGtFor = null;
  $: if (c?.id && c.id !== loadedGtFor) {
    loadedGtFor = c.id;
    morStore.loadGtCitations(c.id);
  }

  // ── Modal visibility ─────────────────────────────────────────────────────
  let showTriage      = false;
  let showAssessment  = false;
  let showDecision    = false;
  let showRejection   = false;
  let showBsrNotice   = false;
  let showBsrReport   = false;
  let showClose       = false;
  let showReopen      = false;
  let showPause       = false;
  let pendingPauseType = 'reporter';
  let showNote        = false;
  let showMitForm     = false;
  let editingMit      = null;
  let pendingDeleteMit = null;

  // Note input
  let noteText  = '';
  let noteError = '';

  // Per-action delete-confirm processing flag
  let deletingMitId = null;

  // ── Action handlers ──────────────────────────────────────────────────────
  function clearErr() { morStore.clearError(); }

  async function doAcknowledge() {
    await morStore.acknowledge(c.id);
  }
  async function doStartTriage() {
    await morStore.startTriage(c.id);
  }

  async function handleTriage({ detail }) {
    const r = await morStore.submitTriage(c.id, detail);
    if (r.success) showTriage = false;
  }

  async function handleAssessment({ detail }) {
    const r = await morStore.recordAssessment(c.id, detail);
    if (r.success) showAssessment = false;
  }

  async function handleDecision({ detail }) {
    const r = await morStore.proposeDecision(c.id, detail);
    if (r.success) showDecision = false;
  }

  async function doApprove() {
    await morStore.approveDecision(c.id);
  }

  async function handleReject({ detail }) {
    const r = await morStore.rejectDecision(c.id, detail);
    if (r.success) showRejection = false;
  }

  async function handleBsrNotice({ detail }) {
    const r = await morStore.recordBsrNotice(c.id, detail);
    if (r.success) showBsrNotice = false;
  }
  async function handleBsrReport({ detail }) {
    const r = await morStore.recordBsrReport(c.id, detail);
    if (r.success) showBsrReport = false;
  }

  async function doAddNote() {
    noteError = '';
    if (!noteText.trim()) { noteError = 'Note cannot be empty.'; return; }
    const r = await morStore.addNote(c.id, noteText.trim());
    if (r.success) { showNote = false; noteText = ''; }
  }

  async function handleClose({ detail }) {
    const r = await morStore.closeCase(c.id, detail);
    if (r.success) showClose = false;
  }

  async function doMarkRemediationComplete() {
    await morStore.markRemediationComplete(c.id);
  }

  async function handlePause({ detail }) {
    const r = await morStore.pauseCase(c.id, detail.pauseType, detail.reason);
    if (r.success) showPause = false;
  }

  async function doResume() {
    await morStore.resumeCase(c.id);
  }

  async function handleReopen({ detail }) {
    const r = await morStore.reopenCase(c.id, detail.reason);
    if (r.success) showReopen = false;
  }

  // Mitigations
  async function handleAddMitigation({ detail }) {
    const r = await morStore.addMitigation(c.id, detail);
    if (r.success) { showMitForm = false; editingMit = null; }
  }
  async function handleEditMitigation({ detail }) {
    const r = await morStore.updateMitigation(editingMit.id, c.id, detail);
    if (r.success) { showMitForm = false; editingMit = null; }
  }
  async function doMarkMitComplete(mit) {
    await morStore.updateMitigation(mit.id, c.id, { ...mit, status: 'complete' });
  }
  function requestDeleteMit(mit) { pendingDeleteMit = mit; }
  async function confirmDeleteMit() {
    if (!pendingDeleteMit) return;
    deletingMitId = pendingDeleteMit.id;
    try {
      await morStore.deleteMitigation(pendingDeleteMit.id, c.id);
    } finally {
      pendingDeleteMit = null;
      deletingMitId = null;
    }
  }

  // ── Export case record (.docx) ───────────────────────────────────────────
  let exporting = false;
  let exportError = '';
  async function exportCaseRecord() {
    exporting = true;
    exportError = '';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { exportError = 'Not signed in.'; return; }
      const r = await fetch(`/api/mor/${encodeURIComponent(c.id)}/case-report`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        exportError = j.error ?? 'Could not generate the report.';
        return;
      }
      const blob = await r.blob();
      const dispo = r.headers.get('Content-Disposition') ?? '';
      const m = dispo.match(/filename="([^"]+)"/);
      const filename = m ? m[1] : `${c.reference}-case-record.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      exportError = `Could not export: ${err.message}`;
    } finally {
      exporting = false;
    }
  }
</script>

{#if loading && !c}
  <LoadingSpinner />
{:else if !c}
  <p class="text-slate-500 text-sm">No case selected.</p>
{:else}

<!-- ── Back button + export ─────────────────────────────────────────────── -->
<div class="mb-4 flex items-center justify-between gap-2">
  <button
    type="button"
    on:click={() => dispatch('back')}
    class="text-sm text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
  >
    ← Cases
  </button>
  <button
    type="button"
    on:click={exportCaseRecord}
    disabled={exporting}
    class="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50
           disabled:cursor-not-allowed text-slate-200 transition-colors"
    title="Download full case record as a Word document"
  >
    {exporting ? 'Generating…' : '📄 Export case record (.docx)'}
  </button>
</div>
{#if exportError}
  <p class="text-red-400 text-xs mb-3 text-right">{exportError}</p>
{/if}

<!-- ── Case header ──────────────────────────────────────────────────────── -->
<div class="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-4">
  <div class="flex flex-wrap items-start gap-3 mb-3">
    <div class="flex items-center gap-2">
      {#if c.urgency}
        <span class="text-red-400 font-bold text-lg" title="Urgent">⚠</span>
      {/if}
      <h2 class="text-xl font-bold font-mono text-white">{c.reference}</h2>
    </div>
    <div class="flex flex-wrap gap-2 ml-auto">
      <Badge bgClass={STATUS_COLOUR[c.status] ?? 'bg-slate-600'}>
        {STATUS_LABEL[c.status] ?? c.status}
      </Badge>
      {#if c.mechanism && c.mechanism !== 'unknown'}
        <Badge bgClass={MECHANISM_COLOUR[c.mechanism]}>
          {MECHANISM_LABEL[c.mechanism]}
        </Badge>
      {/if}
    </div>
  </div>

  <SlaClocks {c} />
</div>

<!-- ── Error display ───────────────────────────────────────────────────── -->
{#if error}
  <div class="mb-4">
    <ErrorDisplay message={error} onDismiss={clearErr} />
  </div>
{/if}

<!-- ── Reporter-contact nudges (Phase 2c) ───────────────────────────────── -->
{#if canEdit}
  <ReporterContactPanel {c} timeline={tl} />
{/if}

<!-- ── Action panel ────────────────────────────────────────────────────── -->
{#if c.status !== 'closed' && c.status !== 'reclassified'}
  <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">

    {#if c.status === 'submitted'}
      <p class="text-sm text-slate-400 mb-3">
        <strong class="text-slate-200">Next:</strong> Acknowledge receipt to the reporter (same business day).
      </p>
      {#if canEdit}
        <Button variant="primary" size="medium" disabled={saving} on:click={doAcknowledge}>
          Mark Acknowledged
        </Button>
      {/if}

    {:else if c.status === 'acknowledged'}
      <p class="text-sm text-slate-400 mb-3">
        <strong class="text-slate-200">Next:</strong> Triage Officer to assess whether this meets the MOR threshold (within 24 hours).
      </p>
      {#if canEdit}
        <Button variant="primary" size="medium" disabled={saving} on:click={doStartTriage}>
          Begin Triage
        </Button>
      {/if}

    {:else if c.status === 'in_triage'}
      <p class="text-sm text-slate-400 mb-3">
        <strong class="text-slate-200">Next:</strong> Apply the two-part threshold test and record the triage outcome.
      </p>
      {#if canEdit}
        <Button variant="primary" size="medium" on:click={() => showTriage = true}>
          Record Triage
        </Button>
      {/if}

    {:else if c.status === 'in_assessment'}
      <p class="text-sm text-slate-400 mb-3">
        <strong class="text-slate-200">Next:</strong> Technical advisor (fire/structural engineer) to provide written assessment.
        Record the outcome when received.
      </p>
      {#if canEdit}
        <Button variant="primary" size="medium" on:click={() => showAssessment = true}>
          Record Assessment Complete
        </Button>
      {/if}

    {:else if c.status === 'decision_pending'}
      {#if !c.decision_outcome}
        <p class="text-sm text-slate-400 mb-3">
          <strong class="text-slate-200">Next:</strong> AP to propose a decision (BSR / internal / no action).
          A different user (PAP/admin) must then approve.
        </p>
        {#if canEdit}
          <Button variant="primary" size="medium" on:click={() => showDecision = true}>
            Propose Decision
          </Button>
        {/if}
      {:else}
        <div class="space-y-3">
          <div class="bg-slate-700/50 rounded-lg p-3">
            <p class="text-xs text-slate-500 mb-1">Decision proposed</p>
            <p class="text-sm font-semibold text-slate-200">{DECISION_LABEL[c.decision_outcome]}</p>
            <p class="text-sm text-slate-300 mt-1">{c.decision_rationale}</p>
            <p class="text-xs text-slate-500 mt-1">
              By: {c.decision_proposed_by_profile?.full_name ?? 'Unknown'}
            </p>
          </div>

          {#if isAdmin && userId !== c.decision_proposed_by}
            <div class="flex gap-2">
              <Button variant="primary" size="medium" disabled={saving} on:click={doApprove}>
                {saving ? '…' : '✓ Approve Decision'}
              </Button>
              <Button variant="danger" size="medium" on:click={() => showRejection = true}>
                Reject
              </Button>
            </div>
          {:else if userId === c.decision_proposed_by}
            <p class="text-xs text-amber-300">
              Awaiting PAP approval — you proposed this decision and cannot approve it yourself.
            </p>
            <Button variant="secondary" size="medium" on:click={() => showDecision = true}>
              Revise Decision
            </Button>
          {:else if canEdit}
            <p class="text-xs text-slate-400">
              Awaiting PAP approval.
            </p>
          {/if}
        </div>
      {/if}

    {:else if c.status === 'bsr_notice'}
      <div class="space-y-3">
        <p class="text-sm text-slate-400">
          <strong class="text-slate-200">Next:</strong> Submit the notice to the BSR portal, then record the reference here.
          {#if !c.bsr_notice_ref}
            The full report must be submitted within 10 calendar days of identification.
          {:else}
            Notice recorded — now prepare and submit the full BSR report.
          {/if}
        </p>
        {#if canEdit}
          {#if !c.bsr_notice_ref}
            <Button variant="primary" size="medium" on:click={() => showBsrNotice = true}>
              Record BSR Notice Submission
            </Button>
          {:else}
            <div class="flex flex-wrap items-center gap-3">
              <div class="text-sm">
                <span class="text-emerald-400">✓ Notice submitted</span>
                <span class="text-slate-500 ml-2">Ref: {c.bsr_notice_ref}</span>
              </div>
              <Button variant="primary" size="medium" on:click={() => showBsrReport = true}>
                Record BSR Report Submission
              </Button>
            </div>
          {/if}
        {/if}
      </div>

    {:else if c.status === 'bsr_report'}
      <div class="space-y-2">
        <p class="text-sm text-emerald-400">✓ BSR report submitted — Ref: {c.bsr_report_ref}</p>
        <p class="text-sm text-slate-400">
          <strong class="text-slate-200">Next:</strong> Proceed with permanent remediation,
          respond to any BSR queries, and close the case once remediation is complete.
        </p>
        {#if canEdit}
          <div class="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" size="medium" disabled={saving} on:click={doMarkRemediationComplete}>
              Move to Remediation
            </Button>
            <Button variant="secondary" size="medium"
              on:click={() => { pendingPauseType = 'bsr'; showPause = true; }}>
              Pause — awaiting BSR
            </Button>
          </div>
        {/if}
      </div>

    {:else if c.status === 'in_remediation'}
      <div class="space-y-3">
        <p class="text-sm text-slate-400">
          <strong class="text-slate-200">Next:</strong> Carry out and evidence the permanent remediation.
          Mark complete when the fix is in place and documented.
        </p>
        {#if canEdit}
          <div class="flex flex-wrap gap-2">
            <Button variant="primary" size="medium" disabled={saving} on:click={doMarkRemediationComplete}>
              {saving ? '…' : '✓ Mark Remediation Complete'}
            </Button>
            <Button variant="secondary" size="medium"
              on:click={() => { pendingPauseType = 'reporter'; showPause = true; }}>
              Pause — awaiting reporter
            </Button>
          </div>
        {/if}
      </div>

    {:else if c.status === 'remediated'}
      <p class="text-sm text-slate-400 mb-3">
        <strong class="text-slate-200">Permanent remediation complete.</strong>
        Close the case and capture lessons learned.
      </p>
      {#if canEdit}
        <Button variant="primary" size="medium" on:click={() => showClose = true}>
          Close Case
        </Button>
      {/if}

    {:else if c.status === 'awaiting_reporter' || c.status === 'awaiting_bsr'}
      <div class="space-y-3">
        <p class="text-sm text-slate-400">
          Case on hold: <strong class="text-slate-200">
            {c.status === 'awaiting_reporter' ? 'awaiting information from the reporter' : 'awaiting BSR response'}
          </strong>.
        </p>
        {#if canEdit}
          <Button variant="primary" size="medium" disabled={saving} on:click={doResume}>
            Resume Case
          </Button>
        {/if}
      </div>

    {:else if c.status === 'reopened'}
      <p class="text-sm text-slate-400 mb-3">
        <strong class="text-slate-200">Case reopened.</strong> Begin triage again with new information.
      </p>
      {#if canEdit}
        <Button variant="primary" size="medium" disabled={saving} on:click={doStartTriage}>
          Begin Triage
        </Button>
      {/if}
    {/if}

  </div>
{:else}
  <!-- Closed / reclassified -->
  <div class="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-4 mb-4">
    <p class="text-sm text-emerald-300 font-medium">
      {c.status === 'closed' ? '✓ Case closed' : '→ Case reclassified'}
      {#if c.closed_at}&nbsp;· {fmtDate(c.closed_at)}{/if}
    </p>
    {#if c.lessons_learned}
      <p class="text-sm text-slate-400 mt-1"><strong class="text-slate-300">Lessons learned:</strong> {c.lessons_learned}</p>
    {/if}
    {#if isAdmin && c.status === 'closed'}
      <button type="button"
        class="text-xs text-slate-500 hover:text-slate-300 mt-2 underline"
        on:click={() => showReopen = true}
      >Reopen case (admin)</button>
    {/if}
  </div>
{/if}

<!-- ── Case details ──────────────────────────────────────────────────── -->
<div class="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-4">
  <h3 class="text-sm font-semibold text-slate-300 mb-3">Case Details</h3>
  <div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">

    <div>
      <p class="text-xs text-slate-500">Description</p>
      <p class="text-slate-200 whitespace-pre-wrap mt-0.5">{c.description}</p>
    </div>

    {#if c.location_text}
      <div>
        <p class="text-xs text-slate-500">Location</p>
        <p class="text-slate-200 mt-0.5">{c.location_text}</p>
      </div>
    {/if}

    <div>
      <p class="text-xs text-slate-500">Identified</p>
      <p class="text-slate-200 mt-0.5">{fmtDateTime(c.identification_date)}</p>
    </div>

    <div>
      <p class="text-xs text-slate-500">Received</p>
      <p class="text-slate-200 mt-0.5">{fmtDateTime(c.received_date)}</p>
    </div>

    <div>
      <p class="text-xs text-slate-500">Channel</p>
      <p class="text-slate-200 mt-0.5">{CHANNEL_LABEL[c.channel] ?? c.channel}</p>
    </div>

    <div>
      <p class="text-xs text-slate-500">Reporter</p>
      <p class="text-slate-200 mt-0.5">
        {c.is_anonymous ? 'Anonymous' : REPORTER_TYPE_LABEL[c.reporter_type] ?? c.reporter_type}
        {#if c.reporter_name} · {c.reporter_name}{/if}
        {#if c.reporter_contact} · {c.reporter_contact}{/if}
      </p>
    </div>

    {#if c.triage_outcome}
      <div>
        <p class="text-xs text-slate-500">Triage</p>
        <div class="mt-0.5">
          <Badge bgClass={TRIAGE_COLOUR[c.triage_outcome] ?? 'bg-slate-600'}>
            {TRIAGE_LABEL[c.triage_outcome]}
          </Badge>
        </div>
        {#if c.triage_rationale}
          <p class="text-slate-400 text-xs mt-1">{c.triage_rationale}</p>
        {/if}
      </div>
    {/if}

    {#if c.decision_outcome && c.decision_approved_by}
      <div>
        <p class="text-xs text-slate-500">Decision</p>
        <p class="text-slate-200 mt-0.5">{DECISION_LABEL[c.decision_outcome]}</p>
        <p class="text-xs text-slate-400 mt-0.5">Approved by: {c.decision_approved_by_profile?.full_name ?? 'Unknown'}</p>
      </div>
    {/if}

    {#if c.bsr_notice_ref}
      <div>
        <p class="text-xs text-slate-500">BSR Notice Ref</p>
        <p class="text-slate-200 font-mono mt-0.5">{c.bsr_notice_ref}</p>
        <p class="text-xs text-slate-400">{fmtDateTime(c.bsr_notice_submitted_at)}</p>
      </div>
    {/if}

    {#if c.bsr_report_ref}
      <div>
        <p class="text-xs text-slate-500">BSR Report Ref</p>
        <p class="text-slate-200 font-mono mt-0.5">{c.bsr_report_ref}</p>
        <p class="text-xs text-slate-400">{fmtDateTime(c.bsr_report_submitted_at)}</p>
      </div>
    {/if}

    <div>
      <p class="text-xs text-slate-500">Logged by</p>
      <p class="text-slate-200 mt-0.5">{c.created_by_profile?.full_name ?? 'Unknown'} · {fmtDate(c.created_at)}</p>
    </div>

    {#if c.verification_code}
      <div>
        <p class="text-xs text-slate-500">Status lookup code</p>
        <p class="text-slate-200 font-mono mt-0.5">{formatVerificationCode(c.verification_code)}</p>
        <p class="text-xs text-slate-500 mt-0.5">
          Share with the reporter alongside the reference to give them access to
          <span class="font-mono">/mor/status</span>.
        </p>
      </div>
    {/if}
  </div>
</div>

<!-- ── Golden Thread references ──────────────────────────────────────── -->
{#if gtCitations.length > 0}
  <div class="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-4">
    <h3 class="text-sm font-semibold text-slate-300 mb-1">
      Golden Thread
      <span class="text-slate-500 font-normal">({gtCitations.length})</span>
    </h3>
    <p class="text-xs text-slate-500 mb-3">Register documents that cite this occurrence report.</p>
    <ul class="space-y-2">
      {#each gtCitations as l (l.id)}
        <li class="flex flex-wrap items-center gap-2 text-sm">
          {#if l.document}
            <span class="font-mono text-xs text-slate-400">{l.document.reference}</span>
            <span class="text-slate-200">{l.document.title}</span>
            <Badge color={GT_STATUS_BADGE[l.document.status] ?? 'bg-slate-500'}>
              {GT_STATUS_LABELS[l.document.status] ?? l.document.status}
            </Badge>
          {:else}
            <span class="font-mono text-xs text-slate-500">{l.source_id}</span>
          {/if}
          <span class="text-xs text-slate-500">({l.relation})</span>
          {#if l.note}<span class="text-xs text-slate-500">· {l.note}</span>{/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<!-- ── Mitigations ────────────────────────────────────────────────── -->
<div class="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-4">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-sm font-semibold text-slate-300">
      Mitigations
      {#if mitigations.length > 0}
        <span class="text-slate-500 font-normal">({mitigations.length})</span>
      {/if}
    </h3>
    {#if canEdit}
      <Button variant="secondary" size="small" on:click={() => { editingMit = null; showMitForm = true; }}>
        + Add
      </Button>
    {/if}
  </div>

  {#if mitigations.length === 0}
    <p class="text-sm text-slate-500 italic">No mitigations recorded yet.</p>
  {:else}
    {@const mitGroups = [
      { label: 'Interim',   items: interimMits,   accent: 'text-amber-400'   },
      { label: 'Permanent', items: permanentMits, accent: 'text-emerald-400' },
    ]}
    {#each mitGroups as grp}
      {#if grp.items.length > 0}
        <div class="mb-3">
          <p class="text-xs font-semibold {grp.accent} uppercase tracking-wide mb-2">{grp.label}</p>
          <div class="space-y-2">
            {#each grp.items as mit (mit.id)}
              <div class="bg-slate-700/40 border border-slate-600/60 rounded-lg p-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-slate-200">{mit.description}</p>
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-500">
                      {#if mit.owner}<span>Owner: {mit.owner}</span>{/if}
                      {#if mit.target_date}<span>Target: {mit.target_date}</span>{/if}
                      <span class="
                        {mit.status === 'complete'    ? 'text-emerald-400' :
                         mit.status === 'in_progress' ? 'text-amber-400' : 'text-slate-400'}
                        font-medium capitalize">{mit.status.replace('_', ' ')}</span>
                    </div>
                    {#if mit.notes}<p class="text-xs text-slate-500 mt-1 italic">{mit.notes}</p>{/if}
                  </div>
                  {#if canEdit && mit.status !== 'complete'}
                    <div class="flex gap-1 shrink-0">
                      <button type="button"
                        class="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded
                               hover:bg-emerald-900/30 transition-colors"
                        on:click={() => doMarkMitComplete(mit)}
                      >✓ Complete</button>
                      <button type="button"
                        class="text-xs text-slate-400 hover:text-white px-2 py-1 rounded
                               hover:bg-slate-600 transition-colors"
                        on:click={() => { editingMit = mit; showMitForm = true; }}
                      >Edit</button>
                    </div>
                  {/if}
                  {#if isAdmin}
                    <button type="button"
                      class="text-xs text-red-500 hover:text-red-400 px-1 py-1 ml-1"
                      title="Delete mitigation"
                      on:click={() => requestDeleteMit(mit)}
                    >✕</button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>

<!-- ── Timeline ──────────────────────────────────────────────────────── -->
<div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-sm font-semibold text-slate-300">Timeline</h3>
    {#if !showNote}
      <Button variant="secondary" size="small" on:click={() => showNote = true}>+ Add Note</Button>
    {/if}
  </div>

  {#if showNote}
    <div class="mb-4 space-y-2">
      <textarea bind:value={noteText} rows="3"
        class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white
               placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        placeholder="Add a note to the case record…"
      ></textarea>
      {#if noteError}<p class="text-red-400 text-xs">{noteError}</p>{/if}
      <div class="flex gap-2">
        <Button variant="primary"   size="medium" disabled={saving} on:click={doAddNote}>
          {saving ? 'Saving…' : 'Add Note'}
        </Button>
        <Button variant="secondary" size="medium" on:click={() => { showNote = false; noteText = ''; noteError = ''; }}>
          Cancel
        </Button>
      </div>
    </div>
  {/if}

  {#if tl.length === 0}
    <p class="text-sm text-slate-500 italic">No timeline entries yet.</p>
  {:else}
    <div>
      {#each tl as entry (entry.id)}
        <TimelineEntry {entry} />
      {/each}
    </div>
  {/if}
</div>

{/if}

<!-- ── Modals ─────────────────────────────────────────────────────────── -->
<TriageForm
  show={showTriage} {saving} {error}
  on:submit={handleTriage}
  on:close={() => { showTriage = false; clearErr(); }}
  on:clearError={clearErr}
/>

<AssessmentForm
  show={showAssessment} {saving} {error}
  on:submit={handleAssessment}
  on:close={() => { showAssessment = false; clearErr(); }}
  on:clearError={clearErr}
/>

<DecisionForm
  show={showDecision} {saving} {error}
  existingOutcome={c?.decision_outcome ?? ''}
  existingRationale={c?.decision_rationale ?? ''}
  on:submit={handleDecision}
  on:close={() => { showDecision = false; clearErr(); }}
  on:clearError={clearErr}
/>

<RejectionForm
  show={showRejection} {saving} {error}
  on:submit={handleReject}
  on:close={() => { showRejection = false; clearErr(); }}
  on:clearError={clearErr}
/>

<BsrHelper
  show={showBsrNotice} mode="notice" {saving} {c} {error}
  on:submit={handleBsrNotice}
  on:close={() => { showBsrNotice = false; clearErr(); }}
  on:clearError={clearErr}
/>

<BsrHelper
  show={showBsrReport} mode="report" {saving} {c} {error}
  on:submit={handleBsrReport}
  on:close={() => { showBsrReport = false; clearErr(); }}
  on:clearError={clearErr}
/>

<PauseForm
  show={showPause} {saving} {error}
  pauseType={pendingPauseType}
  on:submit={handlePause}
  on:close={() => { showPause = false; clearErr(); }}
  on:clearError={clearErr}
/>

<CloseForm
  show={showClose} {saving} {error}
  on:submit={handleClose}
  on:close={() => { showClose = false; clearErr(); }}
  on:clearError={clearErr}
/>

<ReopenForm
  show={showReopen} {saving} {error}
  on:submit={handleReopen}
  on:close={() => { showReopen = false; clearErr(); }}
  on:clearError={clearErr}
/>

<MitigationForm
  show={showMitForm} {saving} {error}
  mitigation={editingMit}
  on:submit={editingMit ? handleEditMitigation : handleAddMitigation}
  on:close={() => { showMitForm = false; editingMit = null; clearErr(); }}
  on:clearError={clearErr}
/>

<ConfirmDialog
  show={!!pendingDeleteMit}
  title="Delete mitigation"
  message="Delete this mitigation? This cannot be undone."
  confirmText="Delete"
  danger={true}
  processing={!!deletingMitId}
  on:confirm={confirmDeleteMit}
  on:cancel={() => { pendingDeleteMit = null; }}
/>
