<!-- src/lib/apps/building_assets/components/inspections/ScopeEditor.svelte -->
<!-- Builds an inspection_definitions.scope object using the SAME filter UI as
     the Components tab: multi-select dropdowns (System / Type / Floor / Status)
     and attribute-filter strips (Fixed + Condition) with the chip + popover
     editor. Emits 'change' with the updated scope on every edit; parent owns
     the authoritative value and computes the live match count.

     Storage model note: inspection scopes target attributes by NAME (+ fixed/
     condition class), not by def id, so one "Emergency = true" scope matches
     every type that owns an Emergency attribute (see findFilterDef in
     attrFilters.js). The strip/popover components speak def-id, so this editor
     bridges the two: each stored filter is given a representative def id for
     display/edit, and the popover's def-id output is converted back to a name
     on apply. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { availableFixedDefs, availableConditionDefs } from '../../utils/attrFilters.js';
  import MultiSelectDropdown from '$lib/components/common/MultiSelectDropdown.svelte';
  import AttrFilterStrip     from '../AttrFilterStrip.svelte';

  export let scope    = {};
  export let types    = [];
  export let systems  = [];
  export let floors   = [];
  export let attrDefs = {};
  export let attrOptions = {};   // { [attrDefId]: type_attribute_options[] } — for dropdown/radio pickers
  /** @type {number|null} */
  export let matchCount = null;   // computed by parent (applyInspectionScope)
  /** @type {number|null} */
  export let totalCount = null;

  const dispatch = createEventDispatcher();

  const STATUSES = ['ok', 'problem', 'failed', 'inactive'];

  // Working state — Sets for the dropdowns, arrays for the attribute filters.
  // Attribute filters keep the scope's name-based shape { defName, checkable, op, values, includeUnset }.
  let typeCodes = new Set(scope.typeCodes ?? []);
  let systemIds = new Set(scope.systemIds ?? []);
  let floorIds  = new Set(scope.floorIds  ?? []);
  let statuses  = new Set(scope.statuses  ?? []);
  let fixedAttrFilters     = [...(scope.fixedAttrFilters     ?? [])];
  let conditionAttrFilters = [...(scope.conditionAttrFilters ?? [])];

  function emit() {
    const next = {};
    if (typeCodes.size) next.typeCodes = [...typeCodes];
    if (systemIds.size) next.systemIds = [...systemIds];
    if (floorIds.size)  next.floorIds  = [...floorIds];
    if (statuses.size)  next.statuses  = [...statuses];
    if (fixedAttrFilters.length)     next.fixedAttrFilters     = fixedAttrFilters;
    if (conditionAttrFilters.length) next.conditionAttrFilters = conditionAttrFilters;
    dispatch('change', next);
  }

  // Prune type selections that no longer belong to a selected system (mirrors
  // the Components tab). Settles after one pass — the re-run finds nothing invalid.
  $: if (systemIds.size > 0 && types.length > 0 && typeCodes.size > 0) {
    const valid = new Set(types.filter(t => systemIds.has(t.building_system_id)).map(t => t.code));
    if ([...typeCodes].some(c => !valid.has(c))) {
      typeCodes = new Set([...typeCodes].filter(c => valid.has(c)));
      emit();
    }
  }

  // -- One-open-at-a-time UI state ------------------------------------------
  let openDropdown = null;   // 'system' | 'type' | 'floor' | 'status' | null
  let popoverState = null;   // { kind:'fixed'|'condition', editIndex:number|null } | null

  function toggleDropdown(name) {
    popoverState = null;
    openDropdown = openDropdown === name ? null : name;
  }

  // -- Type options — grouped by system, filtered to the selected system(s) --
  $: systemOrderIndex = Object.fromEntries(systems.map((s, i) => [s.id, i]));
  $: typeOrderIndex   = Object.fromEntries(types.map((t, i) => [t.code, i]));
  $: typesForSystem = systemIds.size > 0
    ? types.filter(t => systemIds.has(t.building_system_id))
    : [...types].sort((a, b) => {
        const sd = (systemOrderIndex[a.building_system_id] ?? 999)
                 - (systemOrderIndex[b.building_system_id] ?? 999);
        if (sd !== 0) return sd;
        return (typeOrderIndex[a.code] ?? 999) - (typeOrderIndex[b.code] ?? 999);
      });
  $: typeOptions = typesForSystem.map(t => ({ value: t.code, label: t.name }));
  $: typeGroups  = systemIds.size > 0
    ? []
    : systems
        .map(s => ({
          label:   s.name,
          options: typesForSystem
            .filter(t => t.building_system_id === s.id)
            .map(t => ({ value: t.code, label: t.name })),
        }))
        .filter(g => g.options.length > 0);

  // -- Attribute defs available (scoped to the Type filter), deduped by name --
  //    Cross-type: one representative def per name.
  $: availFixedDefs = dedupeByName(availableFixedDefs(types, systems, attrDefs, typeCodes));
  $: availCondDefs  = dedupeByName(availableConditionDefs(types, systems, attrDefs, typeCodes));
  function dedupeByName(defs) {
    const seen = new Map();
    for (const d of defs) if (!seen.has(d.name)) seen.set(d.name, d);
    return [...seen.values()];
  }

  // -- defName <-> defId bridge for the strip/popover ------------------------
  const synthId = (name) => `name:${name}`;
  function repDef(name, checkable) {
    return (checkable ? availCondDefs : availFixedDefs).find(d => d.name === name) ?? null;
  }

  // Stored (name-based) filters → strip filters (def-id based, for display/edit).
  $: fixedStripFilters = fixedAttrFilters.map(f => ({ ...f, defId: repDef(f.defName, false)?.id ?? synthId(f.defName) }));
  $: condStripFilters  = conditionAttrFilters.map(f => ({ ...f, defId: repDef(f.defName, true)?.id  ?? synthId(f.defName) }));

  // defById for chip labels — real defs plus a synthetic entry for any name the
  // current Type filter narrowed out (so its chip still renders).
  $: defById = (() => {
    const m = new Map();
    for (const d of availFixedDefs) m.set(d.id, d);
    for (const d of availCondDefs)  m.set(d.id, d);
    for (const f of fixedAttrFilters)
      if (!repDef(f.defName, false)) m.set(synthId(f.defName), { id: synthId(f.defName), name: f.defName, checkable: false, display_type: 'text' });
    for (const f of conditionAttrFilters)
      if (!repDef(f.defName, true))  m.set(synthId(f.defName), { id: synthId(f.defName), name: f.defName, checkable: true,  display_type: 'text' });
    return m;
  })();

  // -- Attribute strip handlers ---------------------------------------------
  function openAddPopover(kind)         { openDropdown = null; popoverState = { kind, editIndex: null }; }
  function openEditPopover(kind, index) { openDropdown = null; popoverState = { kind, editIndex: index }; }
  function closePopover()               { popoverState = null; }
  function toggleAddPopover(kind) {
    if (popoverState?.kind === kind && popoverState.editIndex == null) closePopover();
    else openAddPopover(kind);
  }

  function handlePopoverApply(checkable, e) {
    const { defId, op, values, includeUnset } = e.detail;
    const def = defById.get(defId);
    if (!def) return;
    const row = { defName: def.name, checkable, op, values, includeUnset };
    const arr = checkable ? [...conditionAttrFilters] : [...fixedAttrFilters];
    if (popoverState?.editIndex == null) arr.push(row);
    else                                 arr[popoverState.editIndex] = row;
    if (checkable) conditionAttrFilters = arr; else fixedAttrFilters = arr;
    closePopover();
    emit();
  }

  function removeFilter(checkable, index) {
    if (checkable) conditionAttrFilters = conditionAttrFilters.filter((_, i) => i !== index);
    else           fixedAttrFilters     = fixedAttrFilters.filter((_, i) => i !== index);
    emit();
  }
</script>

<div class="scope-editor">
  <!-- Match count -->
  {#if matchCount != null}
    <div class="match-count" class:zero={matchCount === 0}>
      Matches <strong>{matchCount}</strong>{totalCount != null ? ` of ${totalCount}` : ''} component{matchCount === 1 ? '' : 's'}
      {#if matchCount === 0}<span class="warn">— this scope selects nothing</span>{/if}
    </div>
  {/if}

  <!-- Dimension dropdowns — System / Type / Floor / Status -->
  <div class="filter-row">
    <MultiSelectDropdown
      label="System" placeholder="All systems" noun="systems"
      options={systems.map(s => ({ value: s.id, label: s.name }))}
      bind:selected={systemIds}
      open={openDropdown === 'system'}
      on:toggle={() => toggleDropdown('system')}
      on:change={emit}
    />
    <MultiSelectDropdown
      label="Type" placeholder="All types" noun="types"
      options={typeOptions}
      groups={typeGroups}
      bind:selected={typeCodes}
      open={openDropdown === 'type'}
      on:toggle={() => toggleDropdown('type')}
      on:change={emit}
    />
    <MultiSelectDropdown
      label="Floor" placeholder="All floors" noun="floors"
      options={floors.map(f => ({ value: f.id, label: `${f.name} (${f.short_name})`, short: f.short_name }))}
      bind:selected={floorIds}
      open={openDropdown === 'floor'}
      on:toggle={() => toggleDropdown('floor')}
      on:change={emit}
    />
    <MultiSelectDropdown
      label="Status" placeholder="All statuses" noun="statuses" minWidth="110px"
      options={STATUSES.map(s => ({ value: s, label: s }))}
      bind:selected={statuses}
      open={openDropdown === 'status'}
      on:toggle={() => toggleDropdown('status')}
      on:change={emit}
    />
  </div>

  <!-- Attribute filter strips — Fixed / Condition -->
  <div class="attr-strips">
    <AttrFilterStrip
      label="Fixed"
      filters={fixedStripFilters}
      {defById}
      availableDefs={availFixedDefs}
      {attrOptions} {systems} {types}
      popoverOpen={popoverState?.kind === 'fixed'}
      editIndex={popoverState?.kind === 'fixed' ? popoverState.editIndex : null}
      on:add={() => toggleAddPopover('fixed')}
      on:edit={e => openEditPopover('fixed', e.detail.index)}
      on:remove={e => removeFilter(false, e.detail.index)}
      on:apply={e => handlePopoverApply(false, e)}
      on:cancel={closePopover}
    />
    <AttrFilterStrip
      label="Condition"
      filters={condStripFilters}
      {defById}
      availableDefs={availCondDefs}
      {attrOptions} {systems} {types}
      popoverOpen={popoverState?.kind === 'condition'}
      editIndex={popoverState?.kind === 'condition' ? popoverState.editIndex : null}
      on:add={() => toggleAddPopover('condition')}
      on:edit={e => openEditPopover('condition', e.detail.index)}
      on:remove={e => removeFilter(true, e.detail.index)}
      on:apply={e => handlePopoverApply(true, e)}
      on:cancel={closePopover}
    />
  </div>

  <!-- Backdrops — close the open dropdown / popover on outside click -->
  {#if openDropdown}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="fixed inset-0 z-40" on:click={() => openDropdown = null}></div>
  {/if}
  {#if popoverState}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="fixed inset-0 z-40" on:click={closePopover}></div>
  {/if}
</div>

<style>
  .scope-editor { display: flex; flex-direction: column; gap: 0.9rem; }
  .match-count  { font-size: 0.85rem; color: rgb(148 163 184); }
  .match-count strong { color: rgb(226 232 240); }
  .match-count.zero .warn { color: rgb(248 113 113); margin-left: 0.25rem; }

  .filter-row { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; }

  /* Group the two strips into one tidy bordered block (each strip carries its
     own bottom border, which reads as the divider between Fixed and Condition). */
  .attr-strips {
    border: 1px solid rgb(51 65 85 / 0.7);
    border-radius: 0.5rem;
    overflow: hidden;
  }
</style>
