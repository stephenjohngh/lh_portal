<!-- src/lib/apps/building_assets/components/ComponentDetailPanel.svelte -->
<!-- Full detail view + inline editor for a single component.
     Shows every field, all attribute values, last inspection summary,
     and allows editing and saving. Calls the store directly. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { buildingAssetsStore } from '../stores/buildingAssetsStore.js';
  import { typeByCode, floorById } from '../lookups.js';
  import { permissions }             from '$lib/stores/permissions';
  import AttrField                   from './AttrField.svelte';
  import ComponentInspectionHistory  from './ComponentInspectionHistory.svelte';
  import ComponentMaintenanceHistory from './ComponentMaintenanceHistory.svelte';
  import ComponentLinks              from './ComponentLinks.svelte';
  import { inp, sec, STATUSES }      from '../ui.js';
  import { fmtDateTime }             from '$lib/utils/dates.js';

  export let component;          // components row
  export let types       = [];
  export let systems     = [];
  export let floors      = [];
  export let plans       = [];
  export let attrDefs    = {};   // { typeId: effective attrs[] }
  export let attrOptions = {};
  export let attrs       = [];   // component_attributes[] for this component
  export let components  = [];   // all components[] for datalist
  export let readOnly    = false; // hide mutating actions (View mode)

  const dispatch = createEventDispatcher();

  // -- Edit state (initialised from props) -----------------------------
  let selectedFloorId    = component.floor_id      ?? '';
  let planId             = component.plan_id        ?? '';
  let selectedTypeId     = typeByCode(types, component.type_code)?.id ?? '';
  let label              = component.label          ?? '';
  let assetId            = component.asset_id       ?? '';
  let status             = component.status         ?? 'ok';
  let notes              = component.notes          ?? '';
  let xPosition          = component.x_position     ?? 0.5;
  let yPosition          = component.y_position     ?? 0.5;

  // Build initial attrValues map from loaded attrs
  let attrValues = Object.fromEntries(attrs.map(a => [a.type_attribute_id, a.value]));

  let saving       = false;
  let confirmDel   = false;
  let deleting     = false;
  let errorMsg     = '';
  let typeWarning  = false;   // shown when user changes type (attrs will reset)
  let dirty        = false;   // any change made?
  let showConditionAttrs = false;  // toggle for condition attributes (checkable=true)

  // -- loadedId pattern: re-initialise form whenever the selected component changes --
  let loadedId = component.id;
  $: if (component.id !== loadedId) {
    loadedId           = component.id;
    selectedFloorId    = component.floor_id             ?? '';
    planId             = component.plan_id              ?? '';
    selectedTypeId     = typeByCode(types, component.type_code)?.id ?? '';
    label              = component.label                ?? '';
    assetId            = component.asset_id             ?? '';
    status             = component.status               ?? 'ok';
    notes              = component.notes                ?? '';
    xPosition          = component.x_position           ?? 0.5;
    yPosition          = component.y_position           ?? 0.5;
    attrValues         = Object.fromEntries(attrs.map(a => [a.type_attribute_id, a.value]));
    dirty              = false;
    confirmDel         = false;
    errorMsg           = '';
    typeWarning        = false;
    showConditionAttrs      = false;
  }

  // -- Derived ----------------------------------------------------------
  $: selectedType   = types.find(t => t.id === selectedTypeId) ?? null;
  $: floor          = floorById(floors, selectedFloorId);
  $: defs           = selectedTypeId ? (attrDefs[selectedTypeId] ?? []) : [];
  $: primaryDef     = defs.find(d => d.is_primary) ?? null;
  // Fixed attributes (checkable=false) are intrinsic to the component;
  // condition attributes (checkable=true) are re-evaluated each inspection.
  $: fixedDefs     = defs.filter(d => !d.checkable);
  $: conditionDefs = defs.filter(d =>  d.checkable);
  $: primaryAttr    = primaryDef ? (attrValues[primaryDef.id] ?? '') : '';
  $: plansForFloor  = selectedFloorId ? plans.filter(p => p.floor_id === selectedFloorId) : [];

  // Type badge for the original (unedited) type
  $: origType = typeByCode(types, component.type_code);

  const STATUS_OPTS = STATUSES;

  function markDirty() { dirty = true; }

  function onTypeChange() {
    // Warn if the user is changing from the original type
    typeWarning   = selectedTypeId !== (origType?.id ?? '');
    showConditionAttrs = false;
    if (typeWarning) {
      attrValues = {};
      // Populate defaults for the new type
      for (const d of (attrDefs[selectedTypeId] ?? [])) {
        if (d.default_value) attrValues[d.id] = d.default_value;
      }
    }
    markDirty();
  }

  function onFloorChange() {
    // Auto-select plan if exactly one plan for this floor
    const fp = plans.filter(p => p.floor_id === selectedFloorId);
    planId = fp.length === 1 ? fp[0].id : '';
    markDirty();
  }

  function onAttrChange(e) {
    const { attrDefId, value } = e.detail;
    attrValues = { ...attrValues, [attrDefId]: value };
    dirty = true;
  }

  async function handleSave() {
    saving  = true;
    errorMsg = '';
    try {
      const fields = {
        floor_id:             selectedFloorId || null,
        plan_id:              planId          || null,
        type_code:            selectedType?.code ?? component.type_code,
        primary_attribute:    primaryAttr     || null,
        label:                label.trim()    || null,
        asset_id:             assetId.trim()  || null,
        status,
        notes:                notes.trim()    || null,
        x_position:           planId ? (Math.round((parseFloat(xPosition) || 0.5) * 1000) / 1000) : component.x_position,
        y_position:           planId ? (Math.round((parseFloat(yPosition) || 0.5) * 1000) / 1000) : component.y_position
      };
      await buildingAssetsStore.updateComponent(component.id, fields);
      await buildingAssetsStore.updateComponentAttrs(component.id, attrValues);
      dirty = false;
      dispatch('saved');
    } catch (err) {
      errorMsg = err.message;
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    deleting = true;
    try {
      await buildingAssetsStore.deleteComponent(component.id);
      dispatch('deleted');
    } catch (err) {
      errorMsg = err.message;
      confirmDel = false;
    } finally {
      deleting = false;
    }
  }

  function handleInspect() {
    dispatch('inspect', { component });
  }


  // Group types by system for the type picker
  $: typesBySystem = systems.map(sys => ({
    system: sys,
    types:  types.filter(t => t.building_system_id === sys.id && t.visible)
  })).filter(g => g.types.length > 0);

  // Format dates
  const fmt = fmtDateTime;


</script>

<!-- Outer scroll container -->
<div class="bg-slate-800 rounded-xl border border-slate-700 flex flex-col max-h-[90vh]">

  <!-- -- Sticky header --------------------------------------------- -->
  <div class="flex items-start gap-3 p-5 pb-4 border-b border-slate-700 shrink-0">
    <div class="flex-1 min-w-0">
      <!-- Line 1: floor/type/id  ·  label -->
      <div class="flex items-baseline gap-2 flex-wrap">
        <span class="font-bold font-mono text-white text-base leading-tight tracking-wide">
          {floor?.short_name ?? '?'}/{origType?.initial ?? '?'}/{component.asset_id ?? '?'}
        </span>
        {#if component.label}
          <span class="text-slate-300 text-base leading-tight">{component.label}</span>
        {/if}
        {#if dirty}
          <span class="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            unsaved
          </span>
        {/if}
      </div>
      <!-- Line 2: type name -->
      <p class="text-sm text-slate-500 mt-0.5">{origType?.name ?? component.type_code}</p>
    </div>

    <button
      on:click={() => dispatch('close')}
      class="text-slate-500 hover:text-white transition-colors text-xl leading-none shrink-0"
      title="Close"
    >✕</button>
  </div>

  <!-- -- Scrollable body ------------------------------------------- -->
  <div class="flex-1 overflow-y-auto p-5 space-y-6">

    {#if errorMsg}
      <div class="px-4 py-2.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-sm flex justify-between items-start gap-2">
        <span>{errorMsg}</span>
        <button on:click={() => errorMsg = ''} class="shrink-0 text-red-500 hover:text-red-300">✕</button>
      </div>
    {/if}

    <!-- -- Location ------------------------------------------------ -->
    <section>
      <p class={sec}>Location</p>
      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-1">
          <p class="text-xs text-slate-500">Floor</p>
          <select bind:value={selectedFloorId} on:change={onFloorChange} class={inp}>
            <option value="">— unset —</option>
            {#each floors as f}
              <option value={f.id}>{f.name} ({f.short_name})</option>
            {/each}
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <p class="text-xs text-slate-500">Plan <span class="text-slate-600">optional</span></p>
          <select bind:value={planId} on:change={markDirty} class={inp} disabled={!selectedFloorId}>
            <option value="">Not placed on a plan</option>
            {#each plansForFloor as p}
              <option value={p.id}>{p.name ?? p.building}</option>
            {/each}
          </select>
        </div>
      </div>

      {#if planId}
        <div class="grid grid-cols-2 gap-4 mt-3">
          <div class="flex flex-col gap-1">
            <p class="text-xs text-slate-500">X Position</p>
            <input type="number" min="0" max="1" step="0.001"
              bind:value={xPosition} on:input={markDirty} class="{inp} w-32" />
          </div>
          <div class="flex flex-col gap-1">
            <p class="text-xs text-slate-500">Y Position</p>
            <input type="number" min="0" max="1" step="0.001"
              bind:value={yPosition} on:input={markDirty} class="{inp} w-32" />
          </div>
        </div>
      {/if}
    </section>

    <!-- -- Identity ------------------------------------------------ -->
    <section>
      <p class={sec}>Identity</p>
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <p class="text-xs text-slate-500">Component Type</p>
          <select bind:value={selectedTypeId} on:change={onTypeChange} class={inp}>
            <option value="">— select type —</option>
            {#each typesBySystem as group}
              <optgroup label={group.system.name}>
                {#each group.types as t}
                  <option value={t.id}>{t.name} ({t.code})</option>
                {/each}
              </optgroup>
            {/each}
          </select>
          {#if typeWarning}
            <p class="text-xs text-amber-400 mt-1">
              ⚠ Type changed — attribute values have been reset to defaults for the new type.
            </p>
          {/if}
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <p class="text-xs text-slate-500">Label</p>
            <input type="text" bind:value={label} on:input={markDirty}
              placeholder="e.g. FD-G-001" class={inp} />
          </div>
          <div class="flex flex-col gap-1">
            <p class="text-xs text-slate-500">Asset ID</p>
            <input type="text" bind:value={assetId} on:input={markDirty}
              placeholder="e.g. FD-042" class={inp} />
          </div>
        </div>
      </div>
    </section>

    <!-- -- Status -------------------------------------------------- -->
    <section>
      <p class={sec}>Status</p>
      <div class="grid grid-cols-4 gap-2">
        {#each STATUS_OPTS as opt}
          <button
            on:click={() => { status = opt.value; dirty = true; }}
            class="py-2 text-sm rounded font-medium text-white transition-all
                   {opt.bg} {status === opt.value ? 'ring-2 ' + opt.ring : 'opacity-40 hover:opacity-70'}"
          >{opt.label}</button>
        {/each}
      </div>
    </section>

    <!-- -- Attribute values ----------------------------------------- -->
    {#if defs.length > 0}
      <section>
        <div class="flex items-center justify-between gap-2 mb-3">
          <p class="{sec} mb-0">
            {selectedType?.name ?? 'Type'} Attributes
            {#if primaryDef && primaryAttr}
              <span class="font-normal normal-case text-yellow-400 ml-2">★ {primaryAttr}</span>
            {/if}
          </p>
          {#if conditionDefs.length > 0}
            <button
              on:click={() => showConditionAttrs = !showConditionAttrs}
              class="text-xs px-2 py-0.5 rounded border transition-colors shrink-0
                     {showConditionAttrs
                       ? 'bg-purple-600/30 border-purple-500/50 text-purple-300'
                       : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-slate-300'}"
            >Condition attrs ({conditionDefs.length})</button>
          {/if}
        </div>

        <!-- Fixed attributes — always shown -->
        <div class="flex flex-col gap-4">
          {#each fixedDefs as def (def.id)}
            <div class="flex items-start gap-2">
              <div class="flex-1">
                <AttrField
                  {def}
                  options={attrOptions[def.id] ?? []}
                  value={attrValues[def.id] ?? def.default_value ?? ''}
                  on:change={onAttrChange}
                />
              </div>
              {#if def._scope === 'system'}
                <span class="text-xs text-blue-400/60 mt-5 shrink-0" title="Inherited from system">↑sys</span>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Condition attributes — shown only when toggled -->
        {#if showConditionAttrs && conditionDefs.length > 0}
          <div class="mt-4 pt-3 border-t border-slate-700/60">
            <p class="text-xs text-purple-400/60 mb-3">Condition attributes</p>
            <div class="flex flex-col gap-4">
              {#each conditionDefs as def (def.id)}
                <div class="flex items-start gap-2">
                  <div class="flex-1">
                    <AttrField
                      {def}
                      options={attrOptions[def.id] ?? []}
                      value={attrValues[def.id] ?? def.default_value ?? ''}
                      on:change={onAttrChange}
                    />
                  </div>
                  {#if def._scope === 'system'}
                    <span class="text-xs text-blue-400/60 mt-5 shrink-0" title="Inherited from system">↑sys</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    {:else if selectedTypeId}
      <p class="text-xs text-slate-600 italic">No attribute definitions for this type.</p>
    {/if}

    <!-- -- Notes --------------------------------------------------- -->
    <section>
      <p class={sec}>Notes</p>
      <textarea
        bind:value={notes}
        on:input={markDirty}
        rows="3"
        placeholder="General notes about this component…"
        class="w-full px-3 py-2 text-sm rounded-lg bg-slate-700 border border-slate-600
               focus:outline-none focus:border-purple-500 text-white placeholder-slate-600
               resize-y transition-colors"
      ></textarea>
    </section>

    <!-- -- Linked components --------------------------------------- -->
    <ComponentLinks
      componentId={component.id}
      {components}
      {floors}
      {types}
      {readOnly}
    />

    <!-- -- Inspection history -------------------------------------- -->
    <ComponentInspectionHistory componentId={component.id} />

    <!-- -- Maintenance history -------------------------------------- -->
    <ComponentMaintenanceHistory componentId={component.id} />

    <!-- -- Metadata ------------------------------------------------- -->
    <section class="text-xs text-slate-600 space-y-0.5 pb-1">
      <p>ID <span class="font-mono text-slate-500">{component.id}</span></p>
      <p>Created   <span class="text-slate-500">{fmt(component.created_at)}</span></p>
      {#if component.updated_at}
        <p>Updated   <span class="text-slate-500">{fmt(component.updated_at)}</span></p>
      {/if}
    </section>

  </div><!-- end scrollable body -->

  <!-- -- Sticky footer actions ------------------------------------ -->
  <div class="p-5 pt-4 border-t border-slate-700 shrink-0">

    {#if confirmDel && $permissions.isAdmin}
      <div class="mb-3 px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/50 text-sm text-red-300">
        <p class="font-semibold mb-2">Delete this component?</p>
        <p class="text-red-400/80 text-xs mb-3">
          This will permanently delete the component, all its attribute values, and inspection history.
          Linked references from other components will be cleared.
        </p>
        <div class="flex gap-2">
          <button
            on:click={handleDelete}
            disabled={deleting}
            class="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-500 text-white font-medium
                   disabled:opacity-50"
          >{deleting ? 'Deleting…' : 'Yes, delete'}</button>
          <button
            on:click={() => confirmDel = false}
            class="px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
          >Cancel</button>
        </div>
      </div>
    {/if}

    <div class="flex items-center gap-3">
      <!-- Component delete: admin only (schema-level entity).
           Matches the design decision logged in CLAUDE.md. -->
      {#if $permissions.isAdmin}
        <button
          on:click={() => confirmDel = true}
          class="text-sm px-3 py-1.5 rounded-lg text-slate-500 hover:text-red-400
                 hover:bg-red-900/20 transition-colors border border-transparent
                 hover:border-red-900/30"
          title="Delete component (admin)"
        >Delete</button>
      {/if}

      <div class="ml-auto flex gap-2">
        <button
          on:click={() => dispatch('close')}
          class="px-4 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
        >{readOnly ? 'Close' : 'Cancel'}</button>
        {#if !readOnly}
          <button
            on:click={handleSave}
            disabled={saving || !dirty}
            class="px-5 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500
                   disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >{saving ? 'Saving…' : 'Save Changes'}</button>
        {/if}
      </div>
    </div>
  </div>

</div>
