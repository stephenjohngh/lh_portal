<!-- src/lib/apps/v2proto/components/QuickAddForm.svelte -->
<!-- Minimal inline form for placing a new component from a plan-click.
     Only captures type, label, asset_id, and the primary attribute.
     floor_id / plan_id / x_position / y_position are injected by PlanViewTab. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { inp } from '../ui.js';

  export let types       = [];
  export let systems     = [];
  export let attrDefs    = {};
  export let attrOptions = {};
  export let saving      = false;

  const dispatch = createEventDispatcher();

  const TYPE_PREF_KEY = 'lh_v2plan_lastTypeId';

  let selectedTypeId = '';
  let label          = '';
  let assetId        = '';
  let primaryValue   = '';

  $: selectedType = types.find(t => t.id === selectedTypeId) ?? null;
  $: defs         = selectedTypeId ? (attrDefs[selectedTypeId] ?? []) : [];
  $: primaryDef   = defs.find(d => d.is_primary) ?? null;
  $: primaryOpts  = primaryDef ? (attrOptions[primaryDef.id] ?? []).filter(o => o.visible) : [];

  // Restore last used type once type list is available
  let typeRestored = false;
  $: if (!typeRestored && types.length > 0) {
    const saved = localStorage.getItem(TYPE_PREF_KEY);
    if (saved && types.some(t => t.id === saved)) {
      selectedTypeId = saved;
      onTypeChange();
    }
    typeRestored = true;
  }

  function onTypeChange() {
    primaryValue = '';
    if (primaryDef?.default_value) primaryValue = primaryDef.default_value;
    if (selectedTypeId) localStorage.setItem(TYPE_PREF_KEY, selectedTypeId);
  }

  function handleSubmit() {
    if (!selectedTypeId) return;
    const attrValues = primaryDef && primaryValue
      ? [{ type_attribute_id: primaryDef.id, value: primaryValue }]
      : [];
    dispatch('submit', {
      fields: {
        type_code:         selectedType.code,
        primary_attribute: primaryValue || null,
        label:             label.trim()  || null,
        asset_id:          assetId.trim() || null,
        status:            'OK'
      },
      attrValues
    });
  }

  // Group types by system
  $: typesBySystem = systems.map(sys => ({
    system: sys,
    types:  types.filter(t => t.building_system_id === sys.id && t.visible)
  })).filter(g => g.types.length > 0);

</script>

<div class="flex flex-col gap-3">
  <!-- Type -->
  <div class="flex flex-col gap-1">
    <p class="text-xs text-slate-400">Type <span class="text-red-400">*</span></p>
    <select bind:value={selectedTypeId} on:change={onTypeChange} class={inp}>
      <option value="">Select type…</option>
      {#each typesBySystem as group}
        <optgroup label={group.system.name}>
          {#each group.types as t}
            <option value={t.id}>{t.name}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
  </div>

  <!-- Primary attribute (if type has one) -->
  {#if primaryDef}
    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">
        {primaryDef.name}
        <span class="text-yellow-400 ml-0.5">★</span>
        {#if primaryDef.required}<span class="text-red-400">*</span>{/if}
      </p>
      {#if primaryOpts.length > 0}
        <select bind:value={primaryValue} class={inp}>
          <option value="">— select —</option>
          {#each primaryOpts as opt}
            <option value={opt.value}>{opt.value}</option>
          {/each}
        </select>
      {:else}
        <input type="text" bind:value={primaryValue} placeholder={primaryDef.name} class={inp} />
      {/if}
    </div>
  {/if}

  <!-- Label + Asset ID -->
  <div class="grid grid-cols-2 gap-2">
    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">Label</p>
      <input type="text" bind:value={label} placeholder="e.g. South stairwell" class={inp} />
    </div>
    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">Asset ID</p>
      <input type="text" bind:value={assetId} placeholder="e.g. FD-042" class={inp} />
    </div>
  </div>

  <!-- Actions -->
  <div class="flex gap-2 pt-1">
    <button
      on:click={() => dispatch('cancel')}
      class="flex-1 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600
             text-slate-300 transition-colors"
    >Cancel</button>
    <button
      on:click={handleSubmit}
      disabled={!selectedTypeId || saving}
      class="flex-1 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500
             disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium
             transition-colors"
    >{saving ? 'Placing…' : 'Place'}</button>
  </div>
</div>
