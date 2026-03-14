<!-- src/lib/apps/walk/components/WalkSessionStart.svelte -->
<!-- UPDATED: Building-wide session mode + single-plan mode -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';

  const logger = getLogger('WalkSessionStart');
  const dispatch = createEventDispatcher();

  export let sessionType = 'test'; // 'test' | 'inspection' — passed in from WalkApp

  $: plans = $walkStore.plans;
  $: allElements = $walkStore.allElements;

  let sessionMode = 'single_plan'; // 'single_plan' | 'building'
  let selectedType = 'communal_door';
  let lightFilter = 'all';
  let selectedPlanId = '';
  let selectedBuilding = '';
  let sessionName = '';
  let startAssetId = '';
  let saving = false;
  let error = null;

  $: selectedPlan = plans.find(p => p.id === selectedPlanId);
  $: availablePlans = plans.slice().sort((a, b) =>
    a.building.localeCompare(b.building) ||
    String(a.floor_level).localeCompare(String(b.floor_level), undefined, { numeric: true })
  );

  $: buildings = [...new Set(plans.map(p => p.building))].sort();

  $: elementsForPlan = selectedPlanId
    ? (allElements[selectedPlanId] || []).filter(el => {
        if (el.element_type !== selectedType) return false;
        if (selectedType === 'light' && lightFilter === 'emergency') return el.emergency === true;
        return true;
      }).sort((a, b) => (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true }))
    : [];

  $: buildingElementCount = sessionMode === 'building' && selectedBuilding
    ? plans.filter(p => p.building === selectedBuilding).reduce((sum, plan) => {
        const elements = (allElements[plan.id] || []).filter(el => {
          if (el.element_type !== selectedType) return false;
          if (selectedType === 'light' && lightFilter === 'emergency') return el.emergency === true;
          return true;
        });
        return sum + elements.length;
      }, 0)
    : 0;

  $: buildingPlanCount = selectedBuilding
    ? plans.filter(p => p.building === selectedBuilding).length
    : 0;

  $: elementCount = sessionMode === 'single_plan' ? elementsForPlan.length : buildingElementCount;

  // Auto-generate session name
  $: if (sessionMode === 'single_plan' && selectedPlanId && selectedPlan) {
    const mon = new Date().toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    const mon2 = mon.replace(/\s+/g, '_');

    const typ = typeLabel(selectedType).replace(/\s+/g, '_');
    const sub = selectedType === 'light' && lightFilter === 'emergency' ? '_Emergency' : '';
    const bld = buildingInitials(selectedPlan.building);
    sessionName = `${typ}${sub}_${bld}_F${selectedPlan.floor_level}_${mon2}`;
  } else if (sessionMode === 'building' && selectedBuilding) {
    const mon = new Date().toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    const mon2 = mon.replace(/\s+/g, '_');
    const typ = typeLabel(selectedType).replace(/\s+/g, '_');
    const sub = selectedType === 'light' && lightFilter === 'emergency' ? '_Emergency' : '';
    const bld = buildingInitials(selectedBuilding);
    sessionName = `${typ}${sub}_${bld}_Building_${mon2}`;
  }

  $: if (selectedPlanId) startAssetId = '';
  $: if (selectedType) startAssetId = '';
  $: if (sessionMode === 'building') { selectedPlanId = ''; startAssetId = ''; }

  async function handleStart() {
    if (sessionMode === 'single_plan') {
      if (!selectedPlanId) { error = 'Please select a floor.'; return; }
      if (elementCount === 0) {
        const suffix = selectedType === 'light' && lightFilter === 'emergency' ? ' (emergency)' : '';
        error = `No ${typeLabel(selectedType)}${suffix} elements found on this floor.`;
        return;
      }
    } else {
      if (!selectedBuilding) { error = 'Please select a building.'; return; }
      if (elementCount === 0) {
        const suffix = selectedType === 'light' && lightFilter === 'emergency' ? ' (emergency)' : '';
        error = `No ${typeLabel(selectedType)}${suffix} elements found in this building.`;
        return;
      }
    }

    saving = true;
    error = null;
    
    try {
      if (sessionMode === 'building') {
        await walkStore.startBuildingWideSession({
          building: selectedBuilding,
          elementType: selectedType,
          sessionName: sessionName.trim() || null,
          lightSubtypeFilter: selectedType === 'light' ? lightFilter : null,
          sessionType
        });
      } else {
        await walkStore.startSession({
          building: selectedPlan.building,
          floorLevel: selectedPlan.floor_level,
          elementType: selectedType,
          startAssetId: startAssetId || null,
          planId: selectedPlanId,
          sessionName: sessionName.trim() || null,
          lightSubtypeFilter: selectedType === 'light' ? lightFilter : null,
          sessionType
        });
      }
      dispatch('started');
    } catch (err) {
      logger('Start failed:', err.message);
      error = err.message;
    } finally {
      saving = false;
    }
  }

  function typeLabel(t) { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t; }
  function typeIcon(t) { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.icon ?? '■'; }
  function buildingInitials(name) {
    return name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('');
  }
  function planLabel(p) {
    return `${p.building} — Floor ${p.floor_level}${p.name ? ` (${p.name})` : ''}`;
  }
  function countForPlan(planId) {
    return (allElements[planId] || []).filter(el => {
      if (el.element_type !== selectedType) return false;
      if (selectedType === 'light' && lightFilter === 'emergency') return el.emergency === true;
      return true;
    }).length;
  }
</script>

<div class="ss">
  <div class="ss-hdr">
    <button class="back-btn" on:click={() => dispatch('cancel')}>← Back</button>
    <span class="ss-title">NEW SESSION</span>
  </div>

  <div class="ss-body">
    <!-- Mode Selection -->
    <section class="grp">
      <div class="grp-lbl">00 — SESSION SCOPE</div>
      <div class="mode-grid">
        <button class="mode-btn" class:on={sessionMode === 'single_plan'}
                on:click={() => sessionMode = 'single_plan'}>
          <span class="mode-icon">📄</span>
          <span class="mode-lbl">Single Floor</span>
          <span class="mode-desc">Inspect one floor plan</span>
        </button>
        <button class="mode-btn" class:on={sessionMode === 'building'}
                on:click={() => sessionMode = 'building'}>
          <span class="mode-icon">🏢</span>
          <span class="mode-lbl">Building-Wide</span>
          <span class="mode-desc">All floors in building</span>
        </button>
      </div>
    </section>

    <!-- Type -->
    <section class="grp">
      <div class="grp-lbl">01 — WHAT ARE YOU INSPECTING?</div>
      <div class="type-grid">
        {#each ELEMENT_TYPE_OPTIONS as opt}
          <button class="type-btn" class:on={selectedType === opt.value}
                  on:click={() => selectedType = opt.value}>
            <span class="type-icon">{opt.icon}</span>
            <span class="type-lbl">{opt.label}</span>
          </button>
        {/each}
      </div>

      {#if selectedType === 'light'}
        <div class="lt-box">
          <span class="lt-lbl">INCLUDE</span>
          <div class="lt-row">
            <button class="lt-btn" class:on={lightFilter === 'all'}
                    on:click={() => lightFilter = 'all'}>All lights</button>
            <button class="lt-btn" class:on={lightFilter === 'emergency'}
                    on:click={() => lightFilter = 'emergency'}>⚠ Emergency only</button>
          </div>
        </div>
      {/if}
    </section>

    <!-- Building or Floor Selection -->
    {#if sessionMode === 'building'}
      <section class="grp">
        <div class="grp-lbl">02 — WHICH BUILDING?</div>
        {#if buildings.length === 0}
          <p class="hint">No buildings available — add plans first.</p>
        {:else}
          <div class="building-list">
            {#each buildings as building}
              {@const planCount = plans.filter(p => p.building === building).length}
              <button class="building-btn" class:on={selectedBuilding === building}
                      on:click={() => selectedBuilding = building}>
                <div class="building-info">
                  <span class="building-name">{building}</span>
                  <span class="building-meta">{planCount} floors</span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {:else}
      <section class="grp">
        <div class="grp-lbl">02 — WHICH FLOOR?</div>
        {#if availablePlans.length === 0}
          <p class="hint">No floor plans available — add plans first.</p>
        {:else}
          <div class="plan-list">
            {#each availablePlans as plan}
              {@const cnt = countForPlan(plan.id)}
              <button class="plan-btn" class:on={selectedPlanId === plan.id} class:zero={cnt === 0}
                      on:click={() => { if (cnt > 0) { selectedPlanId = plan.id; startAssetId = ''; } }}>
                <div class="plan-info">
                  <span class="plan-bld">{plan.building}</span>
                  <span class="plan-flr">Floor {plan.floor_level}</span>
                </div>
                <span class="plan-cnt" class:zero={cnt === 0}>{cnt} {cnt === 1 ? 'element' : 'elements'}</span>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Session name -->
    {#if (sessionMode === 'single_plan' && selectedPlanId) || (sessionMode === 'building' && selectedBuilding)}
      <section class="grp">
        <div class="grp-lbl">03 — SESSION NAME</div>
        <p class="hint">Auto-generated — edit if needed</p>
        <input class="txt-input" type="text" bind:value={sessionName}
               placeholder="Session name…" maxlength="80" />
      </section>
    {/if}

    <!-- Start element (single-plan only) -->
    {#if sessionMode === 'single_plan' && elementsForPlan.length > 0}
      <section class="grp">
        <div class="grp-lbl">04 — START FROM (OPTIONAL)</div>
        <p class="hint">Leave blank to start from the first element.</p>
        <select class="sel-input" bind:value={startAssetId}>
          <option value="">— First element ({elementsForPlan[0]?.asset_id ?? 'unknown'}) —</option>
          {#each elementsForPlan as el}
            <option value={el.asset_id ?? ''}>{el.asset_id ?? 'No ID'}{el.label ? ` — ${el.label}` : ''}</option>
          {/each}
        </select>
      </section>
    {/if}

    <!-- Summary -->
    {#if elementCount > 0}
      <div class="summary">
        <div class="s-row"><span class="s-k">MODE</span>
          <span class="s-v">{sessionMode === 'building' ? '🏢 Building-Wide' : '📄 Single Floor'}</span>
        </div>
        <div class="s-row"><span class="s-k">TYPE</span>
          <span class="s-v">{typeIcon(selectedType)} {typeLabel(selectedType)}
            {#if selectedType === 'light' && lightFilter === 'emergency'}<span class="s-pill">Emergency</span>{/if}
          </span>
        </div>
        {#if sessionMode === 'building'}
          <div class="s-row"><span class="s-k">BUILDING</span><span class="s-v">{selectedBuilding}</span></div>
          <div class="s-row"><span class="s-k">FLOORS</span><span class="s-v">{buildingPlanCount} floors</span></div>
        {:else}
          <div class="s-row"><span class="s-k">FLOOR</span><span class="s-v">{planLabel(selectedPlan)}</span></div>
        {/if}
        <div class="s-row"><span class="s-k">ELEMENTS</span><span class="s-v">{elementCount} to inspect</span></div>
        {#if sessionName}<div class="s-row"><span class="s-k">NAME</span><span class="s-v s-name">{sessionName}</span></div>{/if}
      </div>
    {/if}

    {#if error}<div class="err-box">⚠ {error}</div>{/if}

    <button class="go-btn" on:click={handleStart} 
            disabled={saving || elementCount === 0 || (!selectedPlanId && !selectedBuilding)}>
      {saving ? 'STARTING…' : 'BEGIN WALK →'}
    </button>
  </div>
</div>

<style>
  .ss { display: flex; flex-direction: column; min-height: calc(100vh - 64px); background: #0d0d14; color: #f0f0f0; font-family: 'DM Mono', 'Courier New', monospace; }
  .ss-hdr { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem 1rem; border-bottom: 1px solid #2e2e42; background: #111122; }
  .back-btn { background: none; border: none; color: #fb923c; font-family: inherit; font-size: 0.9rem; font-weight: 700; cursor: pointer; padding: 0; }
  .back-btn:hover { color: #fdba74; }
  .ss-title { font-size: 0.7rem; letter-spacing: 0.25em; color: #aaa; }
  .ss-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 2rem; flex: 1; }
  .grp { display: flex; flex-direction: column; gap: 0.75rem; }
  .grp-lbl { font-size: 0.65rem; letter-spacing: 0.2em; color: #fb923c; font-weight: 700; }
  .hint { font-size: 0.82rem; color: #bbb; margin: 0; }
  
  .mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }
  .mode-btn { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 1rem 0.5rem; background: #1a1a2e; border: 2px solid #2e2e48; border-radius: 10px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
  .mode-btn:hover { border-color: #4e4e78; background: #1e1e38; }
  .mode-btn.on { border-color: #fb923c; background: #2a1800; }
  .mode-icon { font-size: 1.75rem; }
  .mode-lbl { font-size: 0.8rem; color: #ccc; letter-spacing: 0.03em; font-weight: 600; }
  .mode-desc { font-size: 0.65rem; color: #999; }
  .mode-btn.on .mode-lbl { color: #fb923c; font-weight: 700; }
  
  .type-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.625rem; }
  .type-btn { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 1rem 0.5rem; background: #1a1a2e; border: 2px solid #2e2e48; border-radius: 10px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
  .type-btn:hover { border-color: #4e4e78; background: #1e1e38; }
  .type-btn.on { border-color: #fb923c; background: #2a1800; }
  .type-icon { font-size: 1.75rem; }
  .type-lbl { font-size: 0.75rem; color: #ccc; letter-spacing: 0.03em; }
  .type-btn.on .type-lbl { color: #fb923c; font-weight: 700; }
  
  .lt-box { padding: 0.875rem 1rem; background: #141428; border: 1px solid #2e2e42; border-radius: 8px; display: flex; flex-direction: column; gap: 0.6rem; }
  .lt-lbl { font-size: 0.6rem; letter-spacing: 0.18em; color: #bbb; }
  .lt-row { display: flex; gap: 0.5rem; }
  .lt-btn { flex: 1; padding: 0.65rem 0.75rem; background: #1a1a2e; border: 2px solid #2e2e48; border-radius: 7px; color: #ccc; font-family: inherit; font-size: 0.82rem; cursor: pointer; transition: all 0.15s; }
  .lt-btn:hover { border-color: #5e5e88; color: #eee; }
  .lt-btn.on { border-color: #fb923c; background: #2a1800; color: #fb923c; font-weight: 700; }
  
  .building-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .building-btn { display: flex; align-items: center; padding: 0.875rem 1rem; background: #1a1a2e; border: 2px solid #2e2e48; border-radius: 10px; cursor: pointer; font-family: inherit; text-align: left; transition: all 0.15s; }
  .building-btn:hover { border-color: #4e4e78; background: #1e1e38; }
  .building-btn.on { border-color: #fb923c; background: #2a1800; }
  .building-info { display: flex; flex-direction: column; gap: 0.15rem; }
  .building-name { font-size: 0.9rem; color: #f0f0f0; font-weight: 600; }
  .building-meta { font-size: 0.75rem; color: #ccc; }
  
  .plan-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .plan-btn { display: flex; align-items: center; justify-content: space-between; padding: 0.875rem 1rem; background: #1a1a2e; border: 2px solid #2e2e48; border-radius: 10px; cursor: pointer; font-family: inherit; text-align: left; transition: all 0.15s; }
  .plan-btn:hover:not(.zero) { border-color: #4e4e78; background: #1e1e38; }
  .plan-btn.on { border-color: #fb923c; background: #2a1800; }
  .plan-btn.zero { opacity: 0.35; cursor: not-allowed; }
  .plan-info { display: flex; flex-direction: column; gap: 0.15rem; }
  .plan-bld { font-size: 0.9rem; color: #f0f0f0; font-weight: 600; }
  .plan-flr { font-size: 0.75rem; color: #ccc; }
  .plan-cnt { font-size: 0.78rem; color: #ccc; }
  .plan-cnt.zero { color: #666; }
  
  .txt-input, .sel-input { background: #1a1a2e; border: 2px solid #2e2e48; border-radius: 8px; color: #f0f0f0; font-family: inherit; font-size: 0.875rem; padding: 0.875rem 1rem; width: 100%; box-sizing: border-box; transition: border-color 0.15s; }
  .txt-input:focus, .sel-input:focus { outline: none; border-color: #fb923c; }
  .txt-input::placeholder { color: #666; }
  .sel-input { appearance: none; cursor: pointer; }
  
  .summary { background: #0f1f14; border: 2px solid #1a3d24; border-radius: 10px; padding: 1rem 1.125rem; display: flex; flex-direction: column; gap: 0.625rem; }
  .s-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
  .s-k { font-size: 0.62rem; letter-spacing: 0.15em; color: #aaa; flex-shrink: 0; padding-top: 0.1rem; }
  .s-v { font-size: 0.85rem; color: #f0f0f0; text-align: right; }
  .s-name { color: #fb923c; font-size: 0.78rem; }
  .s-pill { display: inline-block; font-size: 0.58rem; padding: 0.1rem 0.4rem; border-radius: 4px; background: #2a1800; color: #fb923c; margin-left: 0.4rem; vertical-align: middle; }
  
  .err-box { font-size: 0.825rem; color: #fca5a5; padding: 0.875rem 1rem; background: #2a0000; border: 2px solid #ef4444; border-radius: 8px; }
  
  .go-btn { padding: 1.125rem; background: #fb923c; border: none; border-radius: 10px; color: #0a0a0a; font-family: inherit; font-size: 0.9rem; font-weight: 800; letter-spacing: 0.2em; cursor: pointer; transition: all 0.15s; margin-top: auto; }
  .go-btn:hover:not(:disabled) { background: #f97316; }
  .go-btn:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
