<!-- src/lib/apps/v2proto/components/ComponentForm.svelte -->
<!-- Create a new component — demonstrates dynamic attribute form driven by type_attributes -->
<script>
  import { createEventDispatcher } from 'svelte';
  import AttrField from './AttrField.svelte';

  export let types      = [];    // component_types[]
  export let systems    = [];    // building_systems[]
  export let attrDefs   = {};    // { typeId: type_attributes[] }
  export let attrOptions = {};   // { attrDefId: type_attribute_options[] }
  export let plans      = [];    // plans[]
  export let saving     = false;

  const dispatch = createEventDispatcher();

  // Form state
  let planId           = plans[0]?.id ?? '';
  let selectedTypeId   = '';
  let label            = '';
  let assetId          = '';
  let xPosition        = 0.5;
  let yPosition        = 0.5;
  let attrValues       = {}; // { attrDefId: string }

  $: selectedType = types.find(t => t.id === selectedTypeId) ?? null;
  $: defs         = selectedTypeId ? (attrDefs[selectedTypeId] ?? []) : [];
  $: primaryDef   = defs.find(d => d.is_primary) ?? null;

  // When type changes, reset attr values and pre-fill defaults
  function onTypeChange() {
    attrValues = {};
    const newDefs = attrDefs[selectedTypeId] ?? [];
    for (const d of newDefs) {
      if (d.default_value) attrValues[d.id] = d.default_value;
    }
  }

  function onAttrChange(e) {
    const { attrDefId, value } = e.detail;
    attrValues = { ...attrValues, [attrDefId]: value };
  }

  // primary_attribute is the value of the is_primary attr def
  $: primaryAttribute = primaryDef ? (attrValues[primaryDef.id] ?? '') : '';

  function handleSubmit() {
    if (!planId || !selectedTypeId) return;

    const fields = {
      plan_id:          planId,
      type_code:        selectedType.code,
      primary_attribute: primaryAttribute || null,
      label:            label || null,
      asset_id:         assetId || null,
      x_position:       parseFloat(xPosition) || 0.5,
      y_position:       parseFloat(yPosition) || 0.5
    };

    const attrValueRows = Object.entries(attrValues)
      .map(([attrDefId, value]) => ({ type_attribute_id: attrDefId, value }));

    dispatch('submit', { fields, attrValues: attrValueRows });
  }

  function handleCancel() {
    dispatch('cancel');
  }

  // Group types by system for the select
  $: typesBySystem = systems.map(sys => ({
    system: sys,
    types: types.filter(t => t.building_system_id === sys.id)
  })).filter(g => g.types.length > 0);
</script>

<div class="flex flex-col gap-5">
  <h3 class="text-lg font-semibold text-white">New Component</h3>

  <!-- Plan + Type -->
  <div class="grid grid-cols-2 gap-4">
    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">Floor Plan <span class="text-red-400">*</span></p>
      <select
        bind:value={planId}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500"
      >
        <option value="">Select plan…</option>
        {#each plans as p}
          <option value={p.id}>{p.building} — {p.name}</option>
        {/each}
      </select>
    </div>

    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">Component Type <span class="text-red-400">*</span></p>
      <select
        bind:value={selectedTypeId}
        on:change={onTypeChange}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500"
      >
        <option value="">Select type…</option>
        {#each typesBySystem as group}
          <optgroup label={group.system.name}>
            {#each group.types as t}
              <option value={t.id}>{t.name} ({t.code})</option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </div>
  </div>

  <!-- Label + Asset ID -->
  <div class="grid grid-cols-2 gap-4">
    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">Label</p>
      <input
        type="text"
        bind:value={label}
        placeholder="Optional label"
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500"
      />
    </div>
    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">Asset ID</p>
      <input
        type="text"
        bind:value={assetId}
        placeholder="e.g. BH-001"
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500"
      />
    </div>
  </div>

  <!-- Position (simple numbers for the proto) -->
  <div class="grid grid-cols-2 gap-4">
    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">X Position (0–1)</p>
      <input
        type="number" min="0" max="1" step="0.01"
        bind:value={xPosition}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500 w-28"
      />
    </div>
    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">Y Position (0–1)</p>
      <input
        type="number" min="0" max="1" step="0.01"
        bind:value={yPosition}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500 w-28"
      />
    </div>
  </div>

  <!-- Dynamic Attribute Fields -->
  {#if selectedType && defs.length > 0}
    <div class="border border-slate-600 rounded-lg p-4 bg-slate-800/50">
      <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        {selectedType.name} Attributes
      </p>
      <div class="flex flex-col gap-4">
        {#each defs as def}
          <AttrField
            {def}
            options={attrOptions[def.id] ?? []}
            value={attrValues[def.id] ?? def.default_value ?? ''}
            on:change={onAttrChange}
          />
        {/each}
      </div>

      {#if primaryDef && primaryAttribute}
        <div class="mt-3 pt-3 border-t border-slate-700">
          <p class="text-xs text-slate-500">
            → <span class="font-mono text-slate-400">components.primary_attribute</span> will be set to
            <span class="font-semibold text-yellow-400">"{primaryAttribute}"</span>
          </p>
        </div>
      {/if}
    </div>
  {:else if selectedType}
    <div class="border border-slate-700 rounded-lg p-4 bg-slate-800/30 text-slate-500 text-sm italic">
      No attribute definitions for {selectedType.name} — this type uses no configurable properties.
    </div>
  {/if}

  <!-- Actions -->
  <div class="flex justify-end gap-3 pt-2 border-t border-slate-700">
    <button
      on:click={handleCancel}
      class="px-4 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
    >
      Cancel
    </button>
    <button
      on:click={handleSubmit}
      disabled={!planId || !selectedTypeId || saving}
      class="px-4 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500
             disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
    >
      {saving ? 'Saving…' : 'Create Component'}
    </button>
  </div>
</div>
