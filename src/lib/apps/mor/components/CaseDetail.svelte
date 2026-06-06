<!-- src/lib/apps/mor/components/CaseDetail.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { morStore }    from '$lib/apps/mor/stores/morStore';
  import Badge        from '$lib/components/common/Badge.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import SlaClocks    from '$lib/apps/mor/components/SlaClocks.svelte';
  import TimelineEntry from '$lib/apps/mor/components/TimelineEntry.svelte';
  import TriageForm   from '$lib/apps/mor/components/TriageForm.svelte';
  import DecisionForm from '$lib/apps/mor/components/DecisionForm.svelte';
  import BsrHelper       from '$lib/apps/mor/components/BsrHelper.svelte';
  import MitigationForm  from '$lib/apps/mor/components/MitigationForm.svelte';
  import {
    STATUS_LABEL, STATUS_COLOUR,
    MECHANISM_LABEL, MECHANISM_COLOUR,
    CHANNEL_LABEL, REPORTER_TYPE_LABEL,
    DECISION_LABEL, TRIAGE_LABEL, TRIAGE_COLOUR,
  } from '$lib/apps/mor/utils/morHelpers';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates';

  const dispatch = createEventDispatcher();

  $: c  = $morStore.selectedCase;
  $: tl = $morStore.timelineEntries;
  $: loading  = $morStore.loading;
  $: saving   = $morStore.saving;
  $: storeErr = $morStore.error;

  $: isAdmin  = $permissions.isAdmin;
  $: canEdit  = $permissions.isAdmin || $permissions.canModify;
  $: userId   = $auth.user?.id;

  // ── modal visibility ──────────────────────────────────────────────────────
  let showTriage       = false;
  let showDecision     = false;
  let showApproval     = false;
  let showBsrNotice    = false;
  let showBsrReport    = false;
  let showNoteBox      = false;
  let showAssessmentBox= false;
  let showCloseBox     = false;
  let showRejectionBox = false;
  let showReopenBox    = false;
  let showPauseBox     = false;
  let pendingPauseType = 'reporter'; // 'reporter' | 'bsr'
  let showMitForm      = false;
  let editingMit       = null;      // null = add, object = edit

  // Note / close / assessment / rejection / pause / reopen inputs
  let noteText        = '';
  let noteError       = '';
  let advisorName     = '';
  let assessSummary   = '';
  let assessError     = '';
  let lessonsLearned  = '';
  let rejectionReason = '';
  let rejectionError  = '';
  let reopenReason    = '';
  let reopenError     = '';
  let pauseReason     = '';

  // Local error (from store action)
  let actionError = '';

  $: if (storeErr) actionError = storeErr;

  function clearErr() {
    actionError = '';
    morStore.clearError();
  }

  // ── action handlers ──────────────────────────────────────────────────────

  async function doAcknowledge() {
    const r = await morStore.acknowledge(c.id);
    if (!r.success) actionError = r.error;
  }

  async function doStartTriage() {
    const r = await morStore.startTriage(c.id);
    if (!r.success) actionError = r.error;
  }

  async function handleTriage({ detail }) {
    const r = await morStore.submitTriage(c.id, detail);
    if (r.success) showTriage = false;
    else actionError = r.error;
  }

  async function handleAssessment() {
    assessError = '';
    if (!assessSummary.trim()) { assessError = 'Assessment summary is required.'; return; }
    const r = await morStore.recordAssessment(c.id, {
      advisorName: advisorName.trim(),
      summary:     assessSummary.trim(),
    });
    if (r.success) { showAssessmentBox = false; advisorName = ''; assessSummary = ''; }
    else actionError = r.error;
  }

  async function handleDecision({ detail }) {
    const r = await morStore.proposeDecision(c.id, detail);
    if (r.success) showDecision = false;
    else actionError = r.error;
  }

  async function doApprove() {
    const r = await morStore.approveDecision(c.id, { approvalNote: '' });
    if (!r.success) actionError = r.error;
    showApproval = false;
  }

  async function doReject() {
    rejectionError = '';
    if (!rejectionReason.trim()) { rejectionError = 'Provide a reason for rejection.'; return; }
    const r = await morStore.rejectDecision(c.id, { rejectionReason: rejectionReason.trim() });
    if (r.success) { showRejectionBox = false; rejectionReason = ''; }
    else actionError = r.error;
  }

  async function handleBsrNotice({ detail }) {
    const r = await morStore.recordBsrNotice(c.id, detail);
    if (r.success) showBsrNotice = false;
    else actionError = r.error;
  }

  async function handleBsrReport({ detail }) {
    const r = await morStore.recordBsrReport(c.id, detail);
    if (r.success) showBsrReport = false;
    else actionError = r.error;
  }

  async function doAddNote() {
    noteError = '';
    if (!noteText.trim()) { noteError = 'Note cannot be empty.'; return; }
    const r = await morStore.addNote(c.id, noteText.trim());
    if (r.success) { showNoteBox = false; noteText = ''; }
    else actionError = r.error;
  }

  async function doClose() {
    const r = await morStore.closeCase(c.id, { lessonsLearned });
    if (r.success) { showCloseBox = false; lessonsLearned = ''; }
    else actionError = r.error;
  }

  async function doMarkRemediationComplete() {
    const r = await morStore.markRemediationComplete(c.id);
    if (!r.success) actionError = r.error;
  }

  async function doPause() {
    const r = await morStore.pauseCase(c.id, pendingPauseType, pauseReason.trim());
    if (r.success) { showPauseBox = false; pauseReason = ''; }
    else actionError = r.error;
  }

  async function doResume() {
    const r = await morStore.resumeCase(c.id);
    if (!r.success) actionError = r.error;
  }

  async function doReopen() {
    reopenError = '';
    if (!reopenReason.trim()) { reopenError = 'Please provide a reason for reopening.'; return; }
    const r = await morStore.reopenCase(c.id, reopenReason.trim());
    if (r.success) { showReopenBox = false; reopenReason = ''; }
    else actionError = r.error;
  }

  async function handleAddMitigation({ detail }) {
    const r = await morStore.addMitigation(c.id, detail);
    if (r.success) { showMitForm = false; editingMit = null; }
    else actionError = r.error;
  }

  async function handleEditMitigation({ detail }) {
    const r = await morStore.updateMitigation(editingMit.id, c.id, detail);
    if (r.success) { showMitForm = false; editingMit = null; }
    else actionError = r.error;
  }

  async function doMarkMitComplete(mit) {
    await morStore.updateMitigation(mit.id, c.id, { ...mit, status: 'complete' });
  }

  async function doDeleteMit(mit) {
    if (!confirm(`Delete this mitigation? This cannot be undone.`)) return;
    const r = await morStore.deleteMitigation(mit.id, c.id);
    if (!r.success) actionError = r.error;
  }

  $: mitigations = $morStore.mitigations ?? [];
  $: interimMits  = mitigations.filter(m => m.type === 'interim');
  $: permanentMits = mitigations.filter(m => m.type === 'permanent');
</script>

{#if loading && !c}
  <LoadingSpinner />
{:else if !c}
  <p class="text-slate-500 text-sm">No case selected.</p>
{:else}

<!-- ── Back button ──────────────────────────────────────────────────────── -->
<div class="mb-4">
  <button
    type="button"
    on:click={() => dispatch('back')}
    class="text-sm text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
  >
    ← Cases
  </button>
</div>

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

  <!-- SLA clocks -->
  <SlaClocks {c} />
</div>

<!-- ── Error display ───────────────────────────────────────────────────── -->
{#if actionError}
  <div class="mb-4">
    <ErrorDisplay message={actionError} onDismiss={clearErr} />
  </div>
{/if}

<!-- ── Action panel ──────────────────────────────────────────────────────
     Shows what the next step is and the available action buttons.
──────────────────────────────────────────────────────────────────────── -->
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
        {#if !showAssessmentBox}
          <Button variant="primary" size="medium" on:click={() => showAssessmentBox = true}>
            Record Assessment Complete
          </Button>
        {:else}
          <div class="space-y-2 mt-2">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="advisor-name" class="block text-xs text-slate-400 mb-1">Advisor name / firm</label>
                <input id="advisor-name" type="text" bind:value={advisorName}
                  class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                         focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="e.g. J Smith, ABC Engineers" />
              </div>
              <div><!-- spacer --></div>
            </div>
            <div>
              <label for="assess-summary" class="block text-xs text-slate-400 mb-1">Assessment summary <span class="text-red-400">*</span></label>
              <textarea id="assess-summary" bind:value={assessSummary} rows="3"
                class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                       placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                placeholder="Summarise the technical opinion — mechanism, severity, threshold conclusion…"
              ></textarea>
              {#if assessError}<p class="text-red-400 text-xs">{assessError}</p>{/if}
            </div>
            <div class="flex gap-2">
              <Button variant="primary"   size="medium" disabled={saving} on:click={handleAssessment}>
                {saving ? 'Saving…' : 'Record Assessment'}
              </Button>
              <Button variant="secondary" size="medium" on:click={() => showAssessmentBox = false}>Cancel</Button>
            </div>
          </div>
        {/if}
      {/if}

    {:else if c.status === 'decision_pending'}
      {#if !c.decision_outcome}
        <!-- No decision proposed yet -->
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
        <!-- Decision proposed — show summary + approval/rejection buttons -->
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
            <!-- PAP can approve or reject -->
            <div class="flex gap-2">
              <Button variant="primary" size="medium" disabled={saving} on:click={doApprove}>
                {saving ? '…' : '✓ Approve Decision'}
              </Button>
              {#if !showRejectionBox}
                <Button variant="danger" size="medium" on:click={() => showRejectionBox = true}>
                  Reject
                </Button>
              {/if}
            </div>
            {#if showRejectionBox}
              <div class="space-y-2">
                <textarea bind:value={rejectionReason} rows="2"
                  class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                         placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  placeholder="Reason for rejection…"
                ></textarea>
                {#if rejectionError}<p class="text-red-400 text-xs">{rejectionError}</p>{/if}
                <div class="flex gap-2">
                  <Button variant="danger"     size="medium" disabled={saving} on:click={doReject}>Reject</Button>
                  <Button variant="secondary"  size="medium" on:click={() => showRejectionBox = false}>Cancel</Button>
                </div>
              </div>
            {/if}
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
              on:click={() => { pendingPauseType = 'reporter'; showPauseBox = !showPauseBox; }}>
              Pause — awaiting reporter
            </Button>
          </div>
          {#if showPauseBox}
            <div class="space-y-2 mt-2">
              <textarea bind:value={pauseReason} rows="2"
                class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                       placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                placeholder="Reason for pausing…"
              ></textarea>
              <div class="flex gap-2">
                <Button variant="primary"   size="medium" disabled={saving} on:click={doPause}>Pause Case</Button>
                <Button variant="secondary" size="medium" on:click={() => showPauseBox = false}>Cancel</Button>
              </div>
            </div>
          {/if}
        {/if}
      </div>

    {:else if c.status === 'remediated'}
      <p class="text-sm text-slate-400 mb-3">
        <strong class="text-slate-200">Permanent remediation complete.</strong>
        Close the case and capture lessons learned.
      </p>
      {#if canEdit}
        {#if !showCloseBox}
          <Button variant="primary" size="medium" on:click={() => showCloseBox = true}>Close Case</Button>
        {:else}
          <div class="space-y-2">
            <div>
              <label for="lessons-learned" class="block text-xs text-slate-400 mb-1">
                Lessons learned (recommended)
              </label>
              <textarea id="lessons-learned" bind:value={lessonsLearned} rows="3"
                class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                       placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                placeholder="What can be improved or applied to future cases?"
              ></textarea>
            </div>
            <div class="flex gap-2">
              <Button variant="primary"   size="medium" disabled={saving} on:click={doClose}>Close Case</Button>
              <Button variant="secondary" size="medium" on:click={() => showCloseBox = false}>Cancel</Button>
            </div>
          </div>
        {/if}
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
      {#if !showReopenBox}
        <button type="button"
          class="text-xs text-slate-500 hover:text-slate-300 mt-2 underline"
          on:click={() => showReopenBox = true}
        >Reopen case (admin)</button>
      {:else}
        <div class="mt-3 space-y-2">
          <textarea bind:value={reopenReason} rows="2"
            class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                   placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            placeholder="Reason for reopening (required)…"
          ></textarea>
          {#if reopenError}<p class="text-red-400 text-xs">{reopenError}</p>{/if}
          <div class="flex gap-2">
            <Button variant="primary"   size="medium" disabled={saving} on:click={doReopen}>Reopen</Button>
            <Button variant="secondary" size="medium" on:click={() => { showReopenBox = false; reopenReason = ''; }}>Cancel</Button>
          </div>
        </div>
      {/if}
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
        <Badge bgClass={TRIAGE_COLOUR[c.triage_outcome] ?? 'bg-slate-600'} class="mt-0.5">
          {TRIAGE_LABEL[c.triage_outcome]}
        </Badge>
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
  </div>
</div>

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
      { label: 'Interim', items: interimMits,   accent: 'text-amber-400',   badge: 'bg-amber-700' },
      { label: 'Permanent', items: permanentMits, accent: 'text-emerald-400', badge: 'bg-emerald-700' },
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
                        {mit.status === 'complete'   ? 'text-emerald-400' :
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
                      on:click={() => doDeleteMit(mit)}
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
    {#if !showNoteBox}
      <Button variant="secondary" size="small" on:click={() => showNoteBox = true}>+ Add Note</Button>
    {/if}
  </div>

  {#if showNoteBox}
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
        <Button variant="secondary" size="medium" on:click={() => { showNoteBox = false; noteText = ''; noteError = ''; }}>
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
  show={showTriage}
  {saving}
  error={showTriage ? actionError : ''}
  on:submit={handleTriage}
  on:close={() => { showTriage = false; clearErr(); }}
  on:clearError={clearErr}
/>

<DecisionForm
  show={showDecision}
  {saving}
  error={showDecision ? actionError : ''}
  existingOutcome={c?.decision_outcome ?? ''}
  existingRationale={c?.decision_rationale ?? ''}
  on:submit={handleDecision}
  on:close={() => { showDecision = false; clearErr(); }}
  on:clearError={clearErr}
/>

<BsrHelper
  show={showBsrNotice}
  mode="notice"
  {saving}
  {c}
  error={showBsrNotice ? actionError : ''}
  on:submit={handleBsrNotice}
  on:close={() => { showBsrNotice = false; clearErr(); }}
  on:clearError={clearErr}
/>

<BsrHelper
  show={showBsrReport}
  mode="report"
  {saving}
  {c}
  error={showBsrReport ? actionError : ''}
  on:submit={handleBsrReport}
  on:close={() => { showBsrReport = false; clearErr(); }}
  on:clearError={clearErr}
/>

<MitigationForm
  show={showMitForm}
  {saving}
  mitigation={editingMit}
  error={showMitForm ? actionError : ''}
  on:submit={editingMit ? handleEditMitigation : handleAddMitigation}
  on:close={() => { showMitForm = false; editingMit = null; clearErr(); }}
  on:clearError={clearErr}
/>
