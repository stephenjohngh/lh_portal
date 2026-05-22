<!-- src/lib/apps/building_assets/components/QuickAddForm.svelte -->
<!-- Minimal inline form for placing a new component from a plan-click.
     Only captures type, label, asset_id, and the primary attribute.
     floor_id / plan_id / x_position / y_position are injected by PlanViewTab. -->
<script>
  import { createEventDispatcher }    from 'svelte';
  import { buildingAssetsStore }      from '../stores/buildingAssetsStore.js';
  import { inp }                      from '../ui.js';
  import AttrField                    from './AttrField.svelte';

  // Reference data comes from the store — no prop drilling needed.
  // Only UI state is passed in from PlanViewTab.
  export let saving = false;

  $: ({ types, systems, attrDefs, attrOptions } = $buildingAssetsStore);

  const dispatch = createEventDispatcher();

  const QUICKADD_PREF_KEY = 'lh_building_assets_quickadd';

  let selectedTypeId      = '';
  let label               = '';
  let assetId             = '';
  let primaryValue        = '';
  let secondaryAttrValues = {};   // { [attrDefId]: value }

  $: selectedType   = types.find(t => t.id === selectedTypeId) ?? null;
  $: defs           = selectedTypeId ? (attrDefs[selectedTypeId] ?? []) : [];
  $: primaryDef     = defs.find(d => d.is_primary) ?? null;
  $: primaryOpts    = primaryDef ? (attrOptions[primaryDef.id] ?? []).filter(o => o.visible) : [];
  $: secondaryDefs  = defs.filter(d => !d.is_primary && !d.checkable);

  // Restore last used type + all attribute values once type list is available
  let formRestored = false;
  $: if (!formRestored && types.length > 0) {
    try {
      const raw = localStorage.getItem(QUICKADD_PREF_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.typeId && types.some(t => t.id === saved.typeId)) {
          selectedTypeId = saved.typeId;
          // Restore values directly (primaryDef/secondaryDefs haven't updated yet — Svelte
          // will render correctly once reactives run after this block)
          primaryValue = saved.primaryValue ?? '';
          // Validate restored attrValues against known defs; fill in defaults for any new attrs
          const currentDefs = attrDefs[saved.typeId] ?? [];
          const validDefIds = new Set(currentDefs.map(d => d.id));
          const restored = {};
          for (const [id, val] of Object.entries(saved.attrValues ?? {})) {
            if (validDefIds.has(id)) restored[id] = val;
          }
          for (const d of currentDefs.filter(d => !d.is_primary && !d.checkable)) {
            if (!(d.id in restored) && d.default_value != null && d.default_value !== '') {
              restored[d.id] = d.default_value;
            }
          }
          secondaryAttrValues = restored;
        }
      }
    } catch { /* ignore corrupt data */ }
    formRestored = true;
  }

  // Auto-save whenever type or any attribute value changes (after initial restore)
  $: if (formRestored && selectedTypeId) {
    localStorage.setItem(QUICKADD_PREF_KEY, JSON.stringify({
      typeId:       selectedTypeId,
      primaryValue,
      attrValues:   secondaryAttrValues,
    }));
  }

  function onTypeChange() {
    primaryValue        = '';
    secondaryAttrValues = {};
    // Read directly from attrDefs prop to avoid reactive-timing issues
    const currentDefs = attrDefs[selectedTypeId] ?? [];
    const pDef = currentDefs.find(d => d.is_primary);
    if (pDef?.default_value) primaryValue = pDef.default_value;
    const defaults = {};
    for (const d of currentDefs.filter(d => !d.is_primary && !d.checkable)) {
      if (d.default_value != null && d.default_value !== '') defaults[d.id] = d.default_value;
    }
    secondaryAttrValues = defaults;
  }

  function handleAttrChange({ detail }) {
    secondaryAttrValues = { ...secondaryAttrValues, [detail.attrDefId]: detail.value };
  }

  function handleSubmit() {
    if (!selectedTypeId) return;
    const allAttrValues = [];
    if (primaryDef && primaryValue) {
      allAttrValues.push({ type_attribute_id: primaryDef.id, value: primaryValue });
    }
    for (const [defId, val] of Object.entries(secondaryAttrValues)) {
      if (val !== '' && val !== null && val !== undefined) {
        allAttrValues.push({ type_attribute_id: defId, value: String(val) });
      }
    }
    dispatch('submit', {
      fields: {
        type_code:         selectedType.code,
        primary_attribute: primaryValue || null,
        label:             label.trim()  || null,
        asset_id:          assetId.trim() || null,
        status:            'ok'
      },
      attrValues: allAttrValues
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

  <!-- Secondary fixed attributes (non-primary; condition attrs excluded) -->
  {#each secondaryDefs as def (def.id)}
    <AttrField
      {def}
      options={attrOptions[def.id] ?? []}
      value={secondaryAttrValues[def.id] ?? ''}
      on:change={handleAttrChange}
    />
  {/each}

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
