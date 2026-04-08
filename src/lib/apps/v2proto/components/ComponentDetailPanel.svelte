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
  import { api } from '$lib/utils/api';

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

  const dispatch = createEventDispatcher();

  // ── Edit state (initialised from props) ─────────────────────────────
  let selectedFloorId    = component.floor_id      ?? '';
  let planId             = component.plan_id        ?? '';
  let selectedTypeId     = typeByCode(types, component.type_code)?.id ?? '';
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
  let showWalkAttrs = false;  // toggle for checkable (walk checklist) attributes

  // ── loadedId pattern: re-initialise form whenever the selected component changes ──
  let loadedId = component.id;
  $: if (component.id !== loadedId) {
    loadedId           = component.id;
    selectedFloorId    = component.floor_id             ?? '';
    planId             = component.plan_id              ?? '';
    selectedTypeId     = typeByCode(types, component.type_code)?.id ?? '';
    label              = component.label                ?? '';
    assetId            = component.asset_id             ?? '';
    status             = component.status               ?? 'OK';
    notes              = component.notes                ?? '';
    linkedComponentRef = component.linked_component_ref ?? '';
    xPosition          = component.x_position           ?? 0.5;
    yPosition          = component.y_position           ?? 0.5;
    attrValues         = Object.fromEntries(attrs.map(a => [a.type_attribute_id, a.value]));
    dirty              = false;
    confirmDel         = false;
    errorMsg           = '';
    typeWarning        = false;
    showWalkAttrs      = false;
  }

  // ── Derived ──────────────────────────────────────────────────────────
  $: selectedType   = types.find(t => t.id === selectedTypeId) ?? null;
  $: floor          = floorById(floors, selectedFloorId);
  $: defs           = selectedTypeId ? (attrDefs[selectedTypeId] ?? []) : [];
  $: primaryDef     = defs.find(d => d.is_primary) ?? null;
  $: standardDefs   = defs.filter(d => !d.checkable);
  $: walkDefs       = defs.filter(d =>  d.checkable);
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
    typeWarning   = selectedTypeId !== (origType?.id ?? '');
    showWalkAttrs = false;
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
        x_position:           planId ? (Math.round((parseFloat(xPosition) || 0.5) * 1000) / 1000) : component.x_position,
        y_position:           planId ? (Math.round((parseFloat(yPosition) || 0.5) * 1000) / 1000) : component.y_position
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

  // ── Inspection history (last 5, latest first) ─────────────────────
  let recentInspections   = [];
  let loadingInspections  = false;

  async function loadInspectionHistory(componentId) {
    loadingInspections = true;
    recentInspections  = [];
    try {
      recentInspections = await api.get('component_inspections', {
        filters:   { component_id: componentId },
        orderBy:   'inspected_at',
        ascending: false,
        limit:     5,
      });
    } catch (_) {
      recentInspections = [];
    } finally {
      loadingInspections = false;
    }
  }

  // Reload whenever the selected component changes (reuses the loadedId sentinel)
  $: loadInspectionHistory(component.id);

  function resultBadgeClass(r) {
    return r === 'ok'       ? 'bg-green-600/30 text-green-400 border-green-700/40'  :
           r === 'failed'   ? 'bg-red-600/30 text-red-400 border-red-700/40'        :
           r === 'problem'  ? 'bg-amber-600/30 text-amber-400 border-amber-700/40'  :
                              'bg-slate-700/60 text-slate-400 border-slate-600/40';
  }
  function resultText(r) {
    return { ok: '✓ PASS', failed: '✗ FAIL', problem: '⚙ PROBLEM', inactive: '— INACTIVE' }[r] ?? (r ?? '—');
  }
</script>

<!-- Outer scroll container -->
<div class="bg-slate-800 rounded-xl border border-slate-700 flex flex-col max-h-[90vh]">

  <!-- ── Sticky header ───────────────────────────────────────────── -->
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
        <div class="flex items-center justify-between gap-2 mb-3">
          <p class="{sec} mb-0">
            {selectedType?.name ?? 'Type'} Attributes
            {#if primaryDef && primaryAttr}
              <span class="font-normal normal-case text-yellow-400 ml-2">★ {primaryAttr}</span>
            {/if}
          </p>
          {#if walkDefs.length > 0}
            <button
              on:click={() => showWalkAttrs = !showWalkAttrs}
              class="text-xs px-2 py-0.5 rounded border transition-colors shrink-0
                     {showWalkAttrs
                       ? 'bg-purple-600/30 border-purple-500/50 text-purple-300'
                       : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-slate-300'}"
            >Walk checklist ({walkDefs.length})</button>
          {/if}
        </div>

        <!-- Standard (non-checklist) attributes — always shown -->
        <div class="flex flex-col gap-4">
          {#each standardDefs as def (def.id)}
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

        <!-- Walk checklist attributes — shown only when toggled -->
        {#if showWalkAttrs && walkDefs.length > 0}
          <div class="mt-4 pt-3 border-t border-slate-700/60">
            <p class="text-xs text-purple-400/60 mb-3">Walk checklist attributes</p>
            <div class="flex flex-col gap-4">
              {#each walkDefs as def (def.id)}
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

    <!-- ── Inspection history ────────────────────────────────────── -->
    <section class="border border-slate-700 rounded-lg p-4 bg-slate-800/30">
      <p class="{sec} mb-3">Inspection History</p>

      {#if loadingInspections}
        <p class="text-sm text-slate-500 italic">Loading…</p>

      {:else if recentInspections.length === 0}
        <p class="text-sm text-slate-500 italic">Not yet inspected.</p>

      {:else}
        <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
          {#each recentInspections as insp (insp.id)}
            <div class="border border-slate-700/60 rounded-lg p-3 bg-slate-800/50">
              <div class="flex items-center gap-2 flex-wrap mb-1.5">
                <span class="text-xs text-slate-400 tabular-nums">{fmt(insp.inspected_at)}</span>
                <span class="text-xs px-2 py-0.5 rounded border font-medium {resultBadgeClass(insp.inspection_result)}">
                  {resultText(insp.inspection_result)}
                </span>
              </div>
              {#if insp.inspector_notes}
                <p class="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{insp.inspector_notes}</p>
              {:else}
                <p class="text-xs text-slate-600 italic">No notes recorded</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
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
