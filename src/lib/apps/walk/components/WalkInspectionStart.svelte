<!-- src/lib/apps/walk/components/WalkInspectionStart.svelte -->
<!-- Start screen for formal inspection sessions.
     Single-floor only. Floor selected via dropdown (not buttons).
     Always sets sessionType = 'inspection'. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import { ELEMENT_TYPE_OPTIONS, FLOOR_LEVELS } from '$lib/utils/planConstants';
  import WalkInput  from './common/WalkInput.svelte';
  import WalkButton from './common/WalkButton.svelte';
  import WalkSelect from './common/WalkSelect.svelte';
  import WalkError from './common/WalkError.svelte';

  const logger = getLogger('WalkInspectionStart');
  const dispatch = createEventDispatcher();

  $: plans      = $walkStore.plans;
  $: allElements = $walkStore.allElements;

  // Floor sort order — L→U→G→1–7, matching the dropdown definition order
  const FLOOR_ORDER = Object.fromEntries(FLOOR_LEVELS.map((f, i) => [f.value, i]));

  let selectedType    = 'communal_door';
  let lightFilter     = 'all';
  let selectedPlanId  = '';
  let sessionName     = '';
  let startAssetId    = '';
  let saving          = false;
  let error           = null;

  $: selectedPlan = plans.find(p => p.id === selectedPlanId);

  // Plans sorted building → standard floor order (L→U→G→1–7)
  $: availablePlans = plans.slice().sort((a, b) => {
    const bldCmp = a.building.localeCompare(b.building);
    if (bldCmp !== 0) return bldCmp;
    return (FLOOR_ORDER[String(a.floor_level)] ?? 99) - (FLOOR_ORDER[String(b.floor_level)] ?? 99);
  });

  $: elementsForPlan = selectedPlanId
    ? (allElements[selectedPlanId] || []).filter(el => {
        if (el.element_type !== selectedType) return false;
        if (selectedType === 'light' && lightFilter === 'emergency') return el.emergency === true;
        return true;
      }).sort((a, b) => (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true }))
    : [];

  $: elementCount = elementsForPlan.length;

  // Auto-generate session name — always prefixed with Inspection_
  $: if (selectedPlanId && selectedPlan) {
    const mon = new Date().toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    const mon2 = mon.replace(/\s+/g, '_');
    const typ  = typeLabel(selectedType).replace(/\s+/g, '_');
    const sub  = selectedType === 'light' && lightFilter === 'emergency' ? '_Emer' : '';
    const bld  = buildingInitials(selectedPlan.building);
    sessionName = `Insp_${typ}${sub}_${bld}_${selectedPlan.floor_level}_${mon2}`;
  }

  $: if (selectedPlanId) startAssetId = '';
  $: if (selectedType)   startAssetId = '';

  async function handleStart() {
    if (!selectedPlanId) { error = 'Please select a floor.'; return; }
    if (elementCount === 0) {
      const suffix = selectedType === 'light' && lightFilter === 'emergency' ? ' (emergency)' : '';
      error = `No ${typeLabel(selectedType)}${suffix} elements found on this floor.`;
      return;
    }
    saving = true;
    error  = null;
    logger('🔵 handleStart — calling walkStore.startSession', { selectedPlanId, selectedType, sessionName });
    try {
      const result = await walkStore.startSession({
        building:           selectedPlan.building,
        floorLevel:         selectedPlan.floor_level,
        elementType:        selectedType,
        startAssetId:       startAssetId || null,
        planId:             selectedPlanId,
        sessionName:        sessionName.trim() || null,
        lightSubtypeFilter: selectedType === 'light' ? lightFilter : null,
        sessionType:        'inspection'
      });
      logger('🔵 handleStart — startSession returned, dispatching started', result?.id);
      dispatch('started');
      logger('🔵 handleStart — dispatched');
    } catch (err) {
      logger('🔴 handleStart — caught error:', err.message, err);
      error = err.message || 'An unknown error occurred. Check the console.';
    } finally {
      saving = false;
    }
  }

  function typeLabel(t) { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t; }
  function typeIcon(t)   { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.icon  ?? '■'; }
  function buildingInitials(name) {
    return name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('');
  }
  function countForPlan(planId) {
    return (allElements[planId] || []).filter(el => {
      if (el.element_type !== selectedType) return false;
      if (selectedType === 'light' && lightFilter === 'emergency') return el.emergency === true;
      return true;
    }).length;
  }
  function planOptionLabel(p) {
    const cnt = countForPlan(p.id);
    return `${p.building} — Floor ${p.floor_level}${p.name ? ` (${p.name})` : ''}  [${cnt} element${cnt !== 1 ? 's' : ''}]`;
  }
</script>

<div class="ss">
  <div class="ss-hdr">
    <button class="back-btn" on:click={() => dispatch('back')}>← Back</button>
    <span class="ss-title">NEW INSPECTION</span>
  </div>

  <div class="ss-body">

    <!-- 01 — Floor selection (dropdown) -->
    <section class="grp">
      <div class="grp-lbl">01 — WHICH FLOOR?</div>
      {#if availablePlans.length === 0}
        <p class="hint">No floor plans available — add plans first.</p>
      {:else}
        <!-- floor select: native <select> retained for option content complexity -->
        <select class="sel-input" bind:value={selectedPlanId}>
          <option value="">— Select a floor —</option>
          {#each availablePlans as plan}
            {@const cnt = countForPlan(plan.id)}
            <option value={plan.id} disabled={cnt === 0}>
              {planOptionLabel(plan)}
            </option>
          {/each}
        </select>
        {#if selectedPlan}
          <p class="hint">
            {selectedPlan.building} · Floor {selectedPlan.floor_level}
            — {elementCount} {typeLabel(selectedType)}{elementCount !== 1 ? 's' : ''} to inspect
          </p>
        {/if}
      {/if}
    </section>

    <!-- 02 — What are you inspecting? -->
    <section class="grp">
      <div class="grp-lbl">02 — WHAT ARE YOU INSPECTING?</div>
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

    <!-- 03 — Session name -->
    {#if selectedPlanId}
      <section class="grp">
        <div class="grp-lbl">03 — SESSION NAME</div>
        <p class="hint">Auto-generated — edit if needed</p>
        <WalkInput
          bind:value={sessionName}
          placeholder="Session name…"
          maxlength={80}
        />
      </section>
    {/if}

    <!-- 04 — Start element (optional) -->
    {#if elementsForPlan.length > 0}
      <section class="grp">
        <div class="grp-lbl">04 — START FROM (OPTIONAL)</div>
        <p class="hint">Leave blank to start from the first element.</p>
        <WalkSelect
          bind:value={startAssetId}
          options={[
            { value: '', label: '— First element (' + (elementsForPlan[0]?.asset_id ?? 'unknown') + ') —' },
            ...elementsForPlan.map(el => ({
              value: el.asset_id ?? '',
              label: (el.asset_id ?? 'No ID') + (el.label ? ' — ' + el.label : '')
            }))
          ]}
          placeholder={null}
        />
      </section>
    {/if}

    <!-- Summary -->
    {#if elementCount > 0}
      <div class="summary">
        <div class="s-row">
          <span class="s-k">TYPE</span>
          <span class="s-v">{typeIcon(selectedType)} {typeLabel(selectedType)}
            {#if selectedType === 'light' && lightFilter === 'emergency'}<span class="s-pill">Emergency</span>{/if}
          </span>
        </div>
        <div class="s-row"><span class="s-k">FLOOR</span><span class="s-v">{selectedPlan?.building} · Floor {selectedPlan?.floor_level}</span></div>
        <div class="s-row"><span class="s-k">ELEMENTS</span><span class="s-v">{elementCount} to inspect</span></div>
        {#if sessionName}<div class="s-row"><span class="s-k">NAME</span><span class="s-v s-name">{sessionName}</span></div>{/if}
        <div class="s-row"><span class="s-k">SESSION</span><span class="s-v s-insp">INSPECTION</span></div>
      </div>
    {/if}

    <WalkError message={error || ''} />

    <WalkButton variant="primary" size="full"
      loading={saving}
      disabled={elementCount === 0 || !selectedPlanId}
      on:click={handleStart}>
      {saving ? 'STARTING…' : 'BEGIN INSPECTION →'}
    </WalkButton>

  </div>
</div>

<style>
  .ss { display: flex; flex-direction: column; min-height: calc(100vh - 64px); background: #0d0d14; color: #f0f0f0; font-family: 'DM Mono', 'Courier New', monospace; }
  .ss-hdr { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem 1rem; border-bottom: 1px solid #2e2e42; background: #111122; }
  .ss-title { font-size: 0.7rem; letter-spacing: 0.25em; color: #60a5fa; }
  .ss-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 2rem; flex: 1; }
  .grp { display: flex; flex-direction: column; gap: 0.75rem; }
  .grp-lbl { font-size: 0.65rem; letter-spacing: 0.2em; color: #60a5fa; font-weight: 700; }
  .hint { font-size: 0.82rem; color: #bbb; margin: 0; }

  .type-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.625rem; }
  .type-btn { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 1rem 0.5rem; background: #0f1a2e; border: 2px solid #1e3a5f; border-radius: 10px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
  .type-btn:hover { border-color: #3b82f6; background: #111f35; }
  .type-btn.on { border-color: #60a5fa; background: #0a1f35; }
  .type-icon { font-size: 1.75rem; }
  .type-lbl { font-size: 0.75rem; color: #ccc; letter-spacing: 0.03em; }
  .type-btn.on .type-lbl { color: #60a5fa; font-weight: 700; }

  .lt-box { padding: 0.875rem 1rem; background: #0a1420; border: 1px solid #1e3a5f; border-radius: 8px; display: flex; flex-direction: column; gap: 0.6rem; }
  .lt-lbl { font-size: 0.6rem; letter-spacing: 0.18em; color: #bbb; }
  .lt-row { display: flex; gap: 0.5rem; }
  .lt-btn { flex: 1; padding: 0.65rem 0.75rem; background: #0f1a2e; border: 2px solid #1e3a5f; border-radius: 7px; color: #ccc; font-family: inherit; font-size: 0.82rem; cursor: pointer; transition: all 0.15s; }
  .lt-btn:hover { border-color: #3b82f6; color: #eee; }
  .lt-btn.on { border-color: #60a5fa; background: #0a1f35; color: #60a5fa; font-weight: 700; }


  .summary { background: #050f1f; border: 2px solid #1e3a5f; border-radius: 10px; padding: 1rem 1.125rem; display: flex; flex-direction: column; gap: 0.625rem; }
  .s-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
  .s-k { font-size: 0.62rem; letter-spacing: 0.15em; color: #aaa; flex-shrink: 0; padding-top: 0.1rem; }
  .s-v { font-size: 0.85rem; color: #f0f0f0; text-align: right; }
  .s-name { color: #60a5fa; font-size: 0.78rem; }
  .s-insp { color: #60a5fa; font-weight: 700; letter-spacing: 0.1em; font-size: 0.75rem; }
  .s-pill { display: inline-block; font-size: 0.58rem; padding: 0.1rem 0.4rem; border-radius: 4px; background: #0a1f35; color: #60a5fa; margin-left: 0.4rem; vertical-align: middle; }


</style>
