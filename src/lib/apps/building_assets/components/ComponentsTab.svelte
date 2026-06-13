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

  import { resolveComponentHalo, conditionChecklistDisplay } from '../lookups.js';
  import { generateReportDocument } from './plan/reportGenerator.js';
  import ComponentInventoryTable from './ComponentInventoryTable.svelte';
  import ComponentPresetBar      from './ComponentPresetBar.svelte';
  import ComponentForm           from './ComponentForm.svelte';
  import ComponentDetailPanel    from './ComponentDetailPanel.svelte';
  import ComponentDetailView     from './ComponentDetailView.svelte';
  import InspectionPanel         from './InspectionPanel.svelte';
  import AttrFilterPopover       from './AttrFilterPopover.svelte';
  import AttrFilterChip          from './AttrFilterChip.svelte';
  import {
    availableFixedDefs, availableConditionDefs,
  } from '../utils/attrFilters.js';
  import {
    resolveFixedAttrs, buildInventoryCsvRows, buildConditionAuditCsvRows,
  } from '../utils/componentsCsv.js';
  import { filterComponents, describeComponentFilters } from '../utils/componentsFilter.js';
  import { fmtGenerated } from '$lib/utils/dates.js';

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

  // Attribute filters — arrays of { defId, op, values, includeUnset }.
  // Fixed values come from componentAttrs; condition values come from
  // the latest component_inspections row's checklist_results. See
  // src/lib/apps/building_assets/utils/attrFilters.js.
  let fixedAttrFilters     = [];
  let conditionAttrFilters = [];

  // Popover state — null when closed; otherwise { kind, editIndex }
  //   kind:     'fixed' | 'condition'
  //   editIndex: number (editing existing) or null (adding new)
  let popoverState = null;

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
      fixedAttrFilters,
      conditionAttrFilters,
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
    // Default to empty for presets saved before attribute filtering existed
    fixedAttrFilters     = Array.isArray(f.fixedAttrFilters)     ? f.fixedAttrFilters     : [];
    conditionAttrFilters = Array.isArray(f.conditionAttrFilters) ? f.conditionAttrFilters : [];
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

  // -- Report helpers ---------------------------------------------------
  function typeOf(c)   { return types.find(t => t.code === c.type_code); }
  function systemOf(t) { return t ? systems.find(s => s.id === t.building_system_id) : null; }

  // Thin wrapper over the pure helper so existing call sites (and the report
  // generator's resolveAttrsFn) keep working unchanged.
  function resolveAttrs(c) {
    return resolveFixedAttrs(c, types, attrDefs, componentAttrs);
  }

  // Group filteredComponents by floor (preserves floor level_order).
  // Attach _haloColour to each component so the plan image renderer can draw rings.
  $: filteredByFloor = (() => {
    const map = {};
    for (const c of filteredComponents) {
      if (!map[c.floor_id]) map[c.floor_id] = [];
      const halo = resolveComponentHalo(c, types, attrDefs, componentAttrs);
      map[c.floor_id].push(halo ? { ...c, _haloColour: halo } : c);
    }
    return floors
      .filter(f => map[f.id]?.length > 0)
      .map(f => ({ floor: f, components: map[f.id] }));
  })();

  // Human-readable filter description for the report document header
  $: reportFilterSummary = describeComponentFilters(
    { floorPreset, filterFloorIds, filterSystemIds, filterTypeCodes, filterStatuses, searchQuery },
    { floors, systems, types },
  );

  async function generateReport() {
    if (reportNoneSelected || filteredComponents.length === 0) return;
    generatingReport = true;
    reportError      = '';
    try {
      const building    = facilities[0]?.name ?? 'Lancaster House';
      const generatedAt = fmtGenerated();
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
        // Condition results from the latest inspection — used by the Word
        // generator to draw a per-component sub-row showing checklist outcomes.
        conditionResultsFn: c => {
          const t    = typeOf(c);
          const defs = t ? (attrDefs[t.id] ?? []) : [];
          const insp = inspections[c.id] ?? null;
          return conditionChecklistDisplay(insp, defs).map(({ def, passed }) => ({
            name: def.name,
            passed,
          }));
        },
      });
    } catch (err) {
      reportError = err.message;
    } finally {
      generatingReport = false;
    }
  }

  // -- CSV exports (client-side, no server round-trip) ---------------
  //
  // Two flavours:
  //   generateCSV()                — inventory CSV (one row per component,
  //                                  attributes pipe-joined in one cell,
  //                                  condition summary string)
  //   generateConditionAuditCSV()  — UNPIVOTED, one column per condition
  //                                  attribute across the types present
  //                                  in filteredComponents. Designed for
  //                                  Excel sort/filter on individual
  //                                  conditions.

  /** Trigger a CSV file download from an array of rows (rows already strings). */
  function downloadCsv(filename, rows) {
    // UTF-8 BOM (﻿) tells Excel to open as UTF-8 without an import wizard
    const csv  = '﻿' + rows.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generateCSV() {
    if (filteredComponents.length === 0) return;
    const rows = buildInventoryCsvRows(filteredByFloor, {
      types, systems, attrDefs, componentAttrs, componentLinks, inspections,
      showLinked, showNotes, showInspectionNotes,
    });
    downloadCsv(`components-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  /**
   * Condition Audit CSV \u2014 unpivoted, one column per condition attribute
   * across the types present in filteredComponents. Each cell:
   *   \u2713 = passed in latest inspection
   *   \u2717 = failed in latest inspection
   *   \u2014 = applies to this type but has no recorded value (e.g. inspector
   *       didn't tick it, attr added after inspection, never inspected)
   *   (blank) = the attribute doesn't apply to this component's type
   *
   * Dynamic condition columns are sorted system \u2192 type \u2192 presentation_order
   * (same shape as the filter popover, via availableConditionDefs).
   */
  function generateConditionAuditCSV() {
    if (filteredComponents.length === 0) return;
    const { rows, error } = buildConditionAuditCsvRows(filteredComponents, filteredByFloor, {
      types, systems, attrDefs, inspections,
    });
    if (error) { reportError = error; return; }
    reportError = '';
    downloadCsv(`condition-audit-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  // -- Floor sets for presets ----------------------------------------
  $: residentialFloorIds = new Set(floors.filter(f => RESIDENTIAL_SHORT.has(f.short_name)).map(f => f.id));
  $: basementFloorIds    = new Set(floors.filter(f => BASEMENT_SHORT.has(f.short_name)).map(f => f.id));

  // -- Filtered component list ---------------------------------------
  $: filteredComponents = filterComponents(
    components,
    {
      floorPreset, residentialFloorIds, basementFloorIds, filterFloorIds,
      filterSystemIds, filterTypeCodes, filterStatuses, searchQuery,
      fixedAttrFilters, conditionAttrFilters,
    },
    { types, attrDefs, componentAttrs, inspections },
  );

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
    fixedAttrFilters     = [];
    conditionAttrFilters = [];
  }

  $: hasFilters = floorPreset !== 'all'
              || filterSystemIds.size > 0
              || filterTypeCodes.size > 0
              || filterStatuses.size > 0
              || searchQuery.trim()
              || fixedAttrFilters.length > 0
              || conditionAttrFilters.length > 0;

  // -- Attribute filter availability (scoped to current Type filter) ---
  //    Sorted by system → type → attribute presentation_order.
  $: availFixedDefs     = availableFixedDefs(types, systems, attrDefs, filterTypeCodes);
  $: availConditionDefs = availableConditionDefs(types, systems, attrDefs, filterTypeCodes);

  // Lookup map for chip → def (chips need access to the def for name etc.)
  $: defById = (() => {
    const m = new Map();
    for (const arr of Object.values(attrDefs ?? {})) {
      for (const d of arr) m.set(d.id, d);
    }
    return m;
  })();

  // -- Popover open / close / apply -----------------------------------
  function openAddPopover(kind) {
    popoverState = { kind, editIndex: null };
  }
  function openEditPopover(kind, index) {
    popoverState = { kind, editIndex: index };
  }
  function closePopover() { popoverState = null; }

  function handlePopoverApply(e) {
    if (!popoverState) return;
    const filter = e.detail;
    const arr    = popoverState.kind === 'fixed' ? fixedAttrFilters : conditionAttrFilters;
    const next   = [...arr];
    if (popoverState.editIndex == null) next.push(filter);
    else                                 next[popoverState.editIndex] = filter;
    if (popoverState.kind === 'fixed') fixedAttrFilters     = next;
    else                                conditionAttrFilters = next;
    closePopover();
  }

  function removeFilter(kind, index) {
    if (kind === 'fixed') {
      fixedAttrFilters = fixedAttrFilters.filter((_, i) => i !== index);
    } else {
      conditionAttrFilters = conditionAttrFilters.filter((_, i) => i !== index);
    }
  }
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
        {attrDefs} {components}
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
          <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Floor</p>
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
          <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">System</p>
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
          <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Type</p>
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
          <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Status</p>
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
          <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Search</p>
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
          <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Columns</p>
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

      <!-- ─── Attribute filter strips (Fixed / Condition) ──────────────
           One horizontal-scroll row per attribute class. Chips scroll;
           the "+ Add filter" button stays anchored at the right of the
           strip (outside the scroller) so its popover anchors next to
           the click. Fixed values come from componentAttrs; condition
           values come from the latest inspection's checklist_results.
           -->

      <!-- Fixed.
           Chip scroller has no flex-1, so it sizes to its content. The
           Add-filter button sits right after the chips, near the label.
           When chips overflow, the scroller scrolls horizontally (capped
           at max-w-full inside its parent); the button stays anchored
           right after the visible scroll viewport. -->
      <div class="px-4 py-2 border-b border-slate-700 flex items-center gap-2 bg-slate-800/40">
        <span class="text-[10px] uppercase tracking-wide text-slate-300 font-semibold shrink-0 w-20">Fixed</span>
        <div class="min-w-0 overflow-x-auto flex items-center gap-1.5 py-0.5 max-w-full">
          {#each fixedAttrFilters as f, i (i + ':' + f.defId)}
            <AttrFilterChip
              filter={f}
              def={defById.get(f.defId)}
              on:edit={() => openEditPopover('fixed', i)}
              on:remove={() => removeFilter('fixed', i)}
            />
          {/each}
        </div>
        <!-- Button + popover wrapper sits OUTSIDE the overflow-x-auto
             scroller so the dropdown isn't clipped. -->
        <div class="relative shrink-0">
          <button
            on:click={() => popoverState?.kind === 'fixed' && popoverState.editIndex == null ? closePopover() : openAddPopover('fixed')}
            class="px-2 py-0.5 text-xs rounded-full border border-dashed border-slate-600 text-slate-400
                   hover:text-white hover:border-purple-500 whitespace-nowrap transition-colors"
            disabled={availFixedDefs.length === 0}
            title={availFixedDefs.length === 0 ? 'No fixed attributes available' : 'Add a fixed-attribute filter'}
          >+ Add filter</button>
          {#if popoverState?.kind === 'fixed'}
            <div class="absolute top-full left-0 mt-1 z-50">
              <AttrFilterPopover
                availableDefs={availFixedDefs}
                {attrOptions}
                {systems}
                {types}
                existing={popoverState.editIndex == null ? null : fixedAttrFilters[popoverState.editIndex]}
                className="Fixed attribute"
                on:apply={handlePopoverApply}
                on:cancel={closePopover}
              />
            </div>
          {/if}
        </div>
      </div>

      <!-- Condition -->
      <div class="px-4 py-2 border-b border-slate-700 flex items-center gap-2 bg-slate-800/40">
        <span class="text-[10px] uppercase tracking-wide text-slate-300 font-semibold shrink-0 w-20">Condition</span>
        <div class="min-w-0 overflow-x-auto flex items-center gap-1.5 py-0.5 max-w-full">
          {#each conditionAttrFilters as f, i (i + ':' + f.defId)}
            <AttrFilterChip
              filter={f}
              def={defById.get(f.defId)}
              on:edit={() => openEditPopover('condition', i)}
              on:remove={() => removeFilter('condition', i)}
            />
          {/each}
        </div>
        <div class="relative shrink-0">
          <button
            on:click={() => popoverState?.kind === 'condition' && popoverState.editIndex == null ? closePopover() : openAddPopover('condition')}
            class="px-2 py-0.5 text-xs rounded-full border border-dashed border-slate-600 text-slate-400
                   hover:text-white hover:border-purple-500 whitespace-nowrap transition-colors"
            disabled={availConditionDefs.length === 0}
            title={availConditionDefs.length === 0 ? 'No condition attributes available' : 'Add a condition-attribute filter'}
          >+ Add filter</button>
          {#if popoverState?.kind === 'condition'}
            <div class="absolute top-full left-0 mt-1 z-50">
              <AttrFilterPopover
                availableDefs={availConditionDefs}
                {attrOptions}
                {systems}
                {types}
                existing={popoverState.editIndex == null ? null : conditionAttrFilters[popoverState.editIndex]}
                className="Condition attribute"
                on:apply={handlePopoverApply}
                on:cancel={closePopover}
              />
            </div>
          {/if}
        </div>
      </div>

      <!-- Popover backdrop — clicking outside the popover closes it -->
      {#if popoverState}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="fixed inset-0 z-40" on:click={closePopover}></div>
      {/if}

      <!-- -- Report panel -------------------------------------------- -->
      <div class="border-b border-slate-700/60 bg-slate-800/20">

        <!-- Toggle row — always visible -->
        <div class="px-4 py-2 flex items-center gap-3 flex-wrap">
          <button
            on:click={() => showReportPanel = !showReportPanel}
            class="flex items-center gap-1.5 text-xs font-semibold transition-colors
                   {showReportPanel ? 'text-purple-300' : 'text-slate-300 hover:text-white'}"
          >
            <span class="text-[10px]">{showReportPanel ? '▾' : '▸'}</span>
            📄 Report Options
            <span class="text-slate-500 tabular-nums font-normal">({filteredComponents.length})</span>
          </button>

          {#if showReportPanel}
            {#if reportNoneSelected}
              <span class="text-[10px] text-amber-500/80">Select at least one section</span>
            {/if}
            <div class="ml-auto flex items-center gap-2">
              <button
                on:click={generateReport}
                disabled={generatingReport || filteredComponents.length === 0 || reportNoneSelected}
                class="px-3 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >{generatingReport ? 'Generating…' : '⬇ Document'}</button>
              <button
                on:click={generateCSV}
                disabled={filteredComponents.length === 0}
                class="px-3 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Inventory CSV — one row per component, attributes pipe-joined"
              >⬇ CSV</button>
              <button
                on:click={generateConditionAuditCSV}
                disabled={filteredComponents.length === 0}
                class="px-3 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Condition Audit CSV — one column per condition attribute, ✓/✗ per component (Excel-filterable)"
              >⬇ Condition Audit</button>
            </div>
          {/if}
        </div>

        <!-- Section toggles — shown when expanded -->
        {#if showReportPanel}
          <div class="px-4 pb-3 flex flex-wrap gap-x-8 gap-y-2">

            <div class="flex flex-col gap-1.5">
              <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Per Floor</p>
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
              <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Final Section</p>
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
