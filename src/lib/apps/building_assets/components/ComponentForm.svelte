<!-- src/lib/apps/building_assets/components/ComponentForm.svelte -->
<!-- Create a new component. Location is selected by Floor (from the Facility/Floor
     hierarchy) rather than by graphical plan. The plan is an optional secondary
     field — it is needed only when placing the component on a drawing. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import AttrField from './AttrField.svelte';
  import { buildRef } from '../stores/buildingAssetsStore.js';
  import { inp } from '../ui.js';

  export let types       = [];    // component_types[]
  export let systems     = [];    // building_systems[]
  export let attrDefs    = {};    // { typeId: type_attributes[] }
  export let attrOptions = {};    // { attrDefId: type_attribute_options[] }
  export let plans       = [];    // all plans[] — filtered to selected floor for plan picker
  export let floors      = [];    // floors[] ordered by level_order
  export let facilities  = [];    // facilities[] — for display and buildRef
  export let components  = [];    // all components[] — for linked_component_ref datalist
  export let saving      = false;

  const dispatch = createEventDispatcher();

  // ── Form state ─────────────────────────────────────────────────────
  let selectedFloorId    = '';
  let planId             = '';
  let selectedTypeId     = '';
  let label              = '';
  let assetId            = '';
  let xPosition          = 0.5;
  let yPosition          = 0.5;
  let linkedComponentRef = '';
  let attrValues         = {}; // { attrDefId: string }

  // ── Derived ────────────────────────────────────────────────────────

  // Default facility — auto-selected (one building per deployment)
  $: defaultFacility = facilities[0] ?? null;

  // Plans filtered to the selected floor
  $: plansForFloor = selectedFloorId
    ? plans.filter(p => p.floor_id === selectedFloorId)
    : [];

  $: selectedType = types.find(t => t.id === selectedTypeId) ?? null;
  $: defs         = selectedTypeId ? (attrDefs[selectedTypeId] ?? []) : [];
  $: primaryDef   = defs.find(d => d.is_primary) ?? null;
  $: primaryAttribute = primaryDef ? (attrValues[primaryDef.id] ?? '') : '';

  // datalist: canonical ref string for every existing component
  $: refOptions = components
    .map(c => buildRef(c, floors, facilities, types))
    .filter(Boolean);

  // ── Handlers ───────────────────────────────────────────────────────

  function onFloorChange() {
    // Auto-select plan if exactly one plan exists for this floor
    const floorPlans = plans.filter(p => p.floor_id === selectedFloorId);
    planId = floorPlans.length === 1 ? floorPlans[0].id : '';
  }

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

  function handleSubmit() {
    if (!selectedFloorId || !selectedTypeId) return;

    const fields = {
      floor_id:             selectedFloorId,
      plan_id:              planId             || null,
      type_code:            selectedType.code,
      primary_attribute:    primaryAttribute   || null,
      label:                label              || null,
      asset_id:             assetId            || null,
      x_position:           planId ? (Math.round((parseFloat(xPosition) || 0.5) * 1000) / 1000) : 0.5,
      y_position:           planId ? (Math.round((parseFloat(yPosition) || 0.5) * 1000) / 1000) : 0.5,
      linked_component_ref: linkedComponentRef.trim() || null
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
    types:  types.filter(t => t.building_system_id === sys.id && t.visible)
  })).filter(g => g.types.length > 0);

</script>

<div class="flex flex-col gap-5">
  <h3 class="text-lg font-semibold text-white">New Component</h3>

  <!-- ── Building (read-only — auto-selected default facility) ──── -->
  {#if defaultFacility}
    <div class="flex items-center gap-2 px-3 py-2 rounded bg-slate-800 border border-slate-700">
      <span class="text-xs text-slate-500 uppercase tracking-wider">Building</span>
      <span class="text-sm font-medium text-slate-200">{defaultFacility.name}</span>
      <span class="text-xs font-mono text-slate-500 ml-auto">{defaultFacility.short_name}</span>
    </div>
  {/if}

  <!-- ── Floor + Type ─────────────────────────────────────────── -->
  <div class="grid grid-cols-2 gap-4">
    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">Floor <span class="text-red-400">*</span></p>
      <select
        bind:value={selectedFloorId}
        on:change={onFloorChange}
        class="{inp}"
      >
        <option value="">Select floor…</option>
        {#each floors as f}
          <option value={f.id}>{f.name}
            <span class="text-slate-500">({f.short_name})</span>
          </option>
        {/each}
      </select>
    </div>

    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">Component Type <span class="text-red-400">*</span></p>
      <select
        bind:value={selectedTypeId}
        on:change={onTypeChange}
        class="{inp}"
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

  <!-- ── Label + Asset ID ─────────────────────────────────────── -->
  <div class="grid grid-cols-2 gap-4">
    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">Label</p>
      <input type="text" bind:value={label} placeholder="Optional label" class="{inp}" />
    </div>
    <div class="flex flex-col gap-1">
      <p class="text-xs text-slate-400">Asset ID</p>
      <input type="text" bind:value={assetId} placeholder="e.g. FD-042" class="{inp}" />
    </div>
  </div>

  <!-- ── Plan placement (optional) ────────────────────────────── -->
  <div class="border border-slate-700 rounded-lg p-3 bg-slate-800/30">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
      Plan Placement
      <span class="font-normal normal-case text-slate-600 ml-1">— optional, set later if needed</span>
    </p>

    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <p class="text-xs text-slate-500">Floor Plan</p>
        <select bind:value={planId} class="{inp}" disabled={!selectedFloorId}>
          <option value="">Not yet placed on a plan</option>
          {#each plansForFloor as p}
            <option value={p.id}>{p.name ?? p.building}</option>
          {/each}
        </select>
        {#if selectedFloorId && plansForFloor.length === 0}
          <p class="text-xs text-slate-600 italic">No plans exist for this floor yet.</p>
        {/if}
      </div>

      {#if planId}
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <p class="text-xs text-slate-500">X Position (0–1)</p>
            <input type="number" min="0" max="1" step="0.01"
              bind:value={xPosition}
              class="{inp} w-28" />
          </div>
          <div class="flex flex-col gap-1">
            <p class="text-xs text-slate-500">Y Position (0–1)</p>
            <input type="number" min="0" max="1" step="0.01"
              bind:value={yPosition}
              class="{inp} w-28" />
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Linked component reference ───────────────────────────── -->
  <div class="flex flex-col gap-1">
    <p class="text-xs text-slate-400">
      Linked Component
      <span class="text-slate-600 ml-1 font-normal">— cross-reference to a related component</span>
    </p>
    <input
      type="text"
      bind:value={linkedComponentRef}
      list="component-refs"
      placeholder="e.g. DB / G / Fire Door / FD-042"
      class="{inp} font-mono placeholder-slate-600"
    />
    <datalist id="component-refs">
      {#each refOptions as ref}
        <option value={ref}></option>
      {/each}
    </datalist>
    {#if linkedComponentRef.trim()}
      <p class="text-xs text-slate-500">
        → links to <span class="text-purple-400 font-mono">"{linkedComponentRef.trim()}"</span>
      </p>
    {/if}
  </div>

  <!-- ── Dynamic Attribute Fields ─────────────────────────────── -->
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
            → <span class="font-mono text-slate-400">primary_attribute</span> will be
            <span class="font-semibold text-yellow-400">"{primaryAttribute}"</span>
          </p>
        </div>
      {/if}
    </div>
  {:else if selectedType}
    <div class="border border-slate-700 rounded-lg p-4 bg-slate-800/30 text-slate-500 text-sm italic">
      No attribute definitions for {selectedType.name}.
    </div>
  {/if}

  <!-- ── Actions ──────────────────────────────────────────────── -->
  <div class="flex justify-end gap-3 pt-2 border-t border-slate-700">
    <button
      on:click={handleCancel}
      class="px-4 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
    >
      Cancel
    </button>
    <button
      on:click={handleSubmit}
      disabled={!selectedFloorId || !selectedTypeId || saving}
      class="px-4 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500
             disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
    >
      {saving ? 'Saving…' : 'Create Component'}
    </button>
  </div>
</div>
