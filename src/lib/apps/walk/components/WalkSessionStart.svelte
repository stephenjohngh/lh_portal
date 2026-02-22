<!-- src/lib/apps/walk/components/WalkSessionStart.svelte -->
<!-- Session setup: type, light subtype filter, floor, session name, start element -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger }             from '$lib/utils/logger';
  import { walkStore }             from '../stores/walkStore.js';
  import { ELEMENT_TYPE_OPTIONS }  from '$lib/utils/planConstants';

  const logger   = getLogger('WalkSessionStart');
  const dispatch = createEventDispatcher();

  $: plans       = $walkStore.plans;
  $: allElements = $walkStore.allElements;

  let selectedType       = 'communal_door';
  let lightFilter        = 'all';          // 'all' | 'emergency'
  let selectedPlanId     = '';
  let sessionName        = '';
  let startAssetId       = '';
  let saving             = false;
  let error              = null;

  $: selectedPlan   = plans.find(p => p.id === selectedPlanId);
  $: availablePlans = plans.slice().sort((a, b) =>
    a.building.localeCompare(b.building) || String(a.floor_level).localeCompare(String(b.floor_level))
  );

  // Elements for chosen plan, filtered by type + emergency toggle
  $: elementsForPlan = selectedPlanId
    ? (allElements[selectedPlanId] || []).filter(el => {
        if (el.element_type !== selectedType) return false;
        if (selectedType === 'light' && lightFilter === 'emergency') return el.emergency === true;
        return true;
      }).sort((a, b) => (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true }))
    : [];

  $: elementCount = elementsForPlan.length;

  // Count per plan for the plan-picker badges (respects current filters)
  function countForPlan(planId) {
    return (allElements[planId] || []).filter(el => {
      if (el.element_type !== selectedType) return false;
      if (selectedType === 'light' && lightFilter === 'emergency') return el.emergency === true;
      return true;
    }).length;
  }

  // Auto-generate name whenever meaningful fields change
  $: if (selectedPlanId && selectedPlan) {
    const mon  = new Date().toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    const typ  = typeLabel(selectedType).replace(/\s+/g, '_');
    const sub  = selectedType === 'light' && lightFilter === 'emergency' ? '_Emergency' : '';
    sessionName = `${typ}${sub}_${selectedPlan.building}_F${selectedPlan.floor_level}_${mon}`;
  }

  // Reset start element on plan / type changes
  $: if (selectedPlanId) startAssetId = '';
  $: if (selectedType)   startAssetId = '';

  async function handleStart() {
    if (!selectedPlanId)    { error = 'Please select a floor.'; return; }
    if (elementCount === 0) {
      const note = selectedType === 'light' && lightFilter === 'emergency' ? ' (emergency)' : '';
      error = `No ${typeLabel(selectedType)}${note} elements found on this floor.`;
      return;
    }
    saving = true; error = null;
    try {
      await walkStore.startSession({
        building:           selectedPlan.building,
        floorLevel:         selectedPlan.floor_level,
        elementType:        selectedType,
        startAssetId:       startAssetId || null,
        planId:             selectedPlanId,
        sessionName:        sessionName.trim() || null,
        lightSubtypeFilter: selectedType === 'light' ? lightFilter : null,
      });
      dispatch('started');
    } catch (err) {
      logger('Failed:', err.message);
      error = err.message;
    } finally {
      saving = false;
    }
  }

  function typeLabel(t) { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t; }
  function typeIcon(t)  { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.icon  ?? '■'; }
  function planLabel(p) { return `${p.building} — Floor ${p.floor_level}${p.name ? ` (${p.name})` : ''}`; }
</script>

<div class="ss">

  <!-- Header -->
  <div class="hdr">
    <button class="back" on:click={() => dispatch('cancel')}>← Back</button>
    <span class="hdr-title">NEW SESSION</span>
  </div>

  <div class="body">

    <!-- 01 — Type -->
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

      <!-- Light emergency toggle — only shown when Light selected -->
      {#if selectedType === 'light'}
        <div class="light-toggle">
          <span class="lt-label">INCLUDE</span>
          <div class="lt-row">
            <button class="lt-btn" class:on={lightFilter === 'all'}
                    on:click={() => lightFilter = 'all'}>All lights</button>
            <button class="lt-btn" class:on={lightFilter === 'emergency'}
                    on:click={() => lightFilter = 'emergency'}>⚠ Emergency only</button>
          </div>
        </div>
      {/if}
    </section>

    <!-- 02 — Floor -->
    <section class="grp">
      <div class="grp-lbl">02 — WHICH FLOOR?</div>
      {#if availablePlans.length === 0}
        <p class="hint">No floor plans available — add plans in the Floor Plans app first.</p>
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

    <!-- 03 — Session name (shown once floor chosen) -->
    {#if selectedPlanId}
      <section class="grp">
        <div class="grp-lbl">03 — SESSION NAME</div>
        <p class="hint">Auto-generated — edit if needed</p>
        <input class="text-input" type="text" bind:value={sessionName}
               placeholder="Session name…" maxlength="80" />
      </section>
    {/if}

    <!-- 04 — Start element -->
    {#if elementsForPlan.length > 0}
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

    <!-- Summary box -->
    {#if selectedPlanId && elementCount > 0}
      <div class="summary">
        <div class="s-row"><span class="s-key">TYPE</span>
          <span class="s-val">{typeIcon(selectedType)} {typeLabel(selectedType)}
            {#if selectedType === 'light' && lightFilter === 'emergency'}
              <span class="s-pill">Emergency</span>
            {/if}
          </span>
        </div>
        <div class="s-row"><span class="s-key">FLOOR</span><span class="s-val">{planLabel(selectedPlan)}</span></div>
        <div class="s-row"><span class="s-key">ELEMENTS</span><span class="s-val">{elementCount} to inspect</span></div>
        {#if startAssetId}<div class="s-row"><span class="s-key">START</span><span class="s-val">{startAssetId}</span></div>{/if}
        {#if sessionName}<div class="s-row"><span class="s-key">NAME</span><span class="s-val s-name">{sessionName}</span></div>{/if}
      </div>
    {/if}

    {#if error}<div class="err-box">⚠ {error}</div>{/if}

    <button class="go-btn" on:click={handleStart}
            disabled={saving || !selectedPlanId || elementCount === 0}>
      {saving ? 'STARTING…' : 'BEGIN WALK →'}
    </button>

  </div>
</div>

<style>
  /* ── Root ─────────────────────────────────────────────────────────────── */
  .ss {
    display: flex; flex-direction: column;
    min-height: calc(100vh - 64px);
    background: #0d0d14;
    color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
  }

  /* ── Header ───────────────────────────────────────────────────────────── */
  .hdr {
    display: flex; align-items: center; gap: 1rem;
    padding: 1.25rem 1.5rem 1rem;
    border-bottom: 1px solid #252535;
    background: #111120;
  }
  .back {
    background: none; border: none; color: #fb923c;
    font-family: inherit; font-size: 0.9rem; font-weight: 700;
    letter-spacing: 0.04em; cursor: pointer; padding: 0;
  }
  .back:hover { color: #fdba74; }
  .hdr-title { font-size: 0.7rem; letter-spacing: 0.25em; color: #999; }

  /* ── Body ─────────────────────────────────────────────────────────────── */
  .body { padding: 1.5rem; display: flex; flex-direction: column; gap: 2rem; flex: 1; }

  /* ── Section groups ───────────────────────────────────────────────────── */
  .grp { display: flex; flex-direction: column; gap: 0.75rem; }
  .grp-lbl { font-size: 0.65rem; letter-spacing: 0.2em; color: #fb923c; font-weight: 700; }
  .hint { font-size: 0.8rem; color: #999; margin: 0; }

  /* ── Type selector grid ───────────────────────────────────────────────── */
  .type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }
  .type-btn {
    display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
    padding: 1rem 0.5rem;
    background: #16162a; border: 2px solid #252540;
    border-radius: 10px; cursor: pointer;
    font-family: inherit; transition: all 0.15s;
  }
  .type-btn:hover     { border-color: #4040608; background: #1c1c2e; }
  .type-btn.on        { border-color: #fb923c; background: #2a1600; }
  .type-icon          { font-size: 1.75rem; }
  .type-lbl           { font-size: 0.75rem; color: #ccc; letter-spacing: 0.03em; }
  .type-btn.on .type-lbl { color: #fb923c; font-weight: 700; }

  /* ── Light emergency toggle ───────────────────────────────────────────── */
  .light-toggle {
    padding: 0.875rem 1rem;
    background: #13131f; border: 1px solid #252535; border-radius: 8px;
    display: flex; flex-direction: column; gap: 0.6rem;
  }
  .lt-label { font-size: 0.6rem; letter-spacing: 0.18em; color: #999; }
  .lt-row   { display: flex; gap: 0.5rem; }
  .lt-btn {
    flex: 1; padding: 0.7rem 0.75rem;
    background: #16162a; border: 2px solid #252540; border-radius: 7px;
    color: #ccc; font-family: inherit; font-size: 0.82rem;
    cursor: pointer; transition: all 0.15s;
  }
  .lt-btn:hover  { border-color: #40405e; color: #eee; }
  .lt-btn.on     { border-color: #fb923c; background: #2a1600; color: #fb923c; font-weight: 700; }

  /* ── Plan list ────────────────────────────────────────────────────────── */
  .plan-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .plan-btn {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.875rem 1rem;
    background: #16162a; border: 2px solid #252540; border-radius: 10px;
    cursor: pointer; font-family: inherit; text-align: left; transition: all 0.15s;
  }
  .plan-btn:hover:not(.zero) { border-color: #40405e; background: #1c1c2e; }
  .plan-btn.on               { border-color: #fb923c; background: #2a1600; }
  .plan-btn.zero             { opacity: 0.35; cursor: not-allowed; }
  .plan-info   { display: flex; flex-direction: column; gap: 0.15rem; }
  .plan-bld    { font-size: 0.9rem; color: #f0f0f0; font-weight: 600; }
  .plan-flr    { font-size: 0.72rem; color: #bbb; }
  .plan-cnt    { font-size: 0.78rem; color: #bbb; }
  .plan-cnt.zero { color: #555; }

  /* ── Text / select inputs ─────────────────────────────────────────────── */
  .text-input, .sel-input {
    background: #16162a; border: 2px solid #252540; border-radius: 8px;
    color: #f0f0f0; font-family: inherit; font-size: 0.875rem;
    padding: 0.875rem 1rem; width: 100%; box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .text-input:focus, .sel-input:focus { outline: none; border-color: #fb923c; }
  .text-input::placeholder { color: #555; }
  .sel-input { appearance: none; cursor: pointer; }

  /* ── Summary ──────────────────────────────────────────────────────────── */
  .summary {
    background: #0f1f14; border: 2px solid #1a3a22; border-radius: 10px;
    padding: 1rem 1.125rem; display: flex; flex-direction: column; gap: 0.625rem;
  }
  .s-row  { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
  .s-key  { font-size: 0.6rem; letter-spacing: 0.15em; color: #888; flex-shrink: 0; padding-top: 0.1rem; }
  .s-val  { font-size: 0.825rem; color: #f0f0f0; text-align: right; }
  .s-name { color: #fb923c; font-size: 0.78rem; }
  .s-pill {
    display: inline-block; font-size: 0.58rem; padding: 0.1rem 0.4rem;
    border-radius: 4px; background: #2a1600; color: #fb923c;
    margin-left: 0.4rem; vertical-align: middle;
  }

  /* ── Error ────────────────────────────────────────────────────────────── */
  .err-box {
    font-size: 0.825rem; color: #fca5a5; padding: 0.875rem 1rem;
    background: #2a0000; border: 2px solid #ef4444; border-radius: 8px;
  }

  /* ── Go button ────────────────────────────────────────────────────────── */
  .go-btn {
    padding: 1.125rem; background: #fb923c; border: none; border-radius: 10px;
    color: #0a0a0a; font-family: inherit; font-size: 0.9rem;
    font-weight: 800; letter-spacing: 0.2em;
    cursor: pointer; transition: all 0.15s; margin-top: auto;
  }
  .go-btn:hover:not(:disabled) { background: #f97316; }
  .go-btn:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
