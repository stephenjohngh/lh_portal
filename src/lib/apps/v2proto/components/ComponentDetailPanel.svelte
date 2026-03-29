<!-- src/lib/apps/v2proto/components/ComponentDetailPanel.svelte -->
<!-- Full detail view + inline editor for a single component.
     Shows every field, all attribute values, last inspection summary,
     and allows editing and saving. Calls the store directly. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { v2protoStore, buildRef } from '../stores/v2protoStore.js';
  import { typeByCode, floorById } from '../lookups.js';
  import AttrField from './AttrField.svelte';
  import { inp, sec, STATUSES } from '../ui.js';

  export let component;          // components row
  export let types       = [];
  export let systems     = [];
  export let floors      = [];
  export let facilities  = [];
  export let plans       = [];
  export let attrDefs    = {};   // { typeId: effective attrs[] }
  export let attrOptions = {};
  export let attrs       = [];   // component_attributes[] for this component
  export let components  = [];   // all components[] for datalist
  export let inspection  = null; // latest component_inspections row or null

  const dispatch = createEventDispatcher();

  // ── Edit state (initialised from props) ─────────────────────────────
  let selectedFloorId    = component.floor_id      ?? '';
  let planId             = component.plan_id        ?? '';
  let selectedTypeId     = (() => {
    const t = typeByCode(types, component.type_code);
    return t?.id ?? '';
  })();
  let label              = component.label          ?? '';
  let assetId            = component.asset_id       ?? '';
  let status             = component.status         ?? 'OK';
  let notes              = component.notes          ?? '';
  let linkedComponentRef = component.linked_component_ref ?? '';
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

  // ── Derived ──────────────────────────────────────────────────────────
  $: selectedType   = types.find(t => t.id === selectedTypeId) ?? null;
  $: floor          = floorById(floors, selectedFloorId);
  $: defs           = selectedTypeId ? (attrDefs[selectedTypeId] ?? []) : [];
  $: primaryDef     = defs.find(d => d.is_primary) ?? null;
  $: primaryAttr    = primaryDef ? (attrValues[primaryDef.id] ?? '') : '';
  $: plansForFloor  = selectedFloorId ? plans.filter(p => p.floor_id === selectedFloorId) : [];

  // datalist options for linked component ref
  $: refOptions = components
    .filter(c => c.id !== component.id)
    .map(c => buildRef(c, floors, facilities, types))
    .filter(Boolean);

  // Type badge for the original (unedited) type
  $: origType = typeByCode(types, component.type_code);

  // Map shared STATUSES to local STATUS_OPTS with 'OK' value casing
  const STATUS_OPTS = STATUSES.map(s => s.value === 'ok' ? { ...s, value: 'OK' } : s);

  function markDirty() { dirty = true; }

  function onTypeChange() {
    // Warn if the user is changing from the original type
    typeWarning = selectedTypeId !== (origType?.id ?? '');
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
        linked_component_ref: linkedComponentRef.trim() || null,
        x_position:           planId ? (parseFloat(xPosition) || 0.5) : component.x_position,
        y_position:           planId ? (parseFloat(yPosition) || 0.5) : component.y_position
      };
      await v2protoStore.updateComponent(component.id, fields);
      await v2protoStore.updateComponentAttrs(component.id, attrValues);
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
      await v2protoStore.deleteComponent(component.id);
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
  function fmt(dt) {
    if (!dt) return '—';
    return new Date(dt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
</script>

<!-- Outer scroll container -->
<div class="bg-slate-800 rounded-xl border border-slate-700 flex flex-col max-h-[90vh]">

  <!-- ── Sticky header ───────────────────────────────────────────── -->
  <div class="flex items-start gap-3 p-5 pb-4 border-b border-slate-700 shrink-0">
    {#if origType}
      <div
        class="w-11 h-11 rounded-lg flex items-center justify-center text-white font-bold text-xl shrink-0"
        style="background-color: #{origType.colour}"
        title={origType.name}
      >{origType.initial}</div>
    {:else}
      <div class="w-11 h-11 rounded-lg bg-slate-600 flex items-center justify-center text-slate-400 shrink-0 text-xl">?</div>
    {/if}

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-bold text-white text-lg leading-tight">
          {component.label || component.asset_id || origType?.name || component.type_code}
        </span>
        {#if component.label && component.asset_id}
          <span class="text-sm text-slate-500 font-mono">{component.asset_id}</span>
        {/if}
        {#if dirty}
          <span class="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            unsaved changes
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-2 mt-0.5 flex-wrap">
        {#if floor}
          <span class="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-700 border border-slate-600 text-slate-400"
                title={floor.name}>{floor.short_name}</span>
        {/if}
        <span class="text-sm text-slate-400">{origType?.name ?? component.type_code}</span>
        {#if component.primary_attribute}
          <span class="text-sm text-yellow-300 font-medium">★ {component.primary_attribute}</span>
        {/if}
      </div>
    </div>

    <button
      on:click={() => dispatch('close')}
      class="text-slate-500 hover:text-white transition-colors text-xl leading-none shrink-0"
      title="Close"
    >✕</button>
  </div>

  <!-- ── Scrollable body ─────────────────────────────────────────── -->
  <div class="flex-1 overflow-y-auto p-5 space-y-6">

    {#if errorMsg}
      <div class="px-4 py-2.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-sm flex justify-between items-start gap-2">
        <span>{errorMsg}</span>
        <button on:click={() => errorMsg = ''} class="shrink-0 text-red-500 hover:text-red-300">✕</button>
      </div>
    {/if}

    <!-- ── Location ──────────────────────────────────────────────── -->
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
            <input type="number" min="0" max="1" step="0.01"
              bind:value={xPosition} on:input={markDirty} class="{inp} w-32" />
          </div>
          <div class="flex flex-col gap-1">
            <p class="text-xs text-slate-500">Y Position</p>
            <input type="number" min="0" max="1" step="0.01"
              bind:value={yPosition} on:input={markDirty} class="{inp} w-32" />
          </div>
        </div>
      {/if}
    </section>

    <!-- ── Identity ──────────────────────────────────────────────── -->
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

    <!-- ── Status ────────────────────────────────────────────────── -->
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

    <!-- ── Attribute values ───────────────────────────────────────── -->
    {#if defs.length > 0}
      <section>
        <p class={sec}>
          {selectedType?.name ?? 'Type'} Attributes
          {#if primaryDef && primaryAttr}
            <span class="font-normal normal-case text-yellow-400 ml-2">★ {primaryAttr}</span>
          {/if}
        </p>
        <div class="flex flex-col gap-4">
          {#each defs as def (def.id)}
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
      </section>
    {:else if selectedTypeId}
      <p class="text-xs text-slate-600 italic">No attribute definitions for this type.</p>
    {/if}

    <!-- ── Notes ─────────────────────────────────────────────────── -->
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

    <!-- ── Linked component ref ───────────────────────────────────── -->
    <section>
      <p class={sec}>
        Linked Component
        <span class="font-normal normal-case text-slate-600 ml-1">— cross-reference to a related component</span>
      </p>
      <input
        type="text"
        bind:value={linkedComponentRef}
        on:input={markDirty}
        list="detail-component-refs"
        placeholder="e.g. LH / G / Fire Door / FD-042"
        class="{inp} font-mono placeholder-slate-600"
      />
      <datalist id="detail-component-refs">
        {#each refOptions as ref}
          <option value={ref}></option>
        {/each}
      </datalist>
      {#if linkedComponentRef.trim()}
        <p class="text-xs text-slate-500 mt-1">
          → <span class="text-purple-400 font-mono">"{linkedComponentRef.trim()}"</span>
        </p>
      {/if}
    </section>

    <!-- ── Last inspection ────────────────────────────────────────── -->
    <section class="border border-slate-700 rounded-lg p-4 bg-slate-800/30">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p class="{sec} mb-1">Last Inspection</p>
          {#if inspection}
            {@const iDate = new Date(inspection.inspected_at)}
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-sm text-slate-300">
                {iDate.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
              </span>
              <span class="text-xs px-2 py-0.5 rounded font-medium
                {inspection.inspection_result === 'OK'       ? 'bg-green-600/30 text-green-400'   :
                 inspection.inspection_result === 'problem'  ? 'bg-yellow-600/30 text-yellow-400' :
                 inspection.inspection_result === 'failed'   ? 'bg-red-600/30 text-red-400'       :
                                                               'bg-slate-700 text-slate-400'}">
                {inspection.inspection_result}
              </span>
              {#if inspection.inspector_notes}
                <span class="text-xs text-slate-500 italic truncate max-w-[200px]"
                      title={inspection.inspector_notes}>
                  "{inspection.inspector_notes}"
                </span>
              {/if}
            </div>
          {:else}
            <p class="text-sm text-slate-500 italic">Not yet inspected.</p>
          {/if}
        </div>
        <button
          on:click={handleInspect}
          class="text-sm px-3 py-1.5 rounded-lg bg-purple-600/80 hover:bg-purple-600
                 text-white transition-colors shrink-0"
        >
          Record Inspection →
        </button>
      </div>
    </section>

    <!-- ── Metadata ───────────────────────────────────────────────── -->
    <section class="text-xs text-slate-600 space-y-0.5 pb-1">
      <p>ID <span class="font-mono text-slate-500">{component.id}</span></p>
      <p>Created   <span class="text-slate-500">{fmt(component.created_at)}</span></p>
      {#if component.updated_at}
        <p>Updated   <span class="text-slate-500">{fmt(component.updated_at)}</span></p>
      {/if}
    </section>

  </div><!-- end scrollable body -->

  <!-- ── Sticky footer actions ──────────────────────────────────── -->
  <div class="p-5 pt-4 border-t border-slate-700 shrink-0">

    {#if confirmDel}
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
      <button
        on:click={() => confirmDel = true}
        class="text-sm px-3 py-1.5 rounded-lg text-slate-500 hover:text-red-400
               hover:bg-red-900/20 transition-colors border border-transparent
               hover:border-red-900/30"
        title="Delete component"
      >Delete</button>

      <div class="ml-auto flex gap-2">
        <button
          on:click={() => dispatch('close')}
          class="px-4 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
        >Cancel</button>
        <button
          on:click={handleSave}
          disabled={saving || !dirty}
          class="px-5 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500
                 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
        >{saving ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </div>
  </div>

</div>
