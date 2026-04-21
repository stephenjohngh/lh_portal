<!-- src/lib/apps/inspection/components/InspectionSessionStart.svelte -->
<!-- Configure and start a new test or inspection session.
     Presets: Emergency Lighting, Fire Doors, Apartment Doors, Custom (full tree). -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger }    from '$lib/utils/logger';
  import { inspectionStore }  from '../stores/inspectionStore.js';
  import { generateSessionName } from '../utils/sessionNaming.js';
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
  let showCustom = false;
  let selectedFacilityId = '';
  let selectedFloorId    = '';
  let sessionName        = '';
  let saving             = false;
  let error              = null;

  // Custom tree: set of hidden type codes (same exclusive model as plan filter)
  let hiddenTypeCodes = new Set();

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
  // Emergency: check component_attributes for attr_name='emergency', value='true'
  // (attr_name is enriched into allComponentAttrs during store load()).
  $: componentCount = (() => {
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
    const floor = scope === 'single_floor' ? selectedFloor : null;
    sessionName = generateSessionName({ preset, building, floor, scope });
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
      const opts = {
        building,
        typeFilter:   presetTypeFilter,
        emergencyOnly,
        sessionName,
        sessionType,
        preset,
      };
      if (scope === 'single_floor') {
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

    <!-- -- Scope --------------------------------------------------------------- -->
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

    {#if scope === 'single_floor'}
      <section class="grp">
        <div class="grp-lbl">FLOOR</div>
        <WalkSelect
          bind:value={selectedFloorId}
          options={buildingFloors.map(f => ({ value: f.id, label: f.name }))}
          placeholder=""
        />
      </section>
    {/if}

    <!-- -- Preset --------------------------------------------------------------- -->
    <section class="grp">
      <div class="grp-lbl">INSPECTION TYPE</div>
      <div class="preset-list">
        {#each PRESETS as p (p.id)}
          <button
            class="preset-btn"
            class:sel={preset === p.id}
            on:click={() => { preset = p.id; showCustom = p.id === 'custom'; }}
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

    <!-- -- Summary box ---------------------------------------------------------- -->
    <div class="summary-box">
      <div class="sum-row">
        <span class="sum-k">COMPONENTS</span>
        <span class="sum-v" class:sum-zero={componentCount === 0}>{componentCount}</span>
      </div>
      <div class="sum-row">
        <span class="sum-k">SCOPE</span>
        <span class="sum-v">{scope === 'building' ? `${building} — all floors` : `${building} · ${selectedFloor?.name ?? '?'}`}</span>
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
  .cb-on      { background:#307869; border-color:#307869; }
  .cb-partial { background:#5b21b6; border-color:#5b21b6; }
  .summary-box { background:#111122; border:1px solid #2e2e42; border-radius:8px; padding:1rem; display:flex; flex-direction:column; gap:0.5rem; }
.sum-row { display:flex; justify-content:space-between; align-items:baseline; }
  .sum-k { font-size:0.65rem; letter-spacing:0.15em; color:#888; }
  .sum-v { font-size:0.95rem; color:#f0f0f0; font-weight:700; }
  .sum-zero { color:#ef4444; }
</style>
