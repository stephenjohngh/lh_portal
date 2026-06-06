<!-- src/lib/apps/mor/components/MitigationForm.svelte -->
<!-- Add or edit a mitigation (interim or permanent). -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show        = false;
  export let saving      = false;
  export let error       = '';
  export let mitigation  = null;  // null = add mode, object = edit mode

  const dispatch = createEventDispatcher();

  let type        = mitigation?.type        ?? 'interim';
  let description = mitigation?.description ?? '';
  let owner       = mitigation?.owner       ?? '';
  let target_date = mitigation?.target_date ?? '';
  let status      = mitigation?.status      ?? 'open';
  let notes       = mitigation?.notes       ?? '';

  let descError = '';

  // Reset when opened
  $: if (show) {
    type        = mitigation?.type        ?? 'interim';
    description = mitigation?.description ?? '';
    owner       = mitigation?.owner       ?? '';
    target_date = mitigation?.target_date ?? '';
    status      = mitigation?.status      ?? 'open';
    notes       = mitigation?.notes       ?? '';
    descError   = '';
  }

  $: isEdit = !!mitigation;
  $: title  = isEdit ? 'Edit Mitigation' : 'Add Mitigation';

  function validate() {
    descError = '';
    if (!description.trim()) { descError = 'Description is required.'; return false; }
    return true;
  }

  function handleSubmit() {
    if (!validate()) return;
    dispatch('submit', { type, description, owner, target_date, status, notes });
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<Modal {show} {title} size="medium" on:close={handleClose}>
  <div class="space-y-4">

    <ErrorDisplay message={error} onDismiss={() => dispatch('clearError')} />

    <!-- Type -->
    <div>
      <p class="text-sm font-medium text-slate-300 mb-2">Type</p>
      <div class="grid grid-cols-2 gap-2">
        {#each [
          { value: 'interim',   label: 'Interim',   desc: 'Temporary measure while permanent remedy is arranged' },
          { value: 'permanent', label: 'Permanent',  desc: 'The substantive fix that resolves the occurrence' },
        ] as opt}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="p-3 rounded-lg border cursor-pointer transition-colors
                   {type === opt.value
                     ? 'border-purple-500/60 bg-purple-900/20 ring-1 ring-purple-500'
                     : 'border-slate-600 bg-slate-800/40 hover:border-slate-500'}"
            on:click={() => type = opt.value}
          >
            <p class="text-sm font-semibold text-slate-200">{opt.label}</p>
            <p class="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
          </div>
        {/each}
      </div>
    </div>

    <!-- Description -->
    <div>
      <label for="mit-description" class="block text-sm font-medium text-slate-300 mb-1">
        Description <span class="text-red-400">*</span>
      </label>
      <textarea
        id="mit-description"
        bind:value={description}
        rows="3"
        placeholder="Describe the mitigation measure…"
        class="w-full bg-slate-700 border {descError ? 'border-red-500' : 'border-slate-600'}
               rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
      ></textarea>
      {#if descError}<p class="text-red-400 text-xs mt-1">{descError}</p>{/if}
    </div>

    <!-- Owner + Target date -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="mit-owner" class="block text-sm font-medium text-slate-300 mb-1">Owner / responsible</label>
        <input
          id="mit-owner"
          type="text"
          bind:value={owner}
          placeholder="Name or team"
          class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2
                 text-sm text-white placeholder-slate-500
                 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label for="mit-date" class="block text-sm font-medium text-slate-300 mb-1">Target date</label>
        <input
          id="mit-date"
          type="date"
          bind:value={target_date}
          class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2
                 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
    </div>

    <!-- Status (edit mode only) -->
    {#if isEdit}
      <div>
        <label for="mit-status" class="block text-sm font-medium text-slate-300 mb-1">Status</label>
        <select
          id="mit-status"
          bind:value={status}
          class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2
                 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="complete">Complete</option>
        </select>
      </div>
    {/if}

    <!-- Notes -->
    <div>
      <label for="mit-notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
      <textarea
        id="mit-notes"
        bind:value={notes}
        rows="2"
        placeholder="Evidence, observations, further detail…"
        class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2
               text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
      ></textarea>
    </div>

  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" size="medium" disabled={saving} on:click={handleClose}>Cancel</Button>
    <Button variant="primary"   size="medium" disabled={saving} on:click={handleSubmit}>
      {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Mitigation')}
    </Button>
  </svelte:fragment>
</Modal>
