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
  import AttrFilterStrip         from './AttrFilterStrip.svelte';
  import ReportActionButtons     from './ReportActionButtons.svelte';
  import ReportSectionToggles    from './ReportSectionToggles.svelte';
  import MultiSelectDropdown     from './MultiSelectDropdown.svelte';
  import ColumnToggles           from './ColumnToggles.svelte';
  import ActiveFilterSummary     from './ActiveFilterSummary.svelte';
  import {
    availableFixedDefs, availableConditionDefs,
  } from '../utils/attrFilters.js';
  import { resolveFixedAttrs } from '../utils/componentsCsv.js';
  import { buildComponentsCsvRows } from '../utils/reportModel.js';
  import { componentSpaceRefs, componentSpaceIdMap } from '../utils/spaceMembership.js';
  import { buildSpaceRef, KIND_LABEL } from '$lib/utils/spaceRef.js';
  import { generateXlsxDocument } from './plan/xlsxReportGenerator.js';
  import { filterComponents, describeComponentFilters } from '../utils/componentsFilter.js';
  import { fmtGenerated }   from '$lib/utils/dates.js';
  import { downloadCsvRows } from '$lib/utils/download.js';

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
  $: spaces         = store.spaces;
  $: spaceOverrides = store.spaceOverrides ?? [];

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
  let filterSpaceIds  = new Set();   // specific spaces (by id)
  let filterTypes     = new Set();   // space types (category)
  let filterKinds     = new Set();   // space kinds ('space' | 'slot')
  let searchQuery     = '';

  // -- Space filter resolution ---------------------------------------
  // The three space controls (specific spaces / types / kinds) AND together
  // into a target set of space ids; a component matches if it's in any of them.
  const KIND_OPTIONS = [
    { value: 'space', label: KIND_LABEL.space },
    { value: 'slot',  label: KIND_LABEL.slot },
  ];
  const EMPTY_ID_MAP = new Map();
  $: spaceFilterActive = filterSpaceIds.size > 0 || filterTypes.size > 0 || filterKinds.size > 0;
  $: targetSpaceIds = spaceFilterActive
    ? new Set(spaces.filter(sp =>
        (filterSpaceIds.size === 0 || filterSpaceIds.has(sp.id)) &&
        (filterTypes.size === 0    || filterTypes.has(sp.type ?? '')) &&
        (filterKinds.size === 0    || filterKinds.has(sp.kind ?? 'space'))
      ).map(sp => sp.id))
    : null;
  // Membership map only when the filter is active (avoids the pass otherwise).
  $: componentSpaceIds = spaceFilterActive
    ? componentSpaceIdMap(components, spaces, spaceOverrides, plans)
    : EMPTY_ID_MAP;
  // Dropdown options: spaces grouped by floor (ref + name), plus space types present.
  $: spaceGroups = floors
    .map(f => ({
      label: f.short_name || f.name,
      options: spaces.filter(sp => sp.floor_id === f.id)
        .map(sp => ({ value: sp.id, label: `${buildSpaceRef(sp, floors)}${sp.name ? ' ' + sp.name : ''}` })),
    }))
    .filter(g => g.options.length > 0);
  $: spaceOptions = spaceGroups.flatMap(g => g.options);   // flat source for the summary
  $: spaceTypeOptions = [...new Set(spaces.map(sp => sp.type).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map(u => ({ value: u, label: u }));

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
      filterSpaceIds:  [...filterSpaceIds],
      filterTypes:     [...filterTypes],
      filterKinds:     [...filterKinds],
      searchQuery,
      fixedAttrFilters,
      conditionAttrFilters,
    },
    columns: { showNotes, showLinked, showInspectionNotes, showAttributes, showConditions, showSpaces, view },
    report: {
      includePlan,
      includeList,
      includeFloorSummary,
      includeFullSummary,
      includeFullComponentList,
      planShowId,
      planShowLabel,
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
    // Space filters — default to empty for presets saved before they existed.
    filterSpaceIds  = new Set(f.filterSpaceIds ?? []);
    filterTypes     = new Set(f.filterTypes    ?? []);
    filterKinds     = new Set(f.filterKinds    ?? []);
    // Default to empty for presets saved before attribute filtering existed
    fixedAttrFilters     = Array.isArray(f.fixedAttrFilters)     ? f.fixedAttrFilters     : [];
    conditionAttrFilters = Array.isArray(f.conditionAttrFilters) ? f.conditionAttrFilters : [];
    showNotes           = c.showNotes;
    showLinked          = c.showLinked;
    showInspectionNotes = c.showInspectionNotes;
    // Default to true for presets saved before these toggles existed (matches
    // the prior always-shown behaviour).
    showAttributes      = c.showAttributes ?? true;
    showConditions      = c.showConditions ?? true;
    showSpaces          = c.showSpaces ?? false;
    view                = c.view ?? 'list';
    // Restore report options (use defaults for presets saved before report was tracked)
    includePlan              = r.includePlan              ?? false;
    includeList              = r.includeList              ?? true;
    includeFloorSummary      = r.includeFloorSummary      ?? true;
    includeFullSummary       = r.includeFullSummary       ?? false;
    includeFullComponentList = r.includeFullComponentList ?? false;
    planShowId               = r.planShowId               ?? true;
    planShowLabel            = r.planShowLabel            ?? false;
  }

  async function handleSavePreset(e) {
    const { name, description, filters, columns, report, sortOrder } = e.detail;
    savingPreset = true;
    try {
      const preset = await createPreset(name, filters, columns, report, $auth.user.id, sortOrder, description);
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
  let showAttributes      = true;      // attributes column (Word) / one col per attr (CSV)
  let showConditions      = true;      // condition sub-row (Word) / one col per condition (CSV)
  let showSpaces          = false;     // Space(s) column (display + CSV/XLSX) — reverse membership
  let view                = 'list';   // 'list' | 'summary' — owned here so presets can restore it

  // Reverse component→space membership, computed once building-wide (per-plan AR)
  // and only when the column is enabled. Feeds the table + CSV/XLSX matrix.
  const EMPTY_SPACE_MAP = new Map();
  $: spacesByComponent = showSpaces
    ? componentSpaceRefs(components, spaces, spaceOverrides, plans, floors)
    : EMPTY_SPACE_MAP;

  // -- All canonical component status values (always shown in full) --
  const ALL_STATUSES = ['ok', 'failed', 'problem', 'inactive'];

  // -- Multi-select dropdown state -----------------------------------
  let openDropdown = null;   // 'system' | 'type' | 'status' | null


  // -- Report state --------------------------------------------------
  let showReportPanel      = false;
  let includePlan              = false;
  let includeList              = true;
  let includeFloorSummary      = true;
  let includeFullSummary       = false;
  let includeFullComponentList = false;
  // Plan-graphic marker captions (only relevant when includePlan is true)
  let planShowId               = true;
  let planShowLabel            = false;
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
  $: reportFilterSummary = (() => {
    const base = describeComponentFilters(
      { floorPreset, filterFloorIds, filterSystemIds, filterTypeCodes, filterStatuses, searchQuery },
      { floors, systems, types },
    );
    // Append the space-side filters (not covered by describeComponentFilters).
    const parts = [];
    if (filterSpaceIds.size > 0) {
      const names = spaces.filter(sp => filterSpaceIds.has(sp.id)).map(sp => buildSpaceRef(sp, floors)).join(', ');
      parts.push(`Spaces: ${names}`);
    }
    if (filterTypes.size > 0) parts.push(`Space type: ${[...filterTypes].join(', ')}`);
    if (filterKinds.size > 0)  parts.push(`Space kind: ${[...filterKinds].map(k => KIND_LABEL[k] ?? k).join(', ')}`);
    if (parts.length === 0) return base;
    return base === 'All components' ? parts.join(' · ') : `${base} · ${parts.join(' · ')}`;
  })();

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
        planShowId, planShowLabel,
        showNotes, showLinked, showInspectionNotes, showAttributes, showConditions, showSpaces,
        filteredByFloor,
        plans,
        inspections,
        typeOfFn:       typeOf,
        systemOfFn:     systemOf,
        resolveAttrsFn: resolveAttrs,
        linkedRefsFn:   c => (componentLinks[c.id] ?? []).map(l => l.to_component_ref).join('\n'),
        spacesFn:       c => (spacesByComponent.get(c.id) ?? []).join('\n'),
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

  // -- CSV export (client-side, no server round-trip) ----------------
  //
  // One CSV: one row per component. The Columns toggles decide the optional
  // columns — Linked/Notes/Insp.Notes (single columns) and Attributes/Conditions
  // (one column PER attribute / condition, ✓·✗·— for conditions). This merges the
  // old inventory + condition-audit exports into a single configurable button.

  // Column context shared by the CSV and XLSX detail matrix (same shape, so the
  // two exports can never drift).
  $: matrixCtx = {
    types, systems, attrDefs, componentAttrs, componentLinks, inspections,
    showLinked, showNotes, showInspectionNotes, showAttributes, showConditions,
    showSpaces, spacesByComponent,
  };

  function generateCSV() {
    if (filteredComponents.length === 0) return;
    const rows = buildComponentsCsvRows(filteredComponents, filteredByFloor, matrixCtx);
    downloadCsvRows(`components-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  // -- XLSX export (server-styled, multi-sheet) ----------------------
  // Detail sheet = the same matrix as the CSV; Full Summary / By Floor sheets
  // are gated by the report-section toggles and use the shared status pivot.
  let generatingXlsx = false;
  async function generateXLSX() {
    if (filteredComponents.length === 0) return;
    generatingXlsx = true;
    reportError    = '';
    try {
      await generateXlsxDocument({
        building:      facilities[0]?.name ?? 'Lancaster House',
        filterSummary: reportFilterSummary,
        generatedAt:   fmtGenerated(),
        filteredComponents, filteredByFloor,
        includeFloorSummary, includeFullSummary,
        matrixCtx,
        typeOfFn:   typeOf,
        systemOfFn: systemOf,
      });
    } catch (err) {
      reportError = err.message;
    } finally {
      generatingXlsx = false;
    }
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
      fixedAttrFilters, conditionAttrFilters, spaceFilterIds: targetSpaceIds,
    },
    { types, attrDefs, componentAttrs, inspections, componentSpaceIds },
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

  // Options for the Type MultiSelectDropdown: flat list (always, for the
  // summary) + grouped-by-system (only when no system filter is active).
  $: typeOptions = typesForSystem.map(t => ({ value: t.code, label: t.name }));
  $: typeGroups  = filterSystemIds.size > 0
    ? []
    : systems
        .map(s => ({
          label:   s.name,
          options: typesForSystem
            .filter(t => t.building_system_id === s.id)
            .map(t => ({ value: t.code, label: t.name })),
        }))
        .filter(g => g.options.length > 0);

  function clearFilters() {
    floorPreset    = 'all';
    filterFloorIds = new Set();
    filterSystemIds = new Set();
    filterTypeCodes = new Set();
    filterStatuses  = new Set();
    filterSpaceIds  = new Set();
    filterTypes     = new Set();
    filterKinds     = new Set();
    searchQuery     = '';
    fixedAttrFilters     = [];
    conditionAttrFilters = [];
  }

  $: hasFilters = floorPreset !== 'all'
              || filterSystemIds.size > 0
              || filterTypeCodes.size > 0
              || filterStatuses.size > 0
              || spaceFilterActive
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

  // Add-button toggle: open the add-popover for this strip, or close it if it's
  // already open in add mode (matches the old inline toggle behaviour).
  function toggleAddPopover(kind) {
    if (popoverState?.kind === kind && popoverState.editIndex == null) closePopover();
    else openAddPopover(kind);
  }

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
      {showSpaces}
      {spacesByComponent}
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
            <MultiSelectDropdown
              placeholder="Floors…" noun="floors" title="Select individual floors"
              options={floors.map(f => ({ value: f.id, label: `${f.name} (${f.short_name})`, short: f.short_name }))}
              bind:selected={filterFloorIds}
              open={openDropdown === 'floor'}
              on:toggle={() => openDropdown = openDropdown === 'floor' ? null : 'floor'}
              on:change={() => floorPreset = filterFloorIds.size > 0 ? 'custom' : 'all'}
            />
          </div>
        </div>

        <!-- System filter — multi-select dropdown -->
        <MultiSelectDropdown
          label="System" placeholder="All systems" noun="systems"
          options={systems.map(s => ({ value: s.id, label: s.name }))}
          bind:selected={filterSystemIds}
          open={openDropdown === 'system'}
          on:toggle={() => openDropdown = openDropdown === 'system' ? null : 'system'}
        />

        <!-- Type filter — multi-select dropdown, grouped by system when unfiltered -->
        <MultiSelectDropdown
          label="Type" placeholder="All types" noun="types"
          options={typeOptions}
          groups={typeGroups}
          bind:selected={filterTypeCodes}
          open={openDropdown === 'type'}
          on:toggle={() => openDropdown = openDropdown === 'type' ? null : 'type'}
        />

        <!-- Status filter — multi-select dropdown -->
        <MultiSelectDropdown
          label="Status" placeholder="All statuses" noun="statuses" minWidth="100px"
          options={ALL_STATUSES.map(s => ({ value: s, label: s }))}
          bind:selected={filterStatuses}
          open={openDropdown === 'status'}
          on:toggle={() => openDropdown = openDropdown === 'status' ? null : 'status'}
        />

        <!-- Space filter — specific spaces, grouped by floor (ref + name) -->
        {#if spaceOptions.length > 0}
          <MultiSelectDropdown
            label="Space" placeholder="All spaces" noun="spaces"
            options={spaceOptions}
            groups={spaceGroups}
            bind:selected={filterSpaceIds}
            open={openDropdown === 'space'}
            on:toggle={() => openDropdown = openDropdown === 'space' ? null : 'space'}
          />
        {/if}

        <!-- Space Type filter — space category (distinct from the component Type filter) -->
        {#if spaceTypeOptions.length > 0}
          <MultiSelectDropdown
            label="Space Type" placeholder="All types" noun="types"
            options={spaceTypeOptions}
            bind:selected={filterTypes}
            open={openDropdown === 'spacetype'}
            on:toggle={() => openDropdown = openDropdown === 'spacetype' ? null : 'spacetype'}
          />
        {/if}

        <!-- Kind filter — Space / Slot -->
        {#if spaceOptions.length > 0}
          <MultiSelectDropdown
            label="Kind" placeholder="All kinds" noun="kinds" minWidth="90px"
            options={KIND_OPTIONS}
            bind:selected={filterKinds}
            open={openDropdown === 'kind'}
            on:toggle={() => openDropdown = openDropdown === 'kind' ? null : 'kind'}
          />
        {/if}

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

        <!-- Clear filters -->
        {#if hasFilters}
          <button
            on:click={clearFilters}
            class="text-xs text-purple-400 hover:text-purple-300 transition-colors self-end pb-1.5"
          >Clear</button>
        {/if}

        <!-- Active filter summary -->
        <ActiveFilterSummary
          {floorPreset} {floorLabel}
          {filterSystemIds} {filterTypeCodes} {filterStatuses}
          {searchQuery} {systems} {types}
        />

      </div>

      <!-- Report/export column toggles — own row -->
      <div class="px-4 py-2 border-b border-slate-700 bg-slate-800/40">
        <ColumnToggles
          bind:showLinked bind:showNotes bind:showInspectionNotes
          bind:showAttributes bind:showConditions bind:showSpaces
        />
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
      <AttrFilterStrip
        label="Fixed"
        filters={fixedAttrFilters}
        {defById}
        availableDefs={availFixedDefs}
        {attrOptions} {systems} {types}
        popoverOpen={popoverState?.kind === 'fixed'}
        editIndex={popoverState?.kind === 'fixed' ? popoverState.editIndex : null}
        on:add={() => toggleAddPopover('fixed')}
        on:edit={e => openEditPopover('fixed', e.detail.index)}
        on:remove={e => removeFilter('fixed', e.detail.index)}
        on:apply={handlePopoverApply}
        on:cancel={closePopover}
      />

      <AttrFilterStrip
        label="Condition"
        filters={conditionAttrFilters}
        {defById}
        availableDefs={availConditionDefs}
        {attrOptions} {systems} {types}
        popoverOpen={popoverState?.kind === 'condition'}
        editIndex={popoverState?.kind === 'condition' ? popoverState.editIndex : null}
        on:add={() => toggleAddPopover('condition')}
        on:edit={e => openEditPopover('condition', e.detail.index)}
        on:remove={e => removeFilter('condition', e.detail.index)}
        on:apply={handlePopoverApply}
        on:cancel={closePopover}
      />

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
            <ReportActionButtons
              count={filteredComponents.length}
              generating={generatingReport}
              generatingXlsx={generatingXlsx}
              documentDisabled={reportNoneSelected}
              on:document={generateReport}
              on:xlsx={generateXLSX}
              on:csv={generateCSV}
            />
          {/if}
        </div>

        <!-- Section toggles — shown when expanded -->
        {#if showReportPanel}
          <ReportSectionToggles
            bind:includePlan
            bind:includeList
            bind:includeFloorSummary
            bind:includeFullSummary
            bind:includeFullComponentList
            bind:planShowId
            bind:planShowLabel
            {reportError}
          />
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
