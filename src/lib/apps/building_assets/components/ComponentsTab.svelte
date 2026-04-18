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

  import { generateReportDocument } from './plan/reportGenerator.js';
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
  $: componentLinks = store.componentLinks;
  $: inspections    = store.inspections;

  // -- Floor presets -------------------------------------------------
  // short_name sets that define each preset
  const RESIDENTIAL_SHORT = new Set(['G','1','2','3','4','5','6','7']);
  const BASEMENT_SHORT    = new Set(['X','L','G']);

  // -- Filter state --------------------------------------------------
  let floorPreset     = 'all';   // 'all' | 'residential' | 'basement' | 'custom'
  let filterFloorIds  = new Set();   // only used when floorPreset === 'custom'
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
      filterFloorIds:  [...filterFloorIds],
      filterSystemIds: [...filterSystemIds],
      filterTypeCodes: [...filterTypeCodes],
      filterStatuses:  [...filterStatuses],
      searchQuery,
    },
    columns: { showNotes, showLinked, showInspectionNotes, view },
    report: {
      includePlan,
      includeList,
      includeFloorSummary,
      includeFullSummary,
      includeFullComponentList,
    },
  };

  function applyPreset(e) {
    const { filters: f, columns: c, report: r = {} } = e.detail;
    searchQuery   = f.searchQuery ?? '';
    // Floor — handle legacy 'single' preset (single filterFloorId string → Set)
    filterFloorIds = new Set(f.filterFloorIds ?? (f.filterFloorId ? [f.filterFloorId] : []));
    floorPreset    = f.floorPreset === 'single'
      ? (filterFloorIds.size > 0 ? 'custom' : 'all')
      : (f.floorPreset ?? 'all');
    // Support both new (arrays) and legacy single-value preset formats
    filterSystemIds = new Set(f.filterSystemIds ?? (f.filterSystemId ? [f.filterSystemId] : []));
    filterTypeCodes = new Set(f.filterTypeCodes ?? (f.filterTypeCode ? [f.filterTypeCode] : []));
    filterStatuses  = new Set(f.filterStatuses  ?? (f.filterStatus  ? [f.filterStatus]  : []));
    showNotes           = c.showNotes;
    showLinked          = c.showLinked;
    showInspectionNotes = c.showInspectionNotes;
    view                = c.view ?? 'list';
    // Restore report options (use defaults for presets saved before report was tracked)
    includePlan              = r.includePlan              ?? false;
    includeList              = r.includeList              ?? true;
    includeFloorSummary      = r.includeFloorSummary      ?? true;
    includeFullSummary       = r.includeFullSummary       ?? false;
    includeFullComponentList = r.includeFullComponentList ?? false;
  }

  async function handleSavePreset(e) {
    const { name, filters, columns, report, sortOrder } = e.detail;
    savingPreset = true;
    try {
      const preset = await createPreset(name, filters, columns, report, $auth.user.id, sortOrder);
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

  function toggleFloor(id) {
    filterFloorIds = new Set(filterFloorIds);
    if (filterFloorIds.has(id)) filterFloorIds.delete(id);
    else filterFloorIds.add(id);
    floorPreset = filterFloorIds.size > 0 ? 'custom' : 'all';
  }
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

  // -- Report state --------------------------------------------------
  let showReportPanel      = false;
  let includePlan              = false;
  let includeList              = true;
  let includeFloorSummary      = true;
  let includeFullSummary       = false;
  let includeFullComponentList = false;
  let generatingReport = false;
  let reportError      = '';

  $: reportNoneSelected = !includePlan && !includeList && !includeFloorSummary
                       && !includeFullSummary && !includeFullComponentList;

  // -- Report helpers (identical to V2ReportsTab) --------------------
  function typeOf(c)   { return types.find(t => t.code === c.type_code); }
  function systemOf(t) { return t ? systems.find(s => s.id === t.building_system_id) : null; }

  function resolveAttrs(c) {
    const t = typeOf(c);
    if (!t) return [];
    const defs      = attrDefs[t.id] ?? [];
    const stored    = componentAttrs[c.id] ?? [];
    const storedMap = {};
    for (const a of stored) storedMap[a.type_attribute_id] = a.value;
    return defs
      .filter(d => d.visible !== false && !d.checkable)
      .map(d => {
        const raw = storedMap[d.id] ?? d.default_value ?? null;
        if (raw == null || raw === '') return null;
        if (d.display_type === 'checkbox') {
          return raw === 'true' ? { name: d.name, value: 'Yes', display_type: 'checkbox' } : null;
        }
        const value = String(raw);
        if (value === 'None' || value === 'No' || value === 'Unknown') return null;
        return { name: d.name, value, display_type: d.display_type ?? 'text' };
      })
      .filter(Boolean);
  }

  // Group filteredComponents by floor (preserves floor level_order)
  $: filteredByFloor = (() => {
    const map = {};
    for (const c of filteredComponents) {
      if (!map[c.floor_id]) map[c.floor_id] = [];
      map[c.floor_id].push(c);
    }
    return floors
      .filter(f => map[f.id]?.length > 0)
      .map(f => ({ floor: f, components: map[f.id] }));
  })();

  // Human-readable filter description for the report document header
  $: reportFilterSummary = (() => {
    const parts = [];
    if (floorPreset === 'residential') parts.push('Floors: Residential');
    else if (floorPreset === 'basement') parts.push('Floors: Basement');
    else if (floorPreset === 'custom' && filterFloorIds.size > 0) {
      const names = floors.filter(f => filterFloorIds.has(f.id)).map(f => f.short_name).join(', ');
      parts.push(`Floors: ${names}`);
    }
    if (filterSystemIds.size > 0) {
      const names = systems.filter(s => filterSystemIds.has(s.id)).map(s => s.name).join(', ');
      parts.push(`Systems: ${names}`);
    }
    if (filterTypeCodes.size > 0) {
      const names = types.filter(t => filterTypeCodes.has(t.code)).map(t => t.name).join(', ');
      parts.push(`Types: ${names}`);
    }
    if (filterStatuses.size > 0 && filterStatuses.size < 4) {
      parts.push(`Status: ${[...filterStatuses].join(', ')}`);
    }
    if (searchQuery.trim()) parts.push(`Search: "${searchQuery.trim()}"`);
    return parts.join(' · ') || 'All components';
  })();

  async function generateReport() {
    if (reportNoneSelected || filteredComponents.length === 0) return;
    generatingReport = true;
    reportError      = '';
    try {
      const building    = facilities[0]?.name ?? 'Lancaster House';
      const generatedAt = new Date().toLocaleDateString('en-GB',
        { day: '2-digit', month: 'short', year: 'numeric' });
      const reportTypes = [
        ...(includePlan              ? ['plan']               : []),
        ...(includeList              ? ['full_list']          : []),
        ...(includeFloorSummary      ? ['floor_summary']      : []),
        ...(includeFullSummary       ? ['full_summary']       : []),
        ...(includeFullComponentList ? ['full_component_list']: []),
      ];
      await generateReportDocument({
        reportTypes, building,
        filterSummary: reportFilterSummary,
        generatedAt,
        includePlan, includeFullComponentList,
        showNotes, showLinked, showInspectionNotes,
        filteredByFloor,
        plans,
        inspections,
        typeOfFn:       typeOf,
        systemOfFn:     systemOf,
        resolveAttrsFn: resolveAttrs,
        linkedRefsFn:   c => (componentLinks[c.id] ?? []).map(l => l.to_component_ref).join('\n'),
      });
    } catch (err) {
      reportError = err.message;
    } finally {
      generatingReport = false;
    }
  }

  // -- CSV export (client-side, no server round-trip) ----------------
  function generateCSV() {
    if (filteredComponents.length === 0) return;

    // RFC 4180 cell escaping
    function esc(val) {
      const s = String(val ?? '');
      return (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r'))
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    }

    // Sort within each floor: System → Type → Asset ID (matches report order)
    function sortComps(comps) {
      return [...comps].sort((a, b) => {
        const ta = typeOf(a), tb = typeOf(b);
        const sa = systemOf(ta)?.name ?? '', sb = systemOf(tb)?.name ?? '';
        return sa.localeCompare(sb) ||
               (ta?.name ?? '').localeCompare(tb?.name ?? '') ||
               (a.asset_id ?? '').localeCompare(b.asset_id ?? '', undefined,
                 { numeric: true, sensitivity: 'base' });
      });
    }

    const headers = ['Floor', 'System', 'Type', 'Asset ID', 'Label', 'Attributes'];
    if (showLinked)          headers.push('Linked');
    if (showNotes)           headers.push('Notes');
    if (showInspectionNotes) headers.push('Insp. Notes');
    headers.push('Status');

    const rows = [headers.map(esc).join(',')];

    for (const { floor, components: comps } of filteredByFloor) {
      for (const c of sortComps(comps)) {
        const t    = typeOf(c);
        const sys  = systemOf(t);
        // Attributes: always "Name: Value" format, pipe-separated so Excel
        // doesn't mistake the separator for a column delimiter on import.
        const attrs = resolveAttrs(c).map(a => `${a.name}: ${a.value}`).join(' | ');
        const insp  = inspections[c.id] ?? null;

        const row = [
          floor.short_name,
          sys?.name    ?? '',
          t?.name      ?? c.type_code,
          c.asset_id   ?? '',
          c.label      ?? '',
          attrs,
        ];
        if (showLinked)          row.push((componentLinks[c.id] ?? []).map(l => l.to_component_ref).join(' | '));
        if (showNotes)           row.push(c.notes ?? '');
        if (showInspectionNotes) row.push(insp?.inspector_notes ?? '');
        row.push(c.status ?? '');

        rows.push(row.map(esc).join(','));
      }
    }

    // UTF-8 BOM (\uFEFF) tells Excel to open as UTF-8 without an import wizard
    const csv      = '\uFEFF' + rows.join('\r\n');
    const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = `components-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // -- Floor sets for presets ----------------------------------------
  $: residentialFloorIds = new Set(floors.filter(f => RESIDENTIAL_SHORT.has(f.short_name)).map(f => f.id));
  $: basementFloorIds    = new Set(floors.filter(f => BASEMENT_SHORT.has(f.short_name)).map(f => f.id));

  // -- Filtered component list ---------------------------------------
  $: filteredComponents = (() => {
    let list = components;

    // Floor
    if (floorPreset === 'residential') {
      list = list.filter(c => residentialFloorIds.has(c.floor_id));
    } else if (floorPreset === 'basement') {
      list = list.filter(c => basementFloorIds.has(c.floor_id));
    } else if (floorPreset === 'custom' && filterFloorIds.size > 0) {
      list = list.filter(c => filterFloorIds.has(c.floor_id));
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
    if (floorPreset === 'custom' && filterFloorIds.size > 0) {
      if (filterFloorIds.size === 1) {
        const fl = floors.find(f => filterFloorIds.has(f.id));
        return fl ? `${fl.name} (${fl.short_name})` : '1 floor';
      }
      return `${filterFloorIds.size} floors`;
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
    floorPreset    = 'all';
    filterFloorIds = new Set();
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

        <!-- Floor scope — presets + multi-select individual floors -->
        <div class="flex flex-col gap-1">
          <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Floor</p>
          <div class="flex items-center gap-1.5">
            <!-- Named presets -->
            <div class="flex rounded-lg overflow-hidden border border-slate-600 text-xs">
              {#each [
                { id: 'all',         label: 'All' },
                { id: 'residential', label: 'Residential' },
                { id: 'basement',    label: 'Basement' },
              ] as p (p.id)}
                <button
                  on:click={() => { floorPreset = p.id; filterFloorIds = new Set(); }}
                  class="px-3 py-1.5 border-l border-slate-600 first:border-l-0 transition-colors
                         {floorPreset === p.id
                           ? 'bg-purple-600 text-white font-medium'
                           : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}"
                >{p.label}</button>
              {/each}
            </div>
            <!-- Individual floor multi-select -->
            <div class="relative">
              <button
                on:click={() => openDropdown = openDropdown === 'floor' ? null : 'floor'}
                class="bg-slate-700 border rounded px-3 py-1.5 text-xs text-white
                       focus:outline-none flex items-center gap-1.5
                       {filterFloorIds.size > 0 ? 'border-purple-500/70' : 'border-slate-600 hover:border-slate-500'}"
                title="Select individual floors"
              >
                <span>
                  {#if filterFloorIds.size === 0}Floors…
                  {:else if filterFloorIds.size === 1}{floors.find(f => filterFloorIds.has(f.id))?.short_name ?? '1'}
                  {:else}{filterFloorIds.size} floors{/if}
                </span>
                <span class="text-slate-500 text-[10px]">▾</span>
              </button>
              {#if openDropdown === 'floor'}
                <div class="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-600
                            rounded-lg shadow-xl min-w-max py-1 max-h-72 overflow-y-auto">
                  {#each floors as f (f.id)}
                    <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700/80 cursor-pointer">
                      <input type="checkbox" checked={filterFloorIds.has(f.id)}
                             on:change={() => toggleFloor(f.id)}
                             class="rounded accent-purple-500 shrink-0" />
                      <span class="text-xs text-slate-300 whitespace-nowrap">
                        {f.name} <span class="text-slate-500">({f.short_name})</span>
                      </span>
                    </label>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>

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

      <!-- -- Report panel -------------------------------------------- -->
      <div class="border-b border-slate-700/60 bg-slate-800/20">

        <!-- Toggle row — always visible -->
        <div class="px-4 py-2 flex items-center gap-3 flex-wrap">
          <button
            on:click={() => showReportPanel = !showReportPanel}
            class="flex items-center gap-1.5 text-xs transition-colors
                   {showReportPanel ? 'text-purple-300' : 'text-slate-500 hover:text-slate-300'}"
          >
            <span class="text-[10px]">{showReportPanel ? '▾' : '▸'}</span>
            📄 Generate Report
            <span class="text-slate-700 tabular-nums">({filteredComponents.length})</span>
          </button>

          <!-- CSV — always available; respects column toggles, no section config needed -->
          <button
            on:click={generateCSV}
            disabled={filteredComponents.length === 0}
            class="px-2.5 py-1 text-xs rounded border border-slate-600
                   text-slate-400 hover:text-white hover:border-slate-500
                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >⬇ CSV</button>

          {#if showReportPanel}
            {#if reportNoneSelected}
              <span class="text-[10px] text-amber-500/80">Select at least one section</span>
            {/if}
            <div class="ml-auto">
              <button
                on:click={generateReport}
                disabled={generatingReport || filteredComponents.length === 0 || reportNoneSelected}
                class="px-3 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >{generatingReport ? 'Generating…' : '⬇ Document'}</button>
            </div>
          {/if}
        </div>

        <!-- Section toggles — shown when expanded -->
        {#if showReportPanel}
          <div class="px-4 pb-3 flex flex-wrap gap-x-8 gap-y-2">

            <div class="flex flex-col gap-1.5">
              <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Per Floor</p>
              <div class="flex flex-wrap gap-x-5 gap-y-1.5">
                <label class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 cursor-pointer">
                  <input type="checkbox" bind:checked={includePlan} class="accent-purple-500" />
                  🗺 Plan Graphic
                </label>
                <label class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 cursor-pointer">
                  <input type="checkbox" bind:checked={includeList} class="accent-purple-500" />
                  📋 Component Table
                </label>
                <label class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 cursor-pointer">
                  <input type="checkbox" bind:checked={includeFloorSummary} class="accent-purple-500" />
                  📊 Floor Summary
                </label>
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <p class="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Final Section</p>
              <div class="flex flex-wrap gap-x-5 gap-y-1.5">
                <label class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 cursor-pointer">
                  <input type="checkbox" bind:checked={includeFullSummary} class="accent-purple-500" />
                  📈 Full Summary
                </label>
                <label class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 cursor-pointer">
                  <input type="checkbox" bind:checked={includeFullComponentList} class="accent-purple-500" />
                  📋 Full Component List
                </label>
              </div>
            </div>

            {#if reportError}
              <p class="w-full text-xs text-red-400">{reportError}</p>
            {/if}

          </div>
        {/if}

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
