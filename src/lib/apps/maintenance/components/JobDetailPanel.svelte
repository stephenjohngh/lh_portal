<!-- src/lib/apps/maintenance/components/JobDetailPanel.svelte -->
<!-- Modal showing full job detail, documents, component results, history chain and actions.
     Its stages are the shared workflow controls (migration 260): where the job
     is, its deadline, who it is with, the moves (Book, Mark attended, Cancel,
     Re-open…), the history and the printable record. A move into a finished
     step is handed to Record completion, which records the result with it. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { maintenanceStore }  from '../stores/maintenanceStore.js';
  import { permissions }       from '#lib/stores/permissions.js';
  import { normalisePhotoUrl } from '#lib/utils/driveUtils.js';
  import {
    ragConfig, resultConfig, scopeTypeLabel, docTypeLabel,
    docTypeIcon, fmtBytes, frequencyLabel, daysRelative, expiryRag,
  } from '../utils/maintenanceHelpers.js';
  import { fmtDate, fmtDateTime, fmtToday, today } from '#lib/utils/dates.js';
  import { requestDownload } from '#lib/utils/download.js';
  import DocumentUpload    from './DocumentUpload.svelte';
  import JobForm           from './JobForm.svelte';
  import RecordCompletionForm from './RecordCompletionForm.svelte';
  import Modal   from '#lib/components/common/Modal.svelte';
  import Button  from '#lib/components/common/Button.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import { errMessage } from '#lib/utils/errors.js';
  import WorkflowItemControls from '#lib/workflow/WorkflowItemControls.svelte';
  import { auth } from '#lib/stores/auth.js';
  import { profiles, profilesStore } from '#lib/stores/profiles.js';

  export let job;
  export let show = true;

  const dispatch = createEventDispatcher();

  $: store         = $maintenanceStore;
  $: docs          = store.docsByJob[job?.id] ?? [];
  // The obligation this job discharges, from the shared library.
  $: obligation    = job?.obligation_id ? store.obligations.find(o => o.id === job.obligation_id) : null;
  $: rag           = ragConfig(job?.rag ?? 'scheduled');
  $: res           = resultConfig(job?.result);
  $: canEdit       = $permissions.isAdmin;
  // Contractors can complete their own assigned jobs
  $: canComplete   = canEdit || store.isContractor;
  // …and move them through their stages, as the table lets them write them.
  $: me            = $auth.user?.id ?? null;
  $: canMove       = canEdit || (store.isContractor && !!me && job?.contractor_id === me);

  // The job's place in its workflow (migration 260).
  $: wfItem   = job?.id ? (store.wfItems ?? []).find(i => i.subject_id === job.id) ?? null : null;
  $: kindOf   = (/** @type {string} */ key) => (store.steps ?? []).find(st => st.key === key)?.kind ?? null;
  $: nameById = Object.fromEntries(($profiles.list ?? []).map(p => [p.id, p.full_name ?? '']));
  /** A move into a finished — accepted step is Record completion's: it needs the result. */
  let completeTo = null;
  const handOff = (/** @type {any} */ m) => {
    if (kindOf(m.to_key) !== 'done') return false;
    completeTo = m.to_key;
    showComplete = true;
    return true;
  };
  async function onWfMove(/** @type {any} */ m, /** @type {string} */ note) {
    // The panel stays open: the controls say what happened and offer the next move.
    await maintenanceStore.moveJob(job.id, m.to_key, note);
  }
  $: wfAudit  = job ? { appId: 'maintenance', entityType: 'maintenance_job', entityId: job.id } : null;
  $: wfRecord = job ? {
    filenameStem: `Maintenance_job_${(job.title ?? 'job').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)}_${today()}`,
    subject: () => ({
      title: `Maintenance job — ${job.title}`,
      facts: [['Covers', `${scopeTypeLabel(job.scope_type)} ${job.scope_label ?? ''}`.trim()],
        ['Scheduled', fmtDate(job.scheduled_date)], ['Hard expiry', job.hard_expiry_date ? fmtDate(job.hard_expiry_date) : '—'],
        ['Contractor', job.contractor_name || '—'], ['Completed', job.completed_date ? fmtDate(job.completed_date) : '—'],
        ['Result', res?.label ?? '—'], ['Reference', job.reference_number || '—']],
      sections: [{ heading: 'Description', text: job.description }, { heading: 'Completion notes', text: job.completion_notes }],
    }),
  } : null;

  // History chain
  $: prevJob = job?.id ? store.jobs.find(j => j.next_job_id === job.id) : null;
  $: nextJob = job?.next_job_id ? store.jobs.find(j => j.id === job.next_job_id) : null;

  // Per-component results
  $: jobComponents = store.jobComponents[job?.id] ?? null;
  $: showComponents = job?.scope_type === 'system' || job?.scope_type === 'type';

  let showEdit       = false;
  let showComplete   = false;
  let showDeleteConf = false;
  let downloading    = false;
  let downloadError  = '';
  let deleteError    = '';

  onMount(async () => {
    profilesStore.load();
    if (job?.id) {
      const promises = [];
      if (!store.docsByJob[job.id]) {
        promises.push(maintenanceStore.loadJobDocuments(job.id));
      }
      if (showComponents && jobComponents === null) {
        promises.push(maintenanceStore.loadJobComponents(job.id));
      }
      if (promises.length) await Promise.all(promises);
    }
  });


  function expiryClass(dateStr) {
    const r = expiryRag(dateStr);
    if (r === 'expired')  return 'text-red-400';
    if (r === 'expiring') return 'text-amber-400';
    return 'text-slate-400';
  }

  function compResultBadge(result) {
    if (result === 'pass') return 'text-green-400';
    if (result === 'fail') return 'text-red-400';
    if (result === 'n_a')  return 'text-slate-500';
    return 'text-slate-500';
  }

  async function handleDelete() {
    const jobId = job.id;               // capture before the await
    showDeleteConf = false;
    deleteError = '';
    try {
      // Its files go first; if one cannot be deleted the job is kept and says so.
      await maintenanceStore.deleteJob(jobId);
    } catch (/** @type {any} */ err) {
      deleteError = errMessage(err);
      return;
    }
    dispatch('changed');
    dispatch('close');
  }

  async function downloadCertificate() {
    downloading = true;
    try {
      const payload = {
        job,
        jobComponents: jobComponents ?? [],
        docs,
        obligation: obligation ?? null,
        generatedAt: fmtToday(),
      };
      await requestDownload('/api/maintenance/generate-certificate', {
        body: payload,
        filename: `Maintenance_Certificate_${today()}.docx`,
      });
    } catch (/** @type {any} */ err) {
      downloadError = 'Download failed: ' + err.message;
    } finally {
      downloading = false;
    }
  }
</script>

{#if job}
  <Modal {show} size="large" on:close={() => dispatch('close')}>

    <!-- Header -->
    <div slot="header" class="flex items-start gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold {rag.badge}">
            {rag.label}
          </span>
          {#if res}
            <span class="px-2 py-0.5 rounded-full text-xs font-semibold {res.badge}">
              {res.label}
            </span>
          {/if}
        </div>
        <h3 class="text-lg font-bold mt-1 leading-tight">{job.title}</h3>
      </div>
    </div>

    <div class="space-y-6">

      {#if downloadError}
        <ErrorDisplay message={downloadError} onDismiss={() => downloadError = ''} />
      {/if}
      {#if deleteError}
        <ErrorDisplay message={deleteError} onDismiss={() => deleteError = ''} />
      {/if}

      <!-- Its stage, deadline, who it is with and the moves (migration 260). -->
      {#if store.workflow}
        <div class="p-3 rounded border border-slate-700 bg-slate-800/40" data-testid="job-workflow">
          {#if wfItem}
            <WorkflowItemControls item={wfItem} workflow={store.workflow} steps={store.steps} moves={store.moves}
              fields={store.fields} reference={job.title} isAdmin={canEdit} canEdit={canMove} {me}
              assignees={store.assignees} {nameById}
              onMove={onWfMove} onAssign={(uid) => maintenanceStore.assignJob(wfItem.id, uid)}
              {handOff} audit={wfAudit} record={wfRecord}
              finishedText="Nothing further happens to this job unless it is re-opened." />
          {:else}
            <p class="text-xs text-amber-300">This job is not in its workflow. Reload the page; if it stays like this, report it.</p>
          {/if}
        </div>
      {/if}

      <!-- Key details grid -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
        <div>
          <p class="text-xs text-slate-500 mb-0.5">Covers</p>
          <p class="text-slate-200">
            <span class="text-xs text-slate-400 mr-1">{scopeTypeLabel(job.scope_type)}</span>
            {job.scope_label ?? '—'}
          </p>
        </div>
        <div>
          <p class="text-xs text-slate-500 mb-0.5">Scheduled date</p>
          <p class="text-slate-200">{fmtDate(job.scheduled_date)}</p>
          {#if job.rag === 'overdue' || job.rag === 'due_soon'}
            <p class="text-xs mt-0.5 {job.rag === 'overdue' ? 'text-red-400' : 'text-amber-400'}">
              {daysRelative(job.scheduled_date)}
            </p>
          {/if}
        </div>
        {#if job.completed_date}
          <div>
            <p class="text-xs text-slate-500 mb-0.5">Completed</p>
            <p class="text-slate-200">{fmtDate(job.completed_date)}</p>
          </div>
        {/if}
        {#if job.contractor_name}
          <div>
            <p class="text-xs text-slate-500 mb-0.5">Contractor</p>
            <p class="text-slate-200">{job.contractor_name}</p>
          </div>
        {/if}
        {#if job.engineer_name}
          <div>
            <p class="text-xs text-slate-500 mb-0.5">Engineer</p>
            <p class="text-slate-200">{job.engineer_name}</p>
          </div>
        {/if}
        {#if job.reference_number}
          <div>
            <p class="text-xs text-slate-500 mb-0.5">Reference</p>
            <p class="text-slate-200 font-mono text-xs">{job.reference_number}</p>
          </div>
        {/if}
        {#if job.hard_expiry_date}
          <div>
            <p class="text-xs text-slate-500 mb-0.5">Hard expiry</p>
            <p class="text-amber-300 font-medium">{fmtDate(job.hard_expiry_date)}</p>
          </div>
        {/if}
      </div>

      <!-- Description / notes -->
      {#if job.description}
        <div>
          <p class="text-xs text-slate-500 mb-1">Description</p>
          <p class="text-sm text-slate-300">{job.description}</p>
        </div>
      {/if}
      {#if job.completion_notes}
        <div>
          <p class="text-xs text-slate-500 mb-1">Completion notes</p>
          <p class="text-sm text-slate-300 whitespace-pre-line">{job.completion_notes}</p>
        </div>
      {/if}

      <!-- Linked obligation -->
      {#if obligation}
        <div class="rounded-lg bg-slate-800/40 border border-slate-700 p-3 text-sm">
          <p class="text-xs text-slate-500 mb-1">Planned obligation</p>
          <p class="text-slate-200">{obligation.name}</p>
          <p class="text-xs text-slate-400 mt-0.5">{frequencyLabel(obligation.frequency_days)}</p>
        </div>
      {/if}

      <!-- History chain -->
      {#if prevJob || nextJob}
        <div>
          <p class="text-xs text-slate-500 mb-2">History chain</p>
          <div class="flex items-center gap-2 flex-wrap">
            {#if prevJob}
              <div class="chain-node chain-prev">
                <span class="text-xs text-slate-500">Prev</span>
                <span class="text-xs text-slate-300 mt-0.5">{fmtDate(prevJob.scheduled_date)}</span>
                {#if prevJob.result}
                  {@const prevRes = resultConfig(prevJob.result)}
                  {#if prevRes}
                    <span class="text-xs mt-0.5 {prevRes.badge.includes('green') ? 'text-green-400' : prevRes.badge.includes('red') ? 'text-red-400' : 'text-amber-400'}">{prevRes.label}</span>
                  {/if}
                {/if}
              </div>
              <span class="text-slate-600 text-lg">→</span>
            {/if}

            <div class="chain-node chain-current">
              <span class="text-xs text-slate-400">This job</span>
              <span class="text-xs text-slate-200 mt-0.5">{fmtDate(job.scheduled_date)}</span>
            </div>

            {#if nextJob}
              <span class="text-slate-600 text-lg">→</span>
              <div class="chain-node chain-next">
                <span class="text-xs text-slate-500">Next</span>
                <span class="text-xs text-slate-300 mt-0.5">{fmtDate(nextJob.scheduled_date)}</span>
                <span class="text-xs mt-0.5 {nextJob.rag === 'overdue' ? 'text-red-400' : nextJob.rag === 'due_soon' ? 'text-amber-400' : 'text-green-400'}">{ragConfig(nextJob.rag).label}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Per-component results -->
      {#if showComponents && jobComponents !== null && jobComponents.length > 0}
        <div>
          <p class="text-xs text-slate-500 mb-2">
            Per-component results
            <span class="text-slate-600">({jobComponents.length})</span>
          </p>
          <div class="rounded-lg border border-slate-700 divide-y divide-slate-700/40 overflow-hidden">
            {#each jobComponents as jc (jc.id)}
              <div class="flex items-center gap-3 px-4 py-2.5">
                <span class="text-xs font-mono text-slate-400 w-16 flex-shrink-0">
                  {jc.component?.asset_id ?? '—'}
                </span>
                <span class="text-sm text-slate-300 flex-1 min-w-0 truncate">
                  {jc.component?.label || jc.component?.name || '—'}
                </span>
                <span class="text-xs font-semibold flex-shrink-0 {compResultBadge(jc.result)}">
                  {jc.result === 'pass' ? 'Pass' : jc.result === 'fail' ? 'Fail' : jc.result === 'n_a' ? 'N/A' : '—'}
                </span>
                {#if jc.notes}
                  <span class="text-xs text-slate-500 flex-shrink-0 truncate max-w-32">{jc.notes}</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Documents -->
      <div>
        <p class="text-sm font-semibold text-slate-300 mb-3">
          Documents
          {#if docs.length > 0}<span class="text-slate-500 font-normal">({docs.length})</span>{/if}
        </p>
        {#if canEdit}
          <DocumentUpload jobId={job.id} {docs}
            on:uploaded={() => maintenanceStore.loadJobDocuments(job.id)}
            on:deleted={() => maintenanceStore.loadJobDocuments(job.id)} />
        {:else}
          {#if docs.length > 0}
            <div class="divide-y divide-slate-700/50">
              {#each docs as doc (doc.id)}
                <div class="flex items-center gap-3 py-2">
                  <span class="text-base">{docTypeIcon(doc.doc_type)}</span>
                  <div class="flex-1 min-w-0">
                    <a href={normalisePhotoUrl(doc.storage_path)} target="_blank" rel="noreferrer"
                       class="text-sm text-purple-300 hover:text-purple-200 truncate block">
                      {doc.filename}
                    </a>
                    <div class="text-xs text-slate-500 flex gap-2 mt-0.5">
                      <span>{docTypeLabel(doc.doc_type)}</span>
                      {#if doc.file_size}<span>· {fmtBytes(doc.file_size)}</span>{/if}
                      {#if doc.expiry_date}
                        <span class={expiryClass(doc.expiry_date)}>· Expires {fmtDate(doc.expiry_date)}</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-slate-600 italic">No documents attached.</p>
          {/if}
        {/if}
      </div>

    </div>

    <!-- Footer actions -->
    <div slot="footer" class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex gap-2 flex-wrap">
        {#if canEdit}
          <Button variant="danger" size="small"
            on:click={() => showDeleteConf = true}>
            Delete
          </Button>
        {/if}
      </div>
      <div class="flex gap-2 flex-wrap">
        {#if job.status === 'completed'}
          <Button variant="secondary" size="small"
            on:click={downloadCertificate}
            disabled={downloading}>
            {downloading ? 'Generating…' : '⬇ Certificate'}
          </Button>
        {/if}
        {#if canEdit && job.status !== 'completed' && job.status !== 'cancelled'}
          <Button variant="secondary" size="small" on:click={() => showEdit = true}>
            Edit
          </Button>
        {/if}
        {#if canComplete && job.status !== 'completed' && job.status !== 'cancelled' && !store.workflow}
          <!-- Before the workflow is set up; after, Record completion is one of its moves. -->
          <Button variant="primary" size="small" on:click={() => { completeTo = null; showComplete = true; }}>
            ✓ Mark complete
          </Button>
        {/if}
        <Button variant="secondary" size="small" on:click={() => dispatch('close')}>
          Close
        </Button>
      </div>
    </div>

  </Modal>
{/if}

<!-- Sub-modals -->
{#if showEdit}
  <JobForm job={job} on:close={() => showEdit = false}
    on:saved={() => { showEdit = false; dispatch('changed'); dispatch('close'); }} />
{/if}

{#if showComplete}
  <RecordCompletionForm job={job} toStep={completeTo} on:close={() => showComplete = false}
    on:completed={() => { showComplete = false; dispatch('changed'); dispatch('close'); }} />
{/if}

<!-- ConfirmDialog shows only when given `show` (2026-10-20: it was not, so a job could never be deleted). -->
<ConfirmDialog
  show={showDeleteConf}
  title="Delete job?"
  message="Permanently delete '{job?.title}' and all its documents. This cannot be undone."
  confirmText="Delete"
  danger={true}
  on:confirm={handleDelete}
  on:cancel={() => showDeleteConf = false}
/>

<style>
  .chain-node {
    display: flex; flex-direction: column; align-items: center;
    padding: 0.375rem 0.75rem; border-radius: 8px; border: 1px solid;
    min-width: 80px; text-align: center;
  }
  .chain-prev    { border-color: rgb(71 85 105 / 0.5); background: rgb(30 41 59 / 0.3); }
  .chain-current { border-color: rgb(var(--lh-accent-rgb) / 0.5); background: rgb(var(--lh-accent-rgb) / 0.08); }
  .chain-next    { border-color: rgb(71 85 105 / 0.5); background: rgb(30 41 59 / 0.3); }
</style>
