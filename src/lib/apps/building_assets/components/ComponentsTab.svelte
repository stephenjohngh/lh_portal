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
  let floorPreset     = 'all';   // 'all' | 'residential' | 'basement' | 'single'
  let filterFloorId   = '';
  let filterSystemIds = new Set();   // empty = all systems
  let filterTypeCodes = new Set();
  let filterStatuses  = new Set();
  let searchQuery     = '';

  // Remove type selections that no longer belong to any selected system.
  $: if (filterSystemIds.size > 0 && types.length > 0 && filterTypeCodes.size > 0) {
    const validCodes = new Set(
      types.filter(t => filterSystemIds.has(t.building_system_id)).map(t => t.code)
    );
    const hasInvalid = [...filterTypeCodes].some(c => !validCodes.has(c));
    if (hasInvalid) filterTypeCodes = new Set([...filterTypeCodes].filter(c => validCodes.has(c)));
  }

  // -- Preset state --------------------------------------------------
  let presets      = [];
  let savingPreset = false;

  onMount(async () => {
    try { presets = await loadPresets(); } catch { /* non-critical */ }
  });

  // Live snapshot passed to preset bar for active-highlight + "Save as…" capture.
  $: currentConfig = {
    filters: {
      floorPreset,
      filterFloorId,
      filterSystemIds: [...filterSystemIds],
      filterTypeCodes: [...filterTypeCodes],
      filterStatuses:  [...filterStatuses],
      searchQuery,
    },
    columns: { showNotes, showLinked, showInspectionNotes, view },
  };

  function applyPreset(e) {
    const { filters: f, columns: c } = e.detail;
    floorPreset   = f.floorPreset   ?? 'all';
    filterFloorId = f.filterFloorId ?? '';
    searchQuery   = f.searchQuery   ?? '';
    // Support both new (arrays) and legacy single-value preset formats
    filterSystemIds = new Set(f.filterSystemIds ?? (f.filterSystemId ? [f.filterSystemId] : []));
    filterTypeCodes = new Set(f.filterTypeCodes ?? (f.filterTypeCode ? [f.filterTypeCode] : []));
    filterStatuses  = new Set(f.filterStatuses  ?? (f.filterStatus  ? [f.filterStatus]  : []));
    showNotes           = c.showNotes;
    showLinked          = c.showLinked;
    showInspectionNotes = c.showInspectionNotes;
    view                = c.view ?? 'list';
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
  let view                = 'list';   // 'list' | 'summary' — owned here so presets can restore it

  // -- All canonical component status values (always shown in full) --
  const ALL_STATUSES = ['ok', 'failed', 'problem', 'inactive'];

  // -- Multi-select dropdown state -----------------------------------
  let openDropdown = null;   // 'system' | 'type' | 'status' | null

  function toggleSystem(id) {
    filterSystemIds = new Set(filterSystemIds);
    if (filterSystemIds.has(id)) filterSystemIds.delete(id);
    else filterSystemIds.add(id);
  }
  function toggleType(code) {
    filterTypeCodes = new Set(filterTypeCodes);
    if (filterTypeCodes.has(code)) filterTypeCodes.delete(code);
    else filterTypeCodes.add(code);
  }
  function toggleStatus(s) {
    filterStatuses = new Set(filterStatuses);
    if (filterStatuses.has(s)) filterStatuses.delete(s);
    else filterStatuses.add(s);
  }

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
    if (filterSystemIds.size > 0) {
      const systemTypeCodes = new Set(
        types.filter(t => filterSystemIds.has(t.building_system_id)).map(t => t.code)
      );
      list = list.filter(c => systemTypeCodes.has(c.type_code));
    }

    // Type
    if (filterTypeCodes.size > 0) list = list.filter(c => filterTypeCodes.has(c.type_code));

    // Status
    if (filterStatuses.size > 0) list = list.filter(c => filterStatuses.has((c.status || 'ok').toLowerCase()));

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

  // Types for the dropdown: filtered to selected system when one is set,
  // otherwise all types sorted by system presentation_order then type presentation_order.
  // Both arrays come from the store pre-sorted by presentation_order, so
  // building index maps gives a stable, cheap comparator.
  $: systemOrderIndex = Object.fromEntries(systems.map((s, i) => [s.id, i]));
  $: typeOrderIndex   = Object.fromEntries(types.map((t, i) => [t.code, i]));
  $: typesForSystem = filterSystemIds.size > 0
    ? types.filter(t => filterSystemIds.has(t.building_system_id))
    : [...types].sort((a, b) => {
        const sd = (systemOrderIndex[a.building_system_id] ?? 999)
                 - (systemOrderIndex[b.building_system_id] ?? 999);
        if (sd !== 0) return sd;
        return (typeOrderIndex[a.code] ?? 999) - (typeOrderIndex[b.code] ?? 999);
      });

  function clearFilters() {
    floorPreset     = 'all';
    filterFloorId   = '';
    filterSystemIds = new Set();
    filterTypeCodes = new Set();
    filterStatuses  = new Set();
    searchQuery     = '';
  }

  $: hasFilters = floorPreset !== 'all' || filterSystemIds.size > 0 || filterTypeCodes.size > 0 || filterStatuses.size > 0 || searchQuery.trim();
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
        {types} {floors}
        {attrDefs} {attrOptions} {components}
        attrs={componentAttrs[editingComponent.id] ?? []}
        on:close={() => editingComponent = null}
      />
    {:else}
      <ComponentDetailPanel
        component={editingComponent}
        {types} {systems} {floors} {plans}
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
      bind:view
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

        <!-- System filter — multi-select dropdown -->
        <div class="flex flex-col gap-1 relative">
          <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">System</p>
          <button
            on:click={() => openDropdown = openDropdown === 'system' ? null : 'system'}
            class="bg-slate-700 border rounded px-3 py-1.5 text-xs text-white
                   focus:outline-none min-w-[130px] flex items-center justify-between gap-2 text-left
                   {filterSystemIds.size > 0 ? 'border-purple-500/70' : 'border-slate-600 hover:border-slate-500'}"
          >
            <span class="truncate">
              {#if filterSystemIds.size === 0}All systems
              {:else if filterSystemIds.size === 1}{systems.find(s => filterSystemIds.has(s.id))?.name ?? '1 selected'}
              {:else}{filterSystemIds.size} systems{/if}
            </span>
            <span class="text-slate-500 shrink-0 text-[10px]">▾</span>
          </button>
          {#if openDropdown === 'system'}
            <div class="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-600
                        rounded-lg shadow-xl min-w-max py-1 max-h-64 overflow-y-auto">
              {#each systems as s (s.id)}
                <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700/80 cursor-pointer">
                  <input type="checkbox" checked={filterSystemIds.has(s.id)}
                         on:change={() => toggleSystem(s.id)}
                         class="rounded accent-purple-500 shrink-0" />
                  <span class="text-xs text-slate-300 whitespace-nowrap">{s.name}</span>
                </label>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Type filter — multi-select dropdown, grouped by system when unfiltered -->
        <div class="flex flex-col gap-1 relative">
          <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Type</p>
          <button
            on:click={() => openDropdown = openDropdown === 'type' ? null : 'type'}
            class="bg-slate-700 border rounded px-3 py-1.5 text-xs text-white
                   focus:outline-none min-w-[130px] flex items-center justify-between gap-2 text-left
                   {filterTypeCodes.size > 0 ? 'border-purple-500/70' : 'border-slate-600 hover:border-slate-500'}"
          >
            <span class="truncate">
              {#if filterTypeCodes.size === 0}All types
              {:else if filterTypeCodes.size === 1}{types.find(t => filterTypeCodes.has(t.code))?.name ?? '1 selected'}
              {:else}{filterTypeCodes.size} types{/if}
            </span>
            <span class="text-slate-500 shrink-0 text-[10px]">▾</span>
          </button>
          {#if openDropdown === 'type'}
            <div class="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-600
                        rounded-lg shadow-xl min-w-max py-1 max-h-72 overflow-y-auto">
              {#if filterSystemIds.size > 0}
                <!-- Flat list scoped to selected systems -->
                {#each typesForSystem as t (t.code)}
                  <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700/80 cursor-pointer">
                    <input type="checkbox" checked={filterTypeCodes.has(t.code)}
                           on:change={() => toggleType(t.code)}
                           class="rounded accent-purple-500 shrink-0" />
                    <span class="text-xs text-slate-300 whitespace-nowrap">{t.name}</span>
                  </label>
                {/each}
              {:else}
                <!-- Grouped by system -->
                {#each systems as s (s.id)}
                  {@const sysTypes = typesForSystem.filter(t => t.building_system_id === s.id)}
                  {#if sysTypes.length > 0}
                    <div class="px-3 pt-2 pb-0.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium
                                border-b border-slate-700/60 first:pt-1">
                      {s.name}
                    </div>
                    {#each sysTypes as t (t.code)}
                      <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700/80 cursor-pointer">
                        <input type="checkbox" checked={filterTypeCodes.has(t.code)}
                               on:change={() => toggleType(t.code)}
                               class="rounded accent-purple-500 shrink-0" />
                        <span class="text-xs text-slate-300 whitespace-nowrap">{t.name}</span>
                      </label>
                    {/each}
                  {/if}
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Status filter — multi-select dropdown -->
        <div class="flex flex-col gap-1 relative">
          <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Status</p>
          <button
            on:click={() => openDropdown = openDropdown === 'status' ? null : 'status'}
            class="bg-slate-700 border rounded px-3 py-1.5 text-xs text-white
                   focus:outline-none min-w-[100px] flex items-center justify-between gap-2 text-left
                   {filterStatuses.size > 0 ? 'border-purple-500/70' : 'border-slate-600 hover:border-slate-500'}"
          >
            <span class="truncate">
              {#if filterStatuses.size === 0}All statuses
              {:else if filterStatuses.size === 1}{[...filterStatuses][0]}
              {:else}{filterStatuses.size} statuses{/if}
            </span>
            <span class="text-slate-500 shrink-0 text-[10px]">▾</span>
          </button>
          {#if openDropdown === 'status'}
            <div class="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-600
                        rounded-lg shadow-xl min-w-max py-1">
              {#each ALL_STATUSES as s}
                <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700/80 cursor-pointer">
                  <input type="checkbox" checked={filterStatuses.has(s)}
                         on:change={() => toggleStatus(s)}
                         class="rounded accent-purple-500 shrink-0" />
                  <span class="text-xs text-slate-300 whitespace-nowrap">{s}</span>
                </label>
              {/each}
            </div>
          {/if}
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
          {#if filterSystemIds.size > 0}
            {@const names = systems.filter(s => filterSystemIds.has(s.id)).map(s => s.name)}
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                         bg-slate-700 text-slate-300 border border-slate-600">
              System: {names.join(', ')}
            </span>
          {/if}
          {#if filterTypeCodes.size > 0}
            {@const names = types.filter(t => filterTypeCodes.has(t.code)).map(t => t.name)}
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                         bg-slate-700 text-slate-300 border border-slate-600">
              Type: {names.join(', ')}
            </span>
          {/if}
          {#if filterStatuses.size > 0}
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                         bg-slate-700 text-slate-300 border border-slate-600">
              Status: {[...filterStatuses].join(', ')}
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

      <!-- Backdrop — closes any open multi-select dropdown on outside click -->
      {#if openDropdown}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="fixed inset-0 z-40" on:click={() => openDropdown = null}></div>
      {/if}

      </svelte:fragment>
    </ComponentInventoryTable>
  {/if}
{/if}
