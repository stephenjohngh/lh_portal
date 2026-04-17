<!-- src/lib/apps/building_assets/components/ComponentsTab.svelte -->
<!-- Components tab: list, create, detail-edit, and inspect components.
     Reads all data from buildingAssetsStore directly.
     Uses ComponentInventoryTable for the shared list/summary view.
     Floor presets: All · Residential (G–7) · Basement (X,L,G) · Single floor. -->

<script>
  import { onMount }             from 'svelte';
  import { buildingAssetsStore } from '../stores/buildingAssetsStore.js';
  import { permissions }         from '$lib/stores/permissions';
  import { auth }                from '$lib/stores/auth.js';
  import {
    loadPresets, createPreset, removePreset,
  } from '../componentPresets.js';

  import ComponentInventoryTable from './ComponentInventoryTable.svelte';
  import ComponentPresetBar      from './ComponentPresetBar.svelte';
  import ComponentForm           from './ComponentForm.svelte';
  import ComponentDetailPanel    from './ComponentDetailPanel.svelte';
  import ComponentDetailView     from './ComponentDetailView.svelte';
  import InspectionPanel         from './InspectionPanel.svelte';

  // -- Store bindings ------------------------------------------------
  $: store          = $buildingAssetsStore;
  $: facilities     = store.facilities;
  $: floors         = store.floors;
  $: systems        = store.systems;
  $: types          = store.types;
  $: attrDefs       = store.attrDefs;
  $: attrOptions    = store.attrOptions;
  $: plans          = store.plans;
  $: components     = store.components;
  $: componentAttrs = store.componentAttrs;
  $: inspections    = store.inspections;

  // -- Floor presets -------------------------------------------------
  // short_name sets that define each preset
  const RESIDENTIAL_SHORT = new Set(['G','1','2','3','4','5','6','7']);
  const BASEMENT_SHORT    = new Set(['X','L','G']);

  // -- Filter state --------------------------------------------------
  let floorPreset    = 'all';   // 'all' | 'residential' | 'basement' | 'single'
  let filterFloorId  = '';
  let filterSystemId = '';      // '' = all systems
  let filterTypeCode = '';
  let filterStatus   = '';
  let searchQuery    = '';

  // Clear type filter when system changes — but only if the current type doesn't
  // belong to the newly selected system (preserves presets that set both system + type).
  $: if (filterSystemId && types.length > 0) {
    const validCodes = new Set(
      types.filter(t => t.building_system_id === filterSystemId).map(t => t.code)
    );
    if (filterTypeCode && !validCodes.has(filterTypeCode)) filterTypeCode = '';
  }

  // -- Preset state --------------------------------------------------
  let presets      = [];
  let savingPreset = false;

  onMount(async () => {
    try { presets = await loadPresets(); } catch { /* non-critical */ }
  });

  // Live snapshot passed to preset bar for active-highlight + "Save as…" capture.
  $: currentConfig = {
    filters: { floorPreset, filterFloorId, filterSystemId, filterTypeCode, filterStatus, searchQuery },
    columns: { showNotes, showLinked, showInspectionNotes },
  };

  function applyPreset(e) {
    const { filters: f, columns: c } = e.detail;
    floorPreset    = f.floorPreset;
    filterFloorId  = f.filterFloorId;
    filterSystemId = f.filterSystemId;
    filterTypeCode = f.filterTypeCode;
    filterStatus   = f.filterStatus;
    searchQuery    = f.searchQuery;
    showNotes           = c.showNotes;
    showLinked          = c.showLinked;
    showInspectionNotes = c.showInspectionNotes;
  }

  async function handleSavePreset(e) {
    const { name, filters, columns, sortOrder } = e.detail;
    savingPreset = true;
    try {
      const preset = await createPreset(name, filters, columns, $auth.user.id, sortOrder);
      presets = [...presets, preset];
    } catch (err) {
      errorMsg = `Could not save preset: ${err.message}`;
    } finally {
      savingPreset = false;
    }
  }

  async function handleDeletePreset(e) {
    try {
      await removePreset(e.detail.id);
      presets = presets.filter(p => p.id !== e.detail.id);
    } catch (err) {
      errorMsg = `Could not delete preset: ${err.message}`;
    }
  }

  // -- UI state ------------------------------------------------------
  let showForm              = false;
  let saving                = false;
  let errorMsg              = '';
  let editingComponent      = null;
  let inspectingComponent   = null;
  let showNotes           = true;
  let showLinked          = true;
  let showInspectionNotes = false;

  // -- Derived: unique statuses present in components ----------------
  $: allStatuses = [...new Set(components.map(c => (c.status || 'ok').toLowerCase()))].sort();

  // -- Floor sets for presets ----------------------------------------
  $: residentialFloorIds = new Set(floors.filter(f => RESIDENTIAL_SHORT.has(f.short_name)).map(f => f.id));
  $: basementFloorIds    = new Set(floors.filter(f => BASEMENT_SHORT.has(f.short_name)).map(f => f.id));

  // -- Filtered component list ---------------------------------------
  $: filteredComponents = (() => {
    let list = components;

    // Floor preset
    if (floorPreset === 'residential') {
      list = list.filter(c => residentialFloorIds.has(c.floor_id));
    } else if (floorPreset === 'basement') {
      list = list.filter(c => basementFloorIds.has(c.floor_id));
    } else if (floorPreset === 'single' && filterFloorId) {
      list = list.filter(c => c.floor_id === filterFloorId);
    }

    // System (filter via type's building_system_id)
    if (filterSystemId) {
      const systemTypeCodes = new Set(types.filter(t => t.building_system_id === filterSystemId).map(t => t.code));
      list = list.filter(c => systemTypeCodes.has(c.type_code));
    }

    // Type
    if (filterTypeCode) list = list.filter(c => c.type_code === filterTypeCode);

    // Status
    if (filterStatus) list = list.filter(c => (c.status || 'ok').toLowerCase() === filterStatus);

    // Search (asset_id, label, linked_component_ref)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(c =>
        (c.asset_id  ?? '').toLowerCase().includes(q) ||
        (c.label     ?? '').toLowerCase().includes(q) ||
        (c.linked_component_ref ?? '').toLowerCase().includes(q)
      );
    }

    return list;
  })();

  // -- Active filter label (for table title) -------------------------
  $: floorLabel = (() => {
    if (floorPreset === 'residential') return 'Residential (G–7)';
    if (floorPreset === 'basement')    return 'Basement (X, L, G)';
    if (floorPreset === 'single' && filterFloorId) {
      const fl = floors.find(f => f.id === filterFloorId);
      return fl ? `${fl.name} (${fl.short_name})` : 'Single floor';
    }
    return 'All floors';
  })();

  // -- Inspection helpers --------------------------------------------
  $: inspectingType = inspectingComponent
    ? (types.find(t => t.code === inspectingComponent.type_code) ?? null) : null;
  $: inspectingCheckable = inspectingType
    ? (attrDefs[inspectingType.id] ?? []).filter(d => d.checkable && d.visible) : [];
  $: inspectingLastInspection = inspectingComponent
    ? (inspections[inspectingComponent.id] ?? null) : null;

  // -- Handlers -----------------------------------------------------
  async function handleSubmit(e) {
    const { fields, attrValues } = e.detail;
    saving = true; errorMsg = '';
    try {
      await buildingAssetsStore.createComponent(fields, attrValues);
      showForm = false;
      await buildingAssetsStore.loadComponents();
    } catch (err) { errorMsg = err.message; }
    finally       { saving = false; }
  }

  function handleDetailSaved() {
    editingComponent = $buildingAssetsStore.components.find(c => c.id === editingComponent?.id) ?? null;
    errorMsg = '';
  }

  function handleDetailInspect(e) {
    inspectingComponent = e.detail.component;
    editingComponent    = null;
    errorMsg            = '';
  }

  async function handleDelete(e) {
    try {
      await buildingAssetsStore.deleteComponent(e.detail.component.id);
      if (editingComponent?.id    === e.detail.component.id) editingComponent    = null;
      if (inspectingComponent?.id === e.detail.component.id) inspectingComponent = null;
    } catch (err) { errorMsg = err.message; }
  }

  // Types filtered to selected system (for the type dropdown)
  $: typesForSystem = filterSystemId
    ? types.filter(t => t.building_system_id === filterSystemId)
    : types;

  function clearFilters() {
    floorPreset    = 'all';
    filterFloorId  = '';
    filterSystemId = '';
    filterTypeCode = '';
    filterStatus   = '';
    searchQuery    = '';
  }

  $: hasFilters = floorPreset !== 'all' || filterSystemId || filterTypeCode || filterStatus || searchQuery.trim();
  $: readOnly = !$permissions.isAdmin && !$permissions.canModify;
</script>

<!-- Error banner -->
{#if errorMsg}
  <div class="mb-4 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-sm">
    {errorMsg}
    <button class="ml-2 underline" on:click={() => errorMsg = ''}>dismiss</button>
  </div>
{/if}

{#if inspectingComponent}
  <div class="max-w-xl">
    <InspectionPanel
      component={inspectingComponent}
      typeConfig={inspectingType}
      checkableAttrs={inspectingCheckable}
      lastInspection={inspectingLastInspection}
      on:saved={() => inspectingComponent = null}
      on:close={() => inspectingComponent = null}
    />
  </div>

{:else if editingComponent}
  <div class="max-w-2xl">
    {#if readOnly}
      <ComponentDetailView
        component={editingComponent}
        {types} {floors} {facilities}
        {attrDefs} {attrOptions} {components}
        attrs={componentAttrs[editingComponent.id] ?? []}
        on:close={() => editingComponent = null}
      />
    {:else}
      <ComponentDetailPanel
        component={editingComponent}
        {types} {systems} {floors} {facilities} {plans}
        {attrDefs} {attrOptions} {components}
        attrs={componentAttrs[editingComponent.id] ?? []}
        on:saved={handleDetailSaved}
        on:close={() => editingComponent = null}
        on:inspect={handleDetailInspect}
        on:deleted={() => editingComponent = null}
      />
    {/if}
  </div>

{:else if showForm}
  <div class="max-w-2xl bg-slate-800 rounded-xl border border-slate-700 p-6">
    <ComponentForm
      {types} {systems} {attrDefs} {attrOptions}
      {plans} {floors} {facilities}
      {saving}
      on:submit={handleSubmit}
      on:cancel={() => { showForm = false; errorMsg = ''; }}
    />
  </div>

{:else}
  <!-- New Component button -->
  {#if !readOnly}
  <div class="flex justify-end mb-3">
    <button
      on:click={() => { showForm = true; errorMsg = ''; }}
      disabled={floors.length === 0 || types.length === 0}
      class="px-4 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500
             disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors
             flex items-center gap-2"
    >
      <span>+</span> New Component
    </button>
  </div>
  {/if}

  {#if store.loadingComponents}
    <p class="text-slate-500 text-sm">Loading components…</p>

  {:else if components.length === 0}
    <div class="text-center py-16 text-slate-500">
      <p class="text-4xl mb-3">🧩</p>
      <p class="text-lg mb-1">No components yet</p>
      <p class="text-sm">
        {floors.length === 0
          ? 'Run migrations 014–016 to set up the location hierarchy.'
          : 'Click "New Component" to create one.'}
      </p>
    </div>

  {:else}
    <ComponentInventoryTable
      components={filteredComponents}
      {componentAttrs}
      componentLinks={store.componentLinks}
      {attrDefs}
      {types}
      {systems}
      {floors}
      {inspections}
      {showNotes}
      {showLinked}
      {showInspectionNotes}
      title="Components"
      {readOnly}
      on:selectcomponent={e => { editingComponent = e.detail.component; errorMsg = ''; }}
      on:deletecomponent={handleDelete}
      on:inspect={e => { inspectingComponent = e.detail.component; editingComponent = null; errorMsg = ''; }}
    >
      <!-- -- Filters slot — rendered inside the card header ------- -->
      <svelte:fragment slot="filters">

      <!-- Preset bar -->
      <ComponentPresetBar
        {currentConfig}
        {presets}
        saving={savingPreset}
        on:apply={applyPreset}
        on:savepreset={handleSavePreset}
        on:deletepreset={handleDeletePreset}
      />

      <!-- Filter controls -->
      <div class="px-4 py-3 border-b border-slate-700 flex flex-wrap gap-3 items-end bg-slate-800/60">

        <!-- Floor scope -->
        <div class="flex flex-col gap-1">
          <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Floor</p>
          <div class="flex rounded-lg overflow-hidden border border-slate-600 text-xs">
            {#each [
              { id: 'all',         label: 'All' },
              { id: 'residential', label: 'Residential' },
              { id: 'basement',    label: 'Basement' },
              { id: 'single',      label: 'Single…' },
            ] as p (p.id)}
              <button
                on:click={() => { floorPreset = p.id; if (p.id !== 'single') filterFloorId = ''; }}
                class="px-3 py-1.5 border-l border-slate-600 first:border-l-0 transition-colors
                       {floorPreset === p.id
                         ? 'bg-purple-600 text-white font-medium'
                         : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}"
              >{p.label}</button>
            {/each}
          </div>
        </div>

        <!-- Single floor picker (only when preset = single) -->
        {#if floorPreset === 'single'}
          <div class="flex flex-col gap-1">
            <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Select floor</p>
            <select
              bind:value={filterFloorId}
              class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-xs text-white
                     focus:outline-none focus:border-purple-500"
            >
              <option value="">— pick a floor —</option>
              {#each floors as f}
                <option value={f.id}>{f.name} ({f.short_name})</option>
              {/each}
            </select>
          </div>
        {/if}

        <!-- System filter -->
        <div class="flex flex-col gap-1">
          <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">System</p>
          <select
            bind:value={filterSystemId}
            class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-xs text-white
                   focus:outline-none focus:border-purple-500 min-w-[130px]"
          >
            <option value="">All systems</option>
            {#each systems as s (s.id)}
              <option value={s.id}>{s.name}</option>
            {/each}
          </select>
        </div>

        <!-- Type filter (scoped to selected system) -->
        <div class="flex flex-col gap-1">
          <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Type</p>
          <select
            bind:value={filterTypeCode}
            class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-xs text-white
                   focus:outline-none focus:border-purple-500 min-w-[130px]"
          >
            <option value="">All types</option>
            {#each typesForSystem as t (t.code)}
              <option value={t.code}>{t.name}</option>
            {/each}
          </select>
        </div>

        <!-- Status filter -->
        <div class="flex flex-col gap-1">
          <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Status</p>
          <select
            bind:value={filterStatus}
            class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-xs text-white
                   focus:outline-none focus:border-purple-500"
          >
            <option value="">All statuses</option>
            {#each allStatuses as s}
              <option value={s}>{s}</option>
            {/each}
          </select>
        </div>

        <!-- Search -->
        <div class="flex flex-col gap-1 w-28">
          <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Search</p>
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Ref, label…"
            class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-xs text-white
                   placeholder:text-slate-500 focus:outline-none focus:border-purple-500 w-full"
          />
        </div>

        <!-- Column toggles -->
        <div class="flex flex-col gap-1 self-end pb-1.5">
          <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Columns</p>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 cursor-pointer
                           text-xs text-slate-400 hover:text-slate-300 transition-colors">
              <input type="checkbox" bind:checked={showLinked}
                     class="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700
                            accent-purple-500 cursor-pointer" />
              Linked
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer
                           text-xs text-slate-400 hover:text-slate-300 transition-colors">
              <input type="checkbox" bind:checked={showNotes}
                     class="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700
                            accent-purple-500 cursor-pointer" />
              Notes
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer
                           text-xs text-slate-400 hover:text-slate-300 transition-colors">
              <input type="checkbox" bind:checked={showInspectionNotes}
                     class="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700
                            accent-purple-500 cursor-pointer" />
              Insp. Notes
            </label>
          </div>
        </div>

        <!-- Clear filters -->
        {#if hasFilters}
          <button
            on:click={clearFilters}
            class="text-xs text-purple-400 hover:text-purple-300 transition-colors self-end pb-1.5"
          >Clear</button>
        {/if}

        <!-- Active filter summary -->
        <div class="w-full flex flex-wrap gap-1.5 mt-0.5">
          {#if floorPreset !== 'all'}
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                         bg-purple-900/40 text-purple-300 border border-purple-700/40">
              {floorLabel}
            </span>
          {/if}
          {#if filterSystemId}
            {@const sn = systems.find(s => s.id === filterSystemId)?.name ?? '?'}
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                         bg-slate-700 text-slate-300 border border-slate-600">
              System: {sn}
            </span>
          {/if}
          {#if filterTypeCode}
            {@const tn = types.find(t => t.code === filterTypeCode)?.name ?? filterTypeCode}
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                         bg-slate-700 text-slate-300 border border-slate-600">
              Type: {tn}
            </span>
          {/if}
          {#if filterStatus}
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                         bg-slate-700 text-slate-300 border border-slate-600">
              Status: {filterStatus}
            </span>
          {/if}
          {#if searchQuery.trim()}
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                         bg-slate-700 text-slate-300 border border-slate-600">
              "{searchQuery.trim()}"
            </span>
          {/if}
        </div>

      </div>

      </svelte:fragment>
    </ComponentInventoryTable>
  {/if}
{/if}
