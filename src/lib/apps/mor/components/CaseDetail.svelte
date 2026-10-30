<!-- src/lib/apps/mor/components/CaseDetail.svelte -->
<!-- Full case workflow view. The case moves through its workflow (migration
     263): the shared WorkflowItemControls show its step, who it is with, the
     moves from it — each held back with its reason — and the history. Moves
     that record something hand off to MOR's own forms (triage, assessment,
     BSR report, close-out), and the database makes the move with the record.
     Mitigations, timeline and the header are always-on. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { auth }        from '#lib/stores/auth.js';
  import { permissions } from '#lib/stores/permissions.js';
  import { morStore }    from '#lib/apps/mor/stores/morStore.js';
  import Badge          from '#lib/components/common/Badge.svelte';
  import Button         from '#lib/components/common/Button.svelte';
  import ErrorDisplay   from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import ConfirmDialog  from '#lib/components/common/ConfirmDialog.svelte';
  import SlaClocks      from '#lib/apps/mor/components/SlaClocks.svelte';
  import TimelineEntry  from '#lib/apps/mor/components/TimelineEntry.svelte';
  import TriageForm     from '#lib/apps/mor/components/TriageForm.svelte';
  import DecisionForm   from '#lib/apps/mor/components/DecisionForm.svelte';
  import AssessmentForm from '#lib/apps/mor/components/AssessmentForm.svelte';
  import CloseForm      from '#lib/apps/mor/components/CloseForm.svelte';
  import BsrHelper      from '#lib/apps/mor/components/BsrHelper.svelte';
  import MitigationForm from '#lib/apps/mor/components/MitigationForm.svelte';
  import ReporterContactPanel from '#lib/apps/mor/components/ReporterContactPanel.svelte';
  import WorkflowItemControls from '#lib/workflow/WorkflowItemControls.svelte';
  import { TRIAGE_OUTCOME_FOR, APPROVAL_TARGET } from '#lib/apps/mor/utils/morWorkflow.js';
  import { profiles, profilesStore } from '#lib/stores/profiles.js';
  import { onMount } from 'svelte';
  import {
    STATUS_LABEL, STATUS_COLOUR,
    MECHANISM_LABEL, MECHANISM_COLOUR,
    CHANNEL_LABEL, REPORTER_TYPE_LABEL,
    DECISION_LABEL, TRIAGE_LABEL, TRIAGE_COLOUR,
  } from '#lib/apps/mor/utils/morHelpers.js';
  import { formatVerificationCode } from '#lib/utils/caseVerificationCode.js';
  import { GT_STATUS_LABELS, GT_STATUS_BADGE } from '#lib/apps/golden_thread/utils/gtLifecycle.js';
  import { fmtDate, fmtDateTime, today } from '#lib/utils/dates.js';
  import { requestDownload } from '#lib/utils/download.js';
  import { errMessage } from '#lib/utils/errors.js';

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
  let showBsrNotice   = false;
  let showBsrReport   = false;
  let showClose       = false;
  let triagePreset    = '';
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

  // ── Its workflow (migration 263) ────────────────────────────────────────
  onMount(() => { profilesStore.load(); });
  $: wf      = $morStore.workflow;
  $: wfItem  = c?.id ? ($morStore.items ?? []).find(i => i.subject_id === c.id) ?? null : null;
  $: me      = userId ?? null;
  $: nameById = Object.fromEntries(($profiles.list ?? []).map(p => [p.id, p.full_name ?? '']));
  let assigneeList = [];
  let assigneesFor = null;
  $: if (wf?.id && wf.id !== assigneesFor) {
    assigneesFor = wf.id;
    morStore.assignees().then((l) => { assigneeList = l; }, () => { assigneeList = []; });
  }

  /** A store result as the controls expect it: a throw carries the reason. */
  function orThrow(/** @type {any} */ r) {
    if (r?.success) return r;
    clearErr();                       // the controls show the reason beside the move
    throw new Error(r?.error || 'That could not be done.');
  }
  async function onWfMove(/** @type {any} */ m, /** @type {string} */ note) {
    orThrow(await morStore.moveCase(c.id, m.to_key, note));
  }
  async function onWfAssign(/** @type {string|null} */ uid) {
    orThrow(await morStore.assign(c.id, uid));
  }

  /** Moves that record something first: MOR's own form makes the move with it. */
  const handOff = (/** @type {any} */ m) => {
    if (m.from_key === 'in_triage' && TRIAGE_OUTCOME_FOR[m.to_key]) {
      triagePreset = TRIAGE_OUTCOME_FOR[m.to_key]; showTriage = true; return true;
    }
    if (m.from_key === 'in_assessment' && m.to_key === 'decision_pending') { showAssessment = true; return true; }
    if (m.from_key === 'bsr_notice' && m.to_key === 'bsr_report') { showBsrReport = true; return true; }
    if (m.from_key === 'remediated' && m.to_key === 'closed') { showClose = true; return true; }
    return false;
  };

  const APPROVALS = new Set(Object.values(APPROVAL_TARGET));
  /** MOR's own reasons a move cannot be made yet — the database refuses the same. */
  const extraRefusal = (/** @type {any} */ m) => {
    if (m.from_key === 'decision_pending' && APPROVALS.has(m.to_key)) {
      if (!c.decision_outcome) return 'Propose a decision first: a different person then approves it.';
      if (APPROVAL_TARGET[c.decision_outcome] !== m.to_key) return 'That is not the decision that was proposed.';
      if (me && me === c.decision_proposed_by) return 'You proposed this decision: a different person must approve it.';
    }
    if (m.from_key === 'decision_pending' && m.to_key === 'in_triage' && !c.decision_outcome) {
      return 'There is no proposed decision to reject.';
    }
    if (m.from_key === 'bsr_notice' && m.to_key === 'bsr_report' && !c.bsr_notice_ref) {
      return 'Record the BSR notice first.';
    }
    return null;
  };
  const confirmMove = (/** @type {any} */ m) => (m.from_key === 'decision_pending' && APPROVALS.has(m.to_key)
    ? { title: 'Approve the decision?', message: `Approve “${DECISION_LABEL[c.decision_outcome] ?? c.decision_outcome}”, proposed by ${c.decision_proposed_by_profile?.full_name ?? 'someone else'}. This is recorded against your name.` }
    : null);

  $: wfAudit = c ? { appId: 'mor', entityType: 'mor_case', entityId: c.id } : null;
  $: wfRecord = c ? {
    filenameStem: `MOR_${c.reference}_${today()}`,
    subject: () => ({
      title: `Mandatory occurrence report — ${c.reference}`,
      facts: [['Identified', fmtDateTime(c.identification_date)], ['Received', fmtDateTime(c.received_date)],
        ['Mechanism', MECHANISM_LABEL[c.mechanism] ?? c.mechanism ?? '—'],
        ['Triage', c.triage_outcome ? TRIAGE_LABEL[c.triage_outcome] ?? c.triage_outcome : '—'],
        ['Decision', c.decision_outcome ? DECISION_LABEL[c.decision_outcome] ?? c.decision_outcome : '—'],
        ['BSR notice', c.bsr_notice_ref || '—'], ['BSR report', c.bsr_report_ref || '—']],
      sections: [{ heading: 'Description', text: c.description }, { heading: 'Lessons learned', text: c.lessons_learned }],
    }),
  } : null;

  /** What happens next at each step, in a line. */
  const NEXT = {
    submitted:         'Acknowledge receipt to the reporter (same business day).',
    acknowledged:      'Triage Officer to assess whether this meets the MOR threshold (within 24 hours).',
    in_triage:         'Apply the two-part threshold test and record the triage outcome with the move it decides.',
    in_assessment:     'Technical advisor (fire/structural engineer) to provide a written assessment; record it when received.',
    decision_pending:  'AP to propose a decision (BSR / internal / no action); a different person (PAP/admin) then approves it.',
    bsr_notice:        'Submit the notice to the BSR portal and record its reference; the full report is due within 10 calendar days of identification.',
    bsr_report:        'Proceed with permanent remediation and respond to any BSR queries.',
    in_remediation:    'Carry out and evidence the permanent remediation.',
    awaiting_reporter: 'On hold — awaiting information from the reporter.',
    awaiting_bsr:      'On hold — awaiting the BSR’s response.',
    remediated:        'Close the case and capture lessons learned.',
    reopened:          'Begin triage again with the new information.',
  };

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
    // Captured before the awaits: `c` follows the store's selected case.
    const caseId = c.id;
    const fallbackName = `${c.reference}-case-record.docx`;
    exporting = true;
    exportError = '';
    try {
      await requestDownload(`/api/mor/${encodeURIComponent(caseId)}/case-report`, { filename: fallbackName });
    } catch (/** @type {any} */ err) {
      exportError = `Could not export: ${errMessage(err)}`;
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

<!-- ── Its workflow: step, who has it, the moves, history (migration 263) ── -->
<div class="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4" data-testid="mor-workflow">
  {#if !wf}
    <p class="text-sm text-amber-300">MOR’s workflow is not set up yet — an administrator opening MOR sets it up.</p>
  {:else if !wfItem}
    <p class="text-sm text-amber-300">This case is not in its workflow. Reload the page; if it stays like this, report it.</p>
  {:else}
    <WorkflowItemControls item={wfItem} workflow={wf} steps={$morStore.steps} moves={$morStore.moves}
      fields={$morStore.fields} reference={c.reference} {isAdmin} {canEdit} {me}
      assignees={assigneeList} {nameById}
      onMove={onWfMove} onAssign={onWfAssign}
      {handOff} {extraRefusal} {confirmMove} audit={wfAudit} record={wfRecord}
      finishedText={c.status === 'closed' ? 'The case is closed. An administrator can reopen it.' : 'Nothing further happens to this case.'}>

      {#if NEXT[c.status]}
        <p class="text-sm text-slate-400 mb-3"><strong class="text-slate-200">Next:</strong> {NEXT[c.status]}</p>
      {/if}

      {#if c.status === 'decision_pending'}
        {#if c.decision_outcome}
          <div class="bg-slate-700/50 rounded-lg p-3 mb-3">
            <p class="text-xs text-slate-500 mb-1">Decision proposed</p>
            <p class="text-sm font-semibold text-slate-200">{DECISION_LABEL[c.decision_outcome]}</p>
            <p class="text-sm text-slate-300 mt-1">{c.decision_rationale}</p>
            <p class="text-xs text-slate-500 mt-1">By: {c.decision_proposed_by_profile?.full_name ?? 'Unknown'}</p>
            {#if userId === c.decision_proposed_by}
              <p class="text-xs text-amber-300 mt-2">You proposed this decision, so a different person must approve it.</p>
            {/if}
          </div>
        {/if}
        {#if canEdit}
          <div class="mb-3">
            <Button variant="secondary" size="medium" on:click={() => showDecision = true}>
              {c.decision_outcome ? 'Revise Decision' : 'Propose Decision'}
            </Button>
          </div>
        {/if}
      {/if}

      {#if c.status === 'bsr_notice'}
        <div class="mb-3">
          {#if c.bsr_notice_ref}
            <p class="text-sm"><span class="text-emerald-400">✓ Notice submitted</span>
              <span class="text-slate-500 ml-2">Ref: {c.bsr_notice_ref}</span></p>
          {:else if canEdit}
            <Button variant="secondary" size="medium" on:click={() => showBsrNotice = true}>
              Record BSR Notice Submission
            </Button>
          {/if}
        </div>
      {/if}

      {#if c.bsr_report_ref && ['bsr_report', 'awaiting_bsr', 'in_remediation'].includes(c.status)}
        <p class="text-sm text-emerald-400 mb-3">✓ BSR report submitted — Ref: {c.bsr_report_ref}</p>
      {/if}

      {#if c.status === 'closed' || c.status === 'reclassified'}
        <div class="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3 mb-3">
          <p class="text-sm text-emerald-300 font-medium">
            {c.status === 'closed' ? '✓ Case closed' : '→ Case reclassified'}
            {#if c.closed_at}&nbsp;· {fmtDate(c.closed_at)}{/if}
          </p>
          {#if c.lessons_learned}
            <p class="text-sm text-slate-400 mt-1"><strong class="text-slate-300">Lessons learned:</strong> {c.lessons_learned}</p>
          {/if}
        </div>
      {/if}
    </WorkflowItemControls>
  {/if}
</div>

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
                    <span class="ml-1"><Button admin size="xs" title="Delete mitigation" on:click={() => requestDeleteMit(mit)}>✕</Button></span>
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
    {#if !showNote && canEdit}
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
  show={showTriage} {saving} {error} presetOutcome={triagePreset}
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

<CloseForm
  show={showClose} {saving} {error}
  on:submit={handleClose}
  on:close={() => { showClose = false; clearErr(); }}
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
