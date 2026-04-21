<!-- src/lib/apps/maintenance/components/JobForm.svelte -->
<!-- Create or edit a maintenance job. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { maintenanceStore }      from '../stores/maintenanceStore.js';
  import { frequencyLabel, scopeTypeLabel, today } from '../utils/maintenanceHelpers.js';
  import Modal       from '$lib/components/common/Modal.svelte';
  import Button      from '$lib/components/common/Button.svelte';
  import FormInput   from '$lib/components/common/FormInput.svelte';
  import FormSelect  from '$lib/components/common/FormSelect.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';

  export let job  = null;   // null = create mode; object = edit mode
  export let show = true;

  const dispatch = createEventDispatcher();

  $: store       = $maintenanceStore;
  $: systems     = store.systems;
  $: types       = store.types;
  $: regime      = store.regime;
  $: contractors = store.contractors;

  // -- Form state ------------------------------------------------------------
  let title           = job?.title           ?? '';
  let description     = job?.description     ?? '';
  let scopeType       = job?.scope_type      ?? 'building';
  let scopeId         = job?.scope_id        ?? '';
  let scheduledDate   = job?.scheduled_date  ?? today();
  let hardExpiryDate  = job?.hard_expiry_date ?? '';
  let regimeId        = job?.regime_id       ?? '';
  let contractorId    = job?.contractor_id   ?? '';
  let contractorName  = job?.contractor_name ?? '';
  let engineerName    = job?.engineer_name   ?? '';
  let referenceNo     = job?.reference_number ?? '';

  let saving = false;
  let errors = {};

  $: isEdit = !!job;

  // Auto-populate title when regime selected and title is blank
  $: if (regimeId && !title) {
    const r = regime.find(r => r.id === regimeId);
    if (r) title = r.task_name;
  }

  // Clear scope_id when scope_type changes
  function onScopeTypeChange() { scopeId = ''; }

  // Scope options based on type
  $: scopeOptions = scopeType === 'system'
    ? systems.map(s => ({ value: s.id, label: s.name }))
    : scopeType === 'type'
    ? types.map(t => ({ value: t.id, label: `${t.name} (${t.code})` }))
    : [];

  // Scope label for storage
  function resolveScopeLabel() {
    if (scopeType === 'building') return 'Building-wide';
    const opt = scopeOptions.find(o => o.value === scopeId);
    return opt?.label ?? '';
  }

  // Regime select options
  $: regimeOptions = regime.map(r => {
    const type = types.find(t => t.id === r.type_id);
    const typeName = type?.name ?? '?';
    return {
      value: r.id,
      label: `${typeName} — ${r.task_name} (${frequencyLabel(r.frequency_days)})`,
    };
  });

  function validate() {
    errors = {};
    if (!title.trim())        errors.title         = 'Title is required';
    if (!scheduledDate)       errors.scheduledDate = 'Scheduled date is required';
    if (scopeType !== 'building' && !scopeId) errors.scopeId = 'Please select a scope';
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    saving = true;
    try {
      const data = {
        title:            title.trim(),
        description:      description.trim()      || null,
        scope_type:       scopeType,
        scope_id:         scopeId                 || null,
        scope_label:      resolveScopeLabel(),
        scheduled_date:   scheduledDate,
        hard_expiry_date: hardExpiryDate           || null,
        regime_id:        regimeId                 || null,
        contractor_id:    contractorId             || null,
        contractor_name:  contractorName.trim()    || null,
        engineer_name:    engineerName.trim()      || null,
        reference_number: referenceNo.trim()       || null,
      };

      if (isEdit) {
        await maintenanceStore.updateJob(job.id, data);
        dispatch('saved', { mode: 'edit' });
      } else {
        const created = await maintenanceStore.createJob(data);
        dispatch('saved', { mode: 'create', job: created });
      }
      dispatch('close');
    } catch (err) {
      errors.general = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<Modal {show} size="large" on:close={() => dispatch('close')}>
  <h3 slot="header" class="text-lg font-bold">
    {isEdit ? 'Edit Job' : 'New Maintenance Job'}
  </h3>

  <div class="space-y-5">

    <!-- Title -->
    <FormInput
      label="Title"
      bind:value={title}
      placeholder="e.g. Annual fire door inspection"
      error={errors.title}
    />

    <!-- Regime link -->
    <div>
      <p class="text-xs text-slate-400 mb-1.5">Link to regime task <span class="text-slate-500">(optional — enables auto-scheduling)</span></p>
      <select bind:value={regimeId}
        class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white
               focus:outline-none focus:border-purple-500">
        <option value="">— Ad-hoc / no regime link —</option>
        {#each regimeOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <!-- Scope type + selector -->
    <div>
      <p class="text-xs text-slate-400 mb-1.5">Scope — what this job covers</p>
      <div class="flex gap-2 flex-wrap mb-3">
        {#each ['building', 'system', 'type'] as st}
          <button
            class="scope-btn"
            class:scope-btn-active={scopeType === st}
            on:click={() => { scopeType = st; onScopeTypeChange(); }}
          >
            {scopeTypeLabel(st)}
          </button>
        {/each}
      </div>

      {#if scopeType !== 'building'}
        <select bind:value={scopeId}
          class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white
                 focus:outline-none focus:border-purple-500
                 {errors.scopeId ? 'border-red-500' : ''}">
          <option value="">— Select {scopeTypeLabel(scopeType)} —</option>
          {#each scopeOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
        {#if errors.scopeId}
          <p class="text-xs text-red-400 mt-1">{errors.scopeId}</p>
        {/if}
      {:else}
        <p class="text-sm text-slate-500 italic">Applies to the whole building.</p>
      {/if}
    </div>

    <!-- Scheduled date + Hard expiry date -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <p class="text-xs text-slate-400 mb-1.5">Scheduled date</p>
        <input type="date" bind:value={scheduledDate}
          class="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white
                 focus:outline-none focus:border-purple-500 w-full
                 {errors.scheduledDate ? 'border-red-500' : ''}" />
        {#if errors.scheduledDate}
          <p class="text-xs text-red-400 mt-1">{errors.scheduledDate}</p>
        {/if}
      </div>
      <div>
        <p class="text-xs text-slate-400 mb-1.5">
          Hard expiry date
          <span class="text-slate-500">— regulatory/insurance deadline</span>
        </p>
        <input type="date" bind:value={hardExpiryDate}
          class="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white
                 focus:outline-none focus:border-purple-500 w-full" />
        <p class="text-xs text-slate-600 mt-1">
          If set and earlier than scheduled date, overrides RAG status.
        </p>
      </div>
    </div>

    <!-- Assigned contractor (from contractor profiles) -->
    {#if contractors.length > 0}
      <div>
        <p class="text-xs text-slate-400 mb-1.5">Assign to contractor <span class="text-slate-500">(optional)</span></p>
        <select bind:value={contractorId}
          class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white
                 focus:outline-none focus:border-purple-500">
          <option value="">— Not assigned —</option>
          {#each contractors as c}
            <option value={c.id}>{c.full_name || c.email}</option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- Contractor / engineer -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FormInput label="Contractor name" bind:value={contractorName}
        placeholder="Company name" />
      <FormInput label="Engineer" bind:value={engineerName}
        placeholder="Engineer name" />
    </div>

    <FormInput label="Reference number" bind:value={referenceNo}
      placeholder="Contractor job / cert ref" />

    <!-- Description -->
    <FormTextarea label="Description / special instructions"
      bind:value={description} rows={3}
      placeholder="Optional notes for this job…" />

    {#if errors.general}
      <p class="text-sm text-red-400">⚠ {errors.general}</p>
    {/if}

  </div>

  <div slot="footer" class="flex justify-end gap-3">
    <Button variant="secondary" on:click={() => dispatch('close')} disabled={saving}>
      Cancel
    </Button>
    <Button variant="primary" on:click={handleSave} disabled={saving}>
      {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create job'}
    </Button>
  </div>
</Modal>

<style>
  .scope-btn {
    padding: 0.3rem 0.875rem; border-radius: 6px; font-size: 0.8rem;
    border: 1px solid rgb(71 85 105); background: rgb(51 65 85 / 0.4);
    color: #cbd5e1; cursor: pointer; transition: all 0.12s;
  }
  .scope-btn:hover    { border-color: rgb(var(--lh-accent-rgb) / 0.6); }
  .scope-btn-active   { border-color: var(--lh-accent); background: rgb(var(--lh-accent-rgb) / 0.15); color: #e2e8f0; }
</style>
