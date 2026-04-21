<!-- src/lib/apps/maintenance/components/JobDetailPanel.svelte -->
<!-- Modal showing full job detail, documents and action buttons. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { maintenanceStore }  from '../stores/maintenanceStore.js';
  import { permissions }       from '$lib/stores/permissions';
  import {
    ragConfig, resultConfig, scopeTypeLabel, docTypeLabel,
    docTypeIcon, fmtBytes, frequencyLabel, daysRelative, expiryRag,
  } from '../utils/maintenanceHelpers.js';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates.js';
  import DocumentUpload    from './DocumentUpload.svelte';
  import JobForm           from './JobForm.svelte';
  import RecordCompletionForm from './RecordCompletionForm.svelte';
  import Modal   from '$lib/components/common/Modal.svelte';
  import Button  from '$lib/components/common/Button.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let job;
  export let show = true;

  const dispatch = createEventDispatcher();

  $: store  = $maintenanceStore;
  $: docs   = store.docsByJob[job?.id] ?? [];
  $: regime = job?.regime_id ? store.regime.find(r => r.id === job.regime_id) : null;
  $: rag    = ragConfig(job?.rag ?? 'scheduled');
  $: res    = resultConfig(job?.result);
  $: canEdit = $permissions.isAdmin;

  let showEdit       = false;
  let showComplete   = false;
  let showCancelConf = false;
  let showDeleteConf = false;

  onMount(async () => {
    if (job?.id && !store.docsByJob[job.id]) {
      await maintenanceStore.loadJobDocuments(job.id);
    }
  });

  function publicUrl(storagePath) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    return `${url}/storage/v1/object/public/maintenance-docs/${storagePath}`;
  }

  function expiryClass(dateStr) {
    const r = expiryRag(dateStr);
    if (r === 'expired')  return 'text-red-400';
    if (r === 'expiring') return 'text-amber-400';
    return 'text-slate-400';
  }

  async function handleCancel() {
    await maintenanceStore.cancelJob(job.id);
    showCancelConf = false;
    dispatch('changed');
    dispatch('close');
  }

  async function handleDelete() {
    await maintenanceStore.deleteJob(job.id);
    showDeleteConf = false;
    dispatch('changed');
    dispatch('close');
  }

  async function handleReopen() {
    await maintenanceStore.reopenJob(job.id);
    dispatch('changed');
    dispatch('close');
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

      <!-- Key details grid -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
        <div>
          <p class="text-xs text-slate-500 mb-0.5">Scope</p>
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

      <!-- Regime link -->
      {#if regime}
        <div class="rounded-lg bg-slate-800/40 border border-slate-700 p-3 text-sm">
          <p class="text-xs text-slate-500 mb-1">Regime task</p>
          <p class="text-slate-200">{regime.task_name}</p>
          <p class="text-xs text-slate-400 mt-0.5">{frequencyLabel(regime.frequency_days)}</p>
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
          <!-- Read-only document list -->
          {#if docs.length > 0}
            <div class="divide-y divide-slate-700/50">
              {#each docs as doc (doc.id)}
                <div class="flex items-center gap-3 py-2">
                  <span class="text-base">{docTypeIcon(doc.doc_type)}</span>
                  <div class="flex-1 min-w-0">
                    <a href={publicUrl(doc.storage_path)} target="_blank" rel="noreferrer"
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
    <div slot="footer" class="flex items-center justify-between gap-3">
      <div class="flex gap-2">
        {#if canEdit && job.status !== 'cancelled'}
          {#if job.status !== 'completed'}
            <Button variant="danger" size="small"
              on:click={() => showCancelConf = true}>
              Cancel job
            </Button>
          {:else}
            <Button variant="secondary" size="small" on:click={handleReopen}>
              Re-open
            </Button>
          {/if}
          <Button variant="danger" size="small"
            on:click={() => showDeleteConf = true}>
            Delete
          </Button>
        {/if}
      </div>
      <div class="flex gap-2">
        {#if canEdit && job.status !== 'completed' && job.status !== 'cancelled'}
          <Button variant="secondary" size="small" on:click={() => showEdit = true}>
            Edit
          </Button>
          <Button variant="primary" size="small" on:click={() => showComplete = true}>
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
  <RecordCompletionForm job={job} on:close={() => showComplete = false}
    on:completed={() => { showComplete = false; dispatch('changed'); dispatch('close'); }} />
{/if}

{#if showCancelConf}
  <ConfirmDialog
    title="Cancel job?"
    message="Mark '{job?.title}' as cancelled. You can re-open it later."
    confirmLabel="Cancel job"
    variant="danger"
    on:confirm={handleCancel}
    on:cancel={() => showCancelConf = false}
  />
{/if}

{#if showDeleteConf}
  <ConfirmDialog
    title="Delete job?"
    message="Permanently delete '{job?.title}' and all its documents. This cannot be undone."
    confirmLabel="Delete"
    variant="danger"
    on:confirm={handleDelete}
    on:cancel={() => showDeleteConf = false}
  />
{/if}
