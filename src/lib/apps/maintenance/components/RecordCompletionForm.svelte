<!-- src/lib/apps/maintenance/components/RecordCompletionForm.svelte -->
<!-- Modal for closing a maintenance job: result, notes, documents. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { maintenanceStore }      from '../stores/maintenanceStore.js';
  import { frequencyLabel, today, addDays, toDateString } from '../utils/maintenanceHelpers.js';
  import DocumentUpload from './DocumentUpload.svelte';
  import Modal   from '$lib/components/common/Modal.svelte';
  import Button  from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';

  export let job;
  export let show = true;

  const dispatch = createEventDispatcher();

  $: store  = $maintenanceStore;
  $: regime = job?.regime_id ? store.regime.find(r => r.id === job.regime_id) : null;
  $: docs   = store.docsByJob[job?.id] ?? [];

  // -- Form state ------------------------------------------------------------
  let result         = 'pass';
  let completedDate  = today();
  let contractorName = job?.contractor_name ?? '';
  let engineerName   = job?.engineer_name  ?? '';
  let referenceNo    = job?.reference_number ?? '';
  let notes          = '';
  let createNext     = !!regime;   // default on if regime linked

  $: nextDate = regime && completedDate
    ? toDateString(addDays(new Date(completedDate + 'T00:00:00'), regime.frequency_days))
    : null;

  const RESULTS = [
    { value: 'pass',    label: '✓  Pass',    cls: 'result-pass'    },
    { value: 'fail',    label: '✗  Fail',    cls: 'result-fail'    },
    { value: 'partial', label: '~  Partial', cls: 'result-partial' },
    { value: 'n_a',     label: '—  N/A',     cls: 'result-na'      },
  ];

  let saving = false;
  let error  = null;

  async function handleSave() {
    if (!completedDate) { error = 'Completed date is required'; return; }
    saving = true; error = null;
    try {
      await maintenanceStore.completeJob(job.id, {
        result,
        completedDate,
        completionNotes:  notes.trim()         || null,
        contractorName:   contractorName.trim() || null,
        engineerName:     engineerName.trim()   || null,
        referenceNumber:  referenceNo.trim()    || null,
        createNextJob:    createNext,
      });
      dispatch('completed');
      dispatch('close');
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  // Load documents when modal opens
  import { onMount } from 'svelte';
  onMount(async () => {
    if (job?.id && !store.docsByJob[job.id]) {
      await maintenanceStore.loadJobDocuments(job.id);
    }
  });
</script>

<Modal {show} size="large" on:close={() => dispatch('close')}>
  <h3 slot="header" class="text-lg font-bold">
    Record Completion
    <span class="text-slate-400 font-normal text-sm ml-2">— {job?.title}</span>
  </h3>

  <div class="space-y-6">

    <!-- Result -->
    <div>
      <p class="text-xs text-slate-400 mb-2">Result</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {#each RESULTS as r}
          <button
            class="result-btn {r.cls}"
            class:result-active={result === r.value}
            on:click={() => result = r.value}
          >
            {r.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Completed date -->
    <div>
      <p class="text-xs text-slate-400 mb-1.5">Date completed</p>
      <input type="date" bind:value={completedDate}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white
               focus:outline-none focus:border-purple-500 w-full sm:w-48" />
    </div>

    <!-- Contractor / engineer -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FormInput label="Contractor" bind:value={contractorName} placeholder="Company name" />
      <FormInput label="Engineer"   bind:value={engineerName}   placeholder="Engineer name" />
    </div>

    <FormInput label="Reference / certificate number" bind:value={referenceNo}
      placeholder="Contractor job ref or cert number" />

    <!-- Notes -->
    <FormTextarea label="Completion notes" bind:value={notes} rows={3}
      placeholder="Work carried out, observations, follow-up needed…" />

    <!-- Documents -->
    <div>
      <p class="text-sm font-semibold text-slate-300 mb-3">Documents</p>
      <DocumentUpload jobId={job?.id} {docs}
        on:uploaded={() => maintenanceStore.loadJobDocuments(job.id)}
        on:deleted={() => maintenanceStore.loadJobDocuments(job.id)} />
    </div>

    <!-- Next recurrence -->
    {#if regime}
      <div class="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
        <div class="flex items-start gap-3">
          <Checkbox
            checked={createNext}
            on:change={e => createNext = e.detail.checked ?? e.target?.checked ?? createNext}
          />
          <div>
            <p class="text-sm text-slate-200 font-medium">
              Auto-schedule next recurrence
            </p>
            <p class="text-xs text-slate-400 mt-0.5">
              Regime: <span class="text-slate-300">{regime.task_name}</span>
              · {frequencyLabel(regime.frequency_days)}
              {#if nextDate}
                · Next due: <span class="text-purple-300">{nextDate}</span>
              {/if}
            </p>
          </div>
        </div>
      </div>
    {/if}

    {#if error}
      <p class="text-sm text-red-400">⚠ {error}</p>
    {/if}

  </div>

  <div slot="footer" class="flex justify-end gap-3">
    <Button variant="secondary" on:click={() => dispatch('close')} disabled={saving}>
      Cancel
    </Button>
    <Button variant="primary" on:click={handleSave} disabled={saving}>
      {saving ? 'Saving…' : 'Mark complete'}
    </Button>
  </div>
</Modal>

<style>
  .result-btn {
    padding: 0.5rem 0.5rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600;
    border: 2px solid transparent; cursor: pointer; transition: all 0.12s; text-align: center;
  }
  .result-pass    { background: rgb(20 83 45 / 0.3);  color: #86efac; border-color: rgb(34 197 94 / 0.2); }
  .result-fail    { background: rgb(127 29 29 / 0.3); color: #fca5a5; border-color: rgb(239 68 68 / 0.2); }
  .result-partial { background: rgb(120 53 15 / 0.3); color: #fcd34d; border-color: rgb(245 158 11 / 0.2); }
  .result-na      { background: rgb(30 41 59 / 0.4);  color: #94a3b8; border-color: rgb(71 85 105 / 0.4); }
  .result-active.result-pass    { border-color: #22c55e; background: rgb(20 83 45 / 0.6); }
  .result-active.result-fail    { border-color: #ef4444; background: rgb(127 29 29 / 0.6); }
  .result-active.result-partial { border-color: #f59e0b; background: rgb(120 53 15 / 0.6); }
  .result-active.result-na      { border-color: #64748b; background: rgb(30 41 59 / 0.7); }
</style>
