<!-- src/lib/apps/maintenance/components/RecordCompletionForm.svelte -->
<!-- Modal for closing a maintenance job: result, per-component, notes, documents, recurrence. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { maintenanceStore }      from '../stores/maintenanceStore.js';
  import { frequencyLabel, today, addDays, toDateString } from '../utils/maintenanceHelpers.js';
  import DocumentUpload from './DocumentUpload.svelte';
  import Modal         from '$lib/components/common/Modal.svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import FormInput     from '$lib/components/common/FormInput.svelte';
  import FormTextarea  from '$lib/components/common/FormTextarea.svelte';
  import Checkbox      from '$lib/components/common/Checkbox.svelte';

  export let job;
  export let show = true;

  const dispatch = createEventDispatcher();

  $: store  = $maintenanceStore;
  $: regime = job?.regime_id ? store.regime.find(r => r.id === job.regime_id) : null;
  $: docs   = store.docsByJob[job?.id] ?? [];

  // -- Form state ---------------------------------------------------------------
  let result         = 'pass';
  let completedDate  = today();
  let contractorName = job?.contractor_name ?? '';
  let engineerName   = job?.engineer_name  ?? '';
  let referenceNo    = job?.reference_number ?? '';
  let notes          = '';

  // Recurrence
  let createNext     = !!regime;
  let useHardDate    = false;
  let hardDate       = '';

  $: calcNextDate = regime && completedDate
    ? toDateString(addDays(new Date(completedDate + 'T00:00:00'), regime.frequency_days))
    : null;
  $: nextDateDisplay = useHardDate ? (hardDate || '—') : (calcNextDate ?? '—');

  // Per-component results (for system/type scope jobs)
  $: showComponents = job?.scope_type === 'system' || job?.scope_type === 'type';
  let scopeComponents = [];   // [{id, asset_id, name, label, type_code}]
  let componentResults = {};  // { [component_id]: { result, notes } }
  let loadingComps    = false;

  const RESULTS = [
    { value: 'pass',    label: '✓  Pass',    cls: 'result-pass'    },
    { value: 'fail',    label: '✗  Fail',    cls: 'result-fail'    },
    { value: 'partial', label: '~  Partial', cls: 'result-partial' },
    { value: 'n_a',     label: '—  N/A',     cls: 'result-na'      },
  ];

  const COMP_RESULTS = ['pass', 'fail', 'n_a'];

  let saving = false;
  let error  = null;

  function setAllComponentsPass() {
    const updated = {};
    for (const c of scopeComponents) {
      updated[c.id] = { result: 'pass', notes: componentResults[c.id]?.notes ?? '' };
    }
    componentResults = updated;
  }

  async function handleSave() {
    if (!completedDate) { error = 'Completed date is required'; return; }
    if (useHardDate && !hardDate) { error = 'Please pick a specific next-due date'; return; }
    saving = true; error = null;
    try {
      // Build per-component results array
      const components = scopeComponents
        .map(c => ({
          component_id: c.id,
          result:       componentResults[c.id]?.result ?? null,
          notes:        componentResults[c.id]?.notes  ?? null,
        }))
        .filter(c => c.result);

      await maintenanceStore.completeJob(job.id, {
        result,
        completedDate,
        completionNotes:  notes.trim()         || null,
        contractorName:   contractorName.trim() || null,
        engineerName:     engineerName.trim()   || null,
        referenceNumber:  referenceNo.trim()    || null,
        createNextJob:    createNext,
        nextJobDate:      (createNext && useHardDate && hardDate) ? hardDate : null,
        components,
      });
      dispatch('completed');
      dispatch('close');
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  onMount(async () => {
    // Load existing documents
    if (job?.id && !store.docsByJob[job.id]) {
      await maintenanceStore.loadJobDocuments(job.id);
    }
    // Load scope components for per-component results
    if (showComponents && job?.scope_id) {
      loadingComps = true;
      try {
        scopeComponents = await maintenanceStore.loadScopeComponents(job.scope_type, job.scope_id);
        // Seed componentResults with any already-saved results
        const existing = store.jobComponents[job.id];
        if (existing) {
          for (const c of existing) {
            componentResults[c.component_id] = { result: c.result, notes: c.notes ?? '' };
          }
        }
      } finally {
        loadingComps = false;
      }
    }
  });
</script>

<Modal {show} size="large" on:close={() => dispatch('close')}>
  <h3 slot="header" class="text-lg font-bold">
    Record Completion
    <span class="text-slate-400 font-normal text-sm ml-2">— {job?.title}</span>
  </h3>

  <div class="space-y-6">

    <!-- Overall result -->
    <div>
      <p class="text-xs text-slate-400 mb-2">Overall result</p>
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

    <!-- Completion notes -->
    <FormTextarea label="Completion notes" bind:value={notes} rows={3}
      placeholder="Work carried out, observations, follow-up needed…" />

    <!-- Per-component results (system / type scope only) -->
    {#if showComponents}
      <div class="rounded-lg border border-slate-700 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 bg-slate-800/60 border-b border-slate-700">
          <p class="text-sm font-semibold text-slate-300">
            Per-component results
            {#if scopeComponents.length > 0}
              <span class="text-slate-500 font-normal">({scopeComponents.length})</span>
            {/if}
          </p>
          {#if scopeComponents.length > 0}
            <button class="text-xs text-green-400 hover:text-green-300 transition-colors"
              on:click={setAllComponentsPass}>
              Set all Pass
            </button>
          {/if}
        </div>

        {#if loadingComps}
          <p class="px-4 py-3 text-xs text-slate-500 italic">Loading components…</p>
        {:else if scopeComponents.length === 0}
          <p class="px-4 py-3 text-xs text-slate-500 italic">
            No components found in this scope.
          </p>
        {:else}
          <div class="divide-y divide-slate-700/40 max-h-64 overflow-y-auto">
            {#each scopeComponents as c (c.id)}
              {@const cr = componentResults[c.id] ?? { result: '', notes: '' }}
              <div class="flex items-center gap-3 px-4 py-2.5">
                <div class="flex-1 min-w-0">
                  <span class="text-xs font-mono text-slate-400">{c.asset_id ?? '—'}</span>
                  <span class="text-sm text-slate-200 ml-2">{c.label || c.name || '—'}</span>
                  {#if c.type_code}
                    <span class="text-xs text-slate-600 ml-1">· {c.type_code}</span>
                  {/if}
                </div>
                <!-- Result selector -->
                <select
                  value={cr.result}
                  on:change={e => componentResults = {
                    ...componentResults,
                    [c.id]: { ...cr, result: e.target.value }
                  }}
                  class="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white
                         focus:outline-none focus:border-purple-500 flex-shrink-0 w-24"
                >
                  <option value="">—</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="n_a">N/A</option>
                </select>
                <!-- Short notes -->
                <input type="text"
                  value={cr.notes}
                  on:input={e => componentResults = {
                    ...componentResults,
                    [c.id]: { ...cr, notes: e.target.value }
                  }}
                  placeholder="notes"
                  class="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white
                         placeholder:text-slate-600 focus:outline-none focus:border-purple-500
                         flex-shrink-0 w-32 hidden sm:block"
                />
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Documents -->
    <div>
      <p class="text-sm font-semibold text-slate-300 mb-3">Documents</p>
      <DocumentUpload jobId={job?.id} {docs}
        on:uploaded={() => maintenanceStore.loadJobDocuments(job.id)}
        on:deleted={() => maintenanceStore.loadJobDocuments(job.id)} />
    </div>

    <!-- Next recurrence -->
    {#if regime}
      <div class="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
        <div class="flex items-start gap-3">
          <Checkbox
            checked={createNext}
            on:change={e => createNext = e.detail.checked ?? e.target?.checked ?? createNext}
          />
          <div class="flex-1">
            <p class="text-sm text-slate-200 font-medium">Auto-schedule next recurrence</p>
            <p class="text-xs text-slate-400 mt-0.5">
              Regime: <span class="text-slate-300">{regime.task_name}</span>
              · {frequencyLabel(regime.frequency_days)}
            </p>
          </div>
        </div>

        {#if createNext}
          <!-- Date mode toggle -->
          <div class="ml-7 space-y-2">
            <div class="flex gap-4">
              <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input type="radio" bind:group={useHardDate} value={false}
                  class="accent-purple-500" />
                Calculated from completion
                {#if !useHardDate && calcNextDate}
                  <span class="text-purple-300 font-mono">{calcNextDate}</span>
                {/if}
              </label>
              <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input type="radio" bind:group={useHardDate} value={true}
                  class="accent-purple-500" />
                Fixed date
              </label>
            </div>
            {#if useHardDate}
              <input type="date" bind:value={hardDate}
                class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                       focus:outline-none focus:border-purple-500 w-48" />
            {:else}
              <p class="text-xs text-slate-500">
                Next due: <span class="text-purple-300">{calcNextDate ?? '—'}</span>
              </p>
            {/if}
          </div>
        {/if}
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
