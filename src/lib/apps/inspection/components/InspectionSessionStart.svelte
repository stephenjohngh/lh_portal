<!-- src/lib/apps/inspection/components/InspectionSessionStart.svelte -->
<!-- Configure and start a new test or inspection session.
     Scheduled (configurable) inspection definitions list first, due-ordered;
     legacy presets (Emergency Lighting, Fire Doors, Apartment Doors, Custom)
     remain below until Phase-2 seed definitions retire them. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger }    from '$lib/utils/logger';
  import { inspectionStore }  from '../stores/inspectionStore.js';
  import { generateSessionName } from '../utils/sessionNaming.js';
  import { buildWalkComponentsFromScope } from '../utils/inspectionWalk.js';
  import { buildRotatingWalk } from '../utils/inspectionRotation.js';
  import { lastDefinitionInspections } from '../public.js';
  import { buildComponentRef } from '$lib/utils/componentRef.js';
  import { computeInspectionSchedule, sortBySchedule, scheduleDueText } from '$lib/utils/inspectionSchedule';
  import WalkButton from '$lib/apps/inspection/components/common/WalkButton.svelte';
  import WalkInput  from '$lib/apps/inspection/components/common/WalkInput.svelte';
  import WalkSelect from '$lib/apps/inspection/components/common/WalkSelect.svelte';
  import WalkError  from '$lib/apps/inspection/components/common/WalkError.svelte';
  import WalkSpinner from '$lib/apps/inspection/components/common/WalkSpinner.svelte';

  const logger   = getLogger('InspectionSessionStart');
  const dispatch = createEventDispatcher();

  export let sessionType = 'test';   // 'test' | 'inspection'

  $: facilities        = $inspectionStore.facilities;
  $: floors            = $inspectionStore.floors;
  $: systems           = $inspectionStore.systems;   // used for custom type tree grouping
  $: types             = $inspectionStore.types;
  $: allComponents     = $inspectionStore.allComponents;
  $: allComponentAttrs = $inspectionStore.allComponentAttrs ?? {};

  // -- Form state ----------------------------------------------------------------
  let scope      = 'single_floor';   // 'single_floor' | 'building'
  let preset     = 'emergency_lighting';
  let selectedDefinitionId = '';     // an inspection_definitions id, or '' (preset mode)
  let showCustom = false;
  let selectedFacilityId = '';
  let selectedFloorId    = '';
  let sessionName        = '';
  let saving             = false;
  let error              = null;

  // Custom tree: set of hidden type codes (same exclusive model as plan filter)
  let hiddenTypeCodes = new Set();

  // -- Scheduled inspection definitions -------------------------------------------
  $: definitions = ($inspectionStore.definitions ?? []).filter(d => d.active);
  $: schedStates = sortBySchedule(computeInspectionSchedule(definitions, $inspectionStore.scheduleSessions ?? []));
  $: selectedDefinition = definitions.find(d => d.id === selectedDefinitionId) ?? null;
  // ctx for the shared scope filter engine — same shape the walk builder uses,
  // so the preview count always equals the real walk length.
  $: scopeCtx = {
    types,
    attrDefs:       $inspectionStore.attrDefs ?? {},
    componentAttrs: allComponentAttrs,
    inspections:    $inspectionStore.latestInspections ?? {},
  };

  const BAND_LABEL = {
    never_run: 'DUE',
    overdue:   'OVERDUE',
    due_soon:  'DUE SOON',
    ok:        'OK',
    on_demand: 'ANY TIME',
  };

  function selectDefinition(d) {
    selectedDefinitionId = d.id;
    preset = '';
    showCustom = false;
    // Condition-attribute scopes match against latest inspections — load the
    // map now so the count preview (and the walk) sees it.
    if (d.scope?.conditionAttrFilters?.length) inspectionStore.ensureLatestInspections();
    // Rotating: the trigger preview needs the last-test map for this definition.
    if (d.mode === 'rotating' && !(d.id in rotLastTested)) loadRotLastTested(d.id);
  }

  // -- Rotating preview -------------------------------------------------------
  let rotLastTested = {};   // { [definitionId]: { componentId: ISO } }
  async function loadRotLastTested(defId) {
    try {
      const map = await lastDefinitionInspections(defId);
      rotLastTested = { ...rotLastTested, [defId]: map };
    } catch {
      rotLastTested = { ...rotLastTested, [defId]: {} };
    }
  }

  $: isRotating = selectedDefinition?.mode === 'rotating';
  $: allComponentsFlat = Object.values(allComponents).flat();
  $: rotWalk = isRotating && selectedDefinition.id in rotLastTested
    ? buildRotatingWalk(selectedDefinition, {
        components:     allComponentsFlat,
        floors,
        componentLinks: $inspectionStore.componentLinks ?? {},
        ctx:            scopeCtx,
        lastTested:     rotLastTested[selectedDefinition.id],
      })
    : null;
  $: rotTriggerFloor = rotWalk?.trigger
    ? floors.find(f => f.id === rotWalk.trigger.floor_id) ?? null
    : null;

  // -- Derived -------------------------------------------------------------------
  $: selectedFacility  = facilities.find(f => f.id === selectedFacilityId) ?? facilities[0];
  // Only walkable floors (walk_order != null), sorted by walk_order
  $: buildingFloors    = floors
    .filter(f => f.facility_id === selectedFacility?.id && f.walk_order != null)
    .sort((a, b) => a.walk_order - b.walk_order);
  $: selectedFloor     = buildingFloors.find(f => f.id === selectedFloorId) ?? buildingFloors[0];

  // Building name = facility short_name or name
  $: building = selectedFacility?.short_name ?? selectedFacility?.name ?? '';

  $: { if (facilities.length > 0 && !selectedFacilityId) selectedFacilityId = facilities[0]?.id ?? ''; }
  $: { if (buildingFloors.length > 0 && !selectedFloorId) selectedFloorId = buildingFloors[0]?.id ?? ''; }

  // Derive type_filter + emergencyOnly from preset (or custom selection).
  // Emergency lighting: include ALL types — the emergencyOnly flag filters at component
  // attribute level (attr_name='emergency', value='true'), not by type code.
  // Fire doors / Apartment doors: filter by specific stable type codes.
  $: allTypeCodes = types.map(t => t.code);

  $: presetTypeFilter = (() => {
    if (preset === 'emergency_lighting') return allTypeCodes;
    if (preset === 'fire_doors')         return types.filter(t => t.code === 'door_fire_door').map(t => t.code);
    if (preset === 'apartment_doors')    return types.filter(t => t.code === 'door_apartment_door').map(t => t.code);
    // custom: exclude hidden types
    return types.filter(t => !hiddenTypeCodes.has(t.code)).map(t => t.code);
  })();

  $: emergencyOnly = preset === 'emergency_lighting';

  // Component count preview.
  // Definitions: exact walk builder (scope engine + walk exclusions), so the
  // count always equals the session's real walk length.
  // Emergency: check component_attributes for attr_name='emergency', value='true'
  // (attr_name is enriched into allComponentAttrs during store load()).
  $: componentCount = (() => {
    if (isRotating) return rotWalk?.walkComponents.length ?? 0;
    if (selectedDefinition) {
      const count = (comps) => buildWalkComponentsFromScope(comps, selectedDefinition.scope, scopeCtx).length;
      if (scope === 'single_floor') {
        return selectedFloor?.id ? count(allComponents[selectedFloor.id] ?? []) : 0;
      }
      return buildingFloors.reduce((n, f) => n + count(allComponents[f.id] ?? []), 0);
    }
    const tf = presetTypeFilter;
    if (scope === 'single_floor') {
      const fid = selectedFloor?.id;
      if (!fid) return 0;
      const comps = (allComponents[fid] ?? []).filter(c => tf.includes(c.type_code));
      if (emergencyOnly) {
        return comps.filter(c => (allComponentAttrs[c.id] ?? []).some(a => a.attr_name?.toLowerCase() === 'emergency' && a.value === 'true')).length;
      }
      return comps.length;
    } else {
      return buildingFloors.reduce((n, f) => {
        const comps = (allComponents[f.id] ?? []).filter(c => tf.includes(c.type_code));
        if (emergencyOnly) {
          return n + comps.filter(c => (allComponentAttrs[c.id] ?? []).some(a => a.attr_name?.toLowerCase() === 'emergency' && a.value === 'true')).length;
        }
        return n + comps.length;
      }, 0);
    }
  })();

  // Auto-generate name when inputs change
  $: {
    const floor = isRotating
      ? rotTriggerFloor
      : (scope === 'single_floor' ? selectedFloor : null);
    sessionName = generateSessionName({
      preset, definition: selectedDefinition, building, floor,
      scope: isRotating ? (rotTriggerFloor ? 'single_floor' : 'building') : scope,
    });
  }


  // System groups for custom tree
  $: systemGroups = (() => {
    const map = new Map();
    for (const t of types) {
      const sid = t.building_system_id ?? '__none__';
      if (!map.has(sid)) map.set(sid, { system: systems.find(s => s.id === sid) ?? null, types: [] });
      map.get(sid).types.push(t);
    }
    return [...map.values()].sort((a, b) => (a.system?.name ?? 'z').localeCompare(b.system?.name ?? 'z'));
  })();

  // Reactive system states for custom tree checkboxes
  $: systemStates = new Map(
    systemGroups.map(g => {
      const id = g.system?.id ?? '__none__';
      const hiddenCount = g.types.filter(t => hiddenTypeCodes.has(t.code)).length;
      return [id, {
        isChecked: hiddenCount === 0,
        isPartial: hiddenCount > 0 && hiddenCount < g.types.length,
      }];
    })
  );

  function toggleSystem(group) {
    const allVisible = group.types.every(t => !hiddenTypeCodes.has(t.code));
    const next = new Set(hiddenTypeCodes);
    for (const t of group.types) {
      if (allVisible) next.add(t.code); else next.delete(t.code);
    }
    hiddenTypeCodes = next;
  }

  function toggleType(code) {
    const next = new Set(hiddenTypeCodes);
    if (next.has(code)) next.delete(code); else next.add(code);
    hiddenTypeCodes = next;
  }

  const PRESETS = [
    { id: 'emergency_lighting', label: '🔦 Emergency Lighting', sub: 'Components with emergency attribute' },
    { id: 'fire_doors',         label: '🚪 Fire Doors',          sub: 'Communal door components' },
    { id: 'apartment_doors',    label: '🔑 Apartment Doors',     sub: 'Apartment door components' },
    { id: 'custom',             label: '⚙ Custom…',              sub: 'Select component types manually' },
  ];

  async function handleBegin() {
    if (componentCount === 0) { error = 'No components match this selection.'; return; }
    saving = true; error = null;
    try {
      const opts = selectedDefinition
        ? { building, sessionName, sessionType, definition: selectedDefinition }
        : { building, typeFilter: presetTypeFilter, emergencyOnly, sessionName, sessionType, preset };
      if (isRotating) {
        await inspectionStore.startRotatingSession(opts);
      } else if (scope === 'single_floor') {
        await inspectionStore.startSession({ ...opts, floor: selectedFloor });
      } else {
        await inspectionStore.startBuildingWideSession(opts);
      }
      dispatch('started');
    } catch (err) {
      logger('❌ Start session:', err.message);
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="ss">
  <div class="ss-hdr">
    <WalkButton variant="ghost" size="sm" on:click={() => dispatch('cancel')}>← Back</WalkButton>
    <span class="ss-title">{sessionType === 'test' ? 'NEW TEST SESSION' : 'NEW INSPECTION'}</span>
  </div>

  <div class="ss-body">

    <!-- -- Scope (a rotating inspection derives its own target) ------------------ -->
    {#if !isRotating}
      <section class="grp">
        <div class="grp-lbl">SCOPE</div>
        <div class="scope-row">
          <button class="scope-btn" class:sel={scope === 'single_floor'} on:click={() => scope = 'single_floor'}>
            Single Floor
          </button>
          <button class="scope-btn" class:sel={scope === 'building'} on:click={() => scope = 'building'}>
            Whole Building
          </button>
        </div>
      </section>
    {/if}

    <!-- -- Building / floor ----------------------------------------------------- -->
    {#if facilities.length > 1}
      <section class="grp">
        <div class="grp-lbl">BUILDING</div>
        <WalkSelect
          bind:value={selectedFacilityId}
          options={facilities.map(f => ({ value: f.id, label: f.name }))}
        />
      </section>
    {/if}

    {#if !isRotating && scope === 'single_floor'}
      <section class="grp">
        <div class="grp-lbl">FLOOR</div>
        <WalkSelect
          bind:value={selectedFloorId}
          options={buildingFloors.map(f => ({ value: f.id, label: f.name }))}
          placeholder=""
        />
      </section>
    {/if}

    <!-- -- Scheduled inspection definitions (due-ordered) ------------------------ -->
    {#if schedStates.length > 0}
      <section class="grp">
        <div class="grp-lbl">SCHEDULED INSPECTIONS</div>
        <div class="preset-list">
          {#each schedStates as st (st.definition.id)}
            <button
              class="preset-btn"
              class:sel={selectedDefinitionId === st.definition.id}
              on:click={() => selectDefinition(st.definition)}
            >
              <div class="def-row">
                <div class="preset-label">
                  {st.definition.name}
                  {#if st.definition.mode === 'rotating'}<span class="rot-mark">⟳</span>{/if}
                </div>
                <span class="def-band band-{st.band}">{BAND_LABEL[st.band]}</span>
              </div>
              <div class="preset-sub">{scheduleDueText(st)}</div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- -- Preset --------------------------------------------------------------- -->
    <section class="grp">
      <div class="grp-lbl">{schedStates.length > 0 ? 'AD-HOC INSPECTION' : 'INSPECTION TYPE'}</div>
      <div class="preset-list">
        {#each PRESETS as p (p.id)}
          <button
            class="preset-btn"
            class:sel={preset === p.id}
            on:click={() => { preset = p.id; showCustom = p.id === 'custom'; selectedDefinitionId = ''; }}
          >
            <div class="preset-label">{p.label}</div>
            <div class="preset-sub">{p.sub}</div>
          </button>
        {/each}
      </div>
    </section>

    <!-- -- Custom type tree ----------------------------------------------------- -->
    {#if showCustom && preset === 'custom'}
      <section class="grp">
        <div class="grp-lbl">SELECT TYPES</div>
        <div class="type-tree">
          {#each systemGroups as group (group.system?.id ?? '__none__')}
            {@const { isChecked, isPartial } = systemStates.get(group.system?.id ?? '__none__') ?? { isChecked: true, isPartial: false }}
            <!-- System row -->
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div class="tree-sys" on:click={() => toggleSystem(group)}>
              <div class="cb" class:cb-on={isChecked} class:cb-partial={isPartial}>
                {#if isChecked}✓{:else if isPartial}–{/if}
              </div>
              <span class="tree-sys-name">{group.system?.name ?? 'Other'}</span>
            </div>
            <!-- Type rows -->
            <div class="tree-types">
              {#each group.types as t (t.code)}
                {@const typeHidden = hiddenTypeCodes.has(t.code)}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div class="tree-type" on:click|stopPropagation={() => toggleType(t.code)}>
                  <div class="cb cb-sm" class:cb-on={!typeHidden}>
                    {#if !typeHidden}✓{/if}
                  </div>
                  <div class="type-dot" style="background:#{t.colour}"></div>
                  <span class="tree-type-name" class:dimmed={typeHidden}>{t.name}</span>
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- -- Rotating trigger preview ---------------------------------------------- -->
    {#if isRotating}
      <div class="summary-box rot-box">
        {#if !rotWalk}
          <div class="rot-line">Deriving next trigger…</div>
        {:else if !rotWalk.trigger}
          <div class="rot-line rot-warn">No component matches this inspection’s scope.</div>
        {:else}
          <div class="sum-row">
            <span class="sum-k">NEXT TRIGGER</span>
            <span class="sum-v">{buildComponentRef(rotWalk.trigger, floors, types)}</span>
          </div>
          <div class="rot-line">
            {rotTriggerFloor?.name ?? '?'}{rotWalk.trigger.label ? ` · ${rotWalk.trigger.label}` : ''}
            · checks {rotWalk.linked.length} linked component{rotWalk.linked.length === 1 ? '' : 's'}
          </div>
          {#if rotWalk.linked.length === 0}
            <div class="rot-line rot-warn">⚠ 0 linked components — add component_links to this trigger in Building Assets.</div>
          {/if}
          {#if rotWalk.unresolved.length > 0}
            <div class="rot-line rot-warn">⚠ Unresolved link refs: {rotWalk.unresolved.join(', ')}</div>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- -- Summary box ---------------------------------------------------------- -->
    <div class="summary-box">
      <div class="sum-row">
        <span class="sum-k">COMPONENTS</span>
        <span class="sum-v" class:sum-zero={componentCount === 0}>{componentCount}</span>
      </div>
      <div class="sum-row">
        <span class="sum-k">SCOPE</span>
        <span class="sum-v">
          {#if isRotating}
            {building} · trigger + linked
          {:else}
            {scope === 'building' ? `${building} — all floors` : `${building} · ${selectedFloor?.name ?? '?'}`}
          {/if}
        </span>
      </div>
    </div>


    <!-- -- Session name --------------------------------------------------------- -->
    <section class="grp">
      <div class="grp-lbl">SESSION NAME</div>
      <WalkInput bind:value={sessionName} placeholder="Session name…" />
    </section>

    <WalkError message={error || ''} />

    <WalkButton variant="primary" size="full" loading={saving} disabled={componentCount === 0 || saving}
      on:click={handleBegin}>
      {saving ? 'STARTING…' : `BEGIN ${sessionType === 'test' ? 'TEST' : 'INSPECTION'} (${componentCount})`}
    </WalkButton>

  </div>
</div>

<style>
  .ss { display:flex; flex-direction:column; min-height:100vh; background:#0d0d14; color:#f0f0f0; font-family:'DM Mono','Courier New',monospace; }
  .ss-hdr { display:flex; align-items:center; gap:1rem; padding:1.25rem 1.5rem 1rem; border-bottom:1px solid #2e2e42; background:#111122; }
  .ss-title { font-size:0.7rem; letter-spacing:0.25em; color:#fb923c; flex:1; text-align:center; }
  .ss-body { padding:1.5rem; display:flex; flex-direction:column; gap:1.75rem; flex:1; }
  .grp { display:flex; flex-direction:column; gap:0.75rem; }
  .grp-lbl { font-size:0.62rem; letter-spacing:0.2em; color:#fb923c; font-weight:700; }
  .scope-row { display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; }
  .scope-btn { padding:0.875rem; background:#111122; border:2px solid #2e2e42; border-radius:8px; color:#ccc; font-family:inherit; font-size:0.78rem; font-weight:700; letter-spacing:0.08em; cursor:pointer; transition:all 0.15s; }
  .scope-btn.sel { border-color:#fb923c; color:#fb923c; background:#1a0e00; }
  .scope-btn:hover:not(.sel) { border-color:#5e5e78; }
  .preset-list { display:flex; flex-direction:column; gap:0.5rem; }
  .preset-btn { width:100%; padding:0.75rem 1rem; background:#111122; border:2px solid #2e2e42; border-radius:8px; text-align:left; font-family:inherit; cursor:pointer; transition:all 0.15s; }
  .preset-btn.sel { border-color:#fb923c; background:#1a0e00; }
  .preset-btn:hover:not(.sel) { border-color:#5e5e78; }
  .preset-label { font-size:0.82rem; font-weight:700; color:#f0f0f0; }
  .preset-sub   { font-size:0.68rem; color:#aaa; margin-top:0.2rem; }
  .def-row  { display:flex; align-items:center; justify-content:space-between; gap:0.5rem; }
  .def-band { font-size:0.58rem; font-weight:800; letter-spacing:0.1em; padding:0.15rem 0.45rem; border-radius:4px; border:1px solid transparent; flex-shrink:0; }
  .band-overdue, .band-never_run { background:rgba(239,68,68,0.15); color:#f87171; border-color:rgba(239,68,68,0.4); }
  .band-due_soon { background:rgba(251,191,36,0.12); color:#fbbf24; border-color:rgba(251,191,36,0.35); }
  .band-ok       { background:rgba(74,222,128,0.1);  color:#4ade80; border-color:rgba(74,222,128,0.3); }
  .band-on_demand{ background:rgba(94,94,120,0.2);   color:#aaa;    border-color:#3e3e58; }
  .rot-mark { color:#fb923c; margin-left:0.3rem; font-weight:400; }
  .rot-box  { border-color:rgba(251,146,60,0.4); }
  .rot-line { font-size:0.7rem; color:#aaa; }
  .rot-warn { color:#fbbf24; }
  .type-tree { display:flex; flex-direction:column; gap:0.25rem; background:#111122; border:1px solid #2e2e42; border-radius:8px; padding:0.75rem; }
  .tree-sys { display:flex; align-items:center; gap:0.625rem; cursor:pointer; padding:0.35rem 0; }
  .tree-sys-name { font-size:0.82rem; font-weight:700; color:#f0f0f0; }
  .tree-types { margin-left:1.5rem; display:flex; flex-direction:column; gap:0.2rem; margin-bottom:0.35rem; }
  .tree-type { display:flex; align-items:center; gap:0.5rem; cursor:pointer; padding:0.2rem 0; }
  .tree-type-name { font-size:0.78rem; color:#ccc; }
  .tree-type-name.dimmed { color:#555; text-decoration:line-through; }
  .type-dot { width:0.625rem; height:0.625rem; border-radius:50%; flex-shrink:0; }
  .cb { width:1rem; height:1rem; border:1.5px solid #5e5e78; border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:700; color:#fff; flex-shrink:0; }
  .cb-sm { width:0.85rem; height:0.85rem; font-size:0.6rem; }
  .cb-on      { background:var(--lh-accent-dark); border-color:var(--lh-accent-dark); }
  .cb-partial { background:var(--lh-accent); border-color:var(--lh-accent); }
  .summary-box { background:#111122; border:1px solid #2e2e42; border-radius:8px; padding:1rem; display:flex; flex-direction:column; gap:0.5rem; }
.sum-row { display:flex; justify-content:space-between; align-items:baseline; }
  .sum-k { font-size:0.65rem; letter-spacing:0.15em; color:#888; }
  .sum-v { font-size:0.95rem; color:#f0f0f0; font-weight:700; }
  .sum-zero { color:#ef4444; }
</style>
