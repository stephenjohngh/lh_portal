<!-- src/lib/apps/walk/components/WalkSessionStart.svelte -->
<!-- Session configuration: type, building, floor, starting element -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';

  const logger = getLogger('WalkSessionStart');
  const dispatch = createEventDispatcher();

  // Only door types are relevant for walk — but allow all
  const typeOptions = ELEMENT_TYPE_OPTIONS;

  $: plans        = $walkStore.plans;
  $: allElements  = $walkStore.allElements;

  // Form state
  let selectedType     = 'communal_door';
  let selectedPlanId   = '';
  let startAssetId     = '';
  let saving           = false;
  let error            = null;

  // Derived
  $: selectedPlan = plans.find(p => p.id === selectedPlanId);

  $: availablePlans = plans
    .slice()
    .sort((a, b) => a.building.localeCompare(b.building) || a.floor_level - b.floor_level);

  $: elementsForPlan = selectedPlanId
    ? (allElements[selectedPlanId] || [])
        .filter(el => el.element_type === selectedType)
        .sort((a, b) => (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true }))
    : [];

  $: elementCount = elementsForPlan.length;

  $: planLabel = (plan) =>
    `${plan.building} — Floor ${plan.floor_level}${plan.name ? ` (${plan.name})` : ''}`;

  // When plan changes, reset start element
  $: if (selectedPlanId) startAssetId = '';

  // When type changes, reset start element
  $: if (selectedType) startAssetId = '';

  async function handleStart() {
    if (!selectedPlanId) { error = 'Please select a building / floor.'; return; }
    if (elementCount === 0) { error = `No ${typeLabel(selectedType)} elements found on this floor.`; return; }

    saving = true;
    error  = null;
    try {
      await walkStore.startSession({
        building:    selectedPlan.building,
        floorLevel:  selectedPlan.floor_level,
        elementType: selectedType,
        startAssetId: startAssetId || null,
        planId:      selectedPlanId
      });
      dispatch('started');
    } catch (err) {
      logger('❌ Start session failed:', err.message);
      error = err.message;
    } finally {
      saving = false;
    }
  }

  function typeLabel(type) {
    return ELEMENT_TYPE_OPTIONS.find(t => t.value === type)?.label ?? type;
  }

  function typeIcon(type) {
    return ELEMENT_TYPE_OPTIONS.find(t => t.value === type)?.icon ?? '■';
  }
</script>

<div class="start-screen">

  <!-- Header -->
  <div class="start-header">
    <button class="back-btn" on:click={() => dispatch('cancel')}>← Back</button>
    <div class="start-title">NEW SESSION</div>
  </div>

  <div class="start-body">

    <!-- Step 1: Element type -->
    <div class="field-group">
      <div class="field-label">01 — WHAT ARE YOU INSPECTING?</div>
      <div class="type-grid">
        {#each typeOptions as type}
          <button
            class="type-btn"
            class:selected={selectedType === type.value}
            on:click={() => selectedType = type.value}
          >
            <span class="type-btn-icon">{type.icon}</span>
            <span class="type-btn-label">{type.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Step 2: Building / floor -->
    <div class="field-group">
      <div class="field-label">02 — WHICH FLOOR?</div>
      {#if availablePlans.length === 0}
        <div class="field-hint">No floor plans available. Add plans in the Floor Plans app first.</div>
      {:else}
        <div class="plan-list">
          {#each availablePlans as plan}
            {@const count = (allElements[plan.id] || []).filter(el => el.element_type === selectedType).length}
            <button
              class="plan-btn"
              class:selected={selectedPlanId === plan.id}
              class:empty={count === 0}
              on:click={() => { selectedPlanId = plan.id; startAssetId = ''; }}
            >
              <div class="plan-btn-main">
                <span class="plan-building">{plan.building}</span>
                <span class="plan-floor">Floor {plan.floor_level}</span>
              </div>
              <span class="plan-count" class:zero={count === 0}>
                {count} {count === 1 ? 'element' : 'elements'}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Step 3: Start element (optional) -->
    {#if elementsForPlan.length > 0}
      <div class="field-group">
        <div class="field-label">03 — START FROM (OPTIONAL)</div>
        <div class="field-hint">Leave blank to start from the first element.</div>
        <select class="field-select" bind:value={startAssetId}>
          <option value="">— First element ({elementsForPlan[0]?.asset_id ?? 'unknown'}) —</option>
          {#each elementsForPlan as el}
            <option value={el.asset_id ?? ''}>
              {el.asset_id ?? 'No ID'}{el.label ? ` — ${el.label}` : ''}
            </option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- Summary -->
    {#if selectedPlanId && elementCount > 0}
      <div class="summary-box">
        <div class="summary-row">
          <span class="summary-key">TYPE</span>
          <span class="summary-val">{typeIcon(selectedType)} {typeLabel(selectedType)}</span>
        </div>
        <div class="summary-row">
          <span class="summary-key">FLOOR</span>
          <span class="summary-val">{planLabel(selectedPlan)}</span>
        </div>
        <div class="summary-row">
          <span class="summary-key">ELEMENTS</span>
          <span class="summary-val">{elementCount} to inspect</span>
        </div>
        {#if startAssetId}
          <div class="summary-row">
            <span class="summary-key">STARTING AT</span>
            <span class="summary-val">{startAssetId}</span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Error -->
    {#if error}
      <div class="error-msg">⚠ {error}</div>
    {/if}

    <!-- Start -->
    <button
      class="start-action-btn"
      on:click={handleStart}
      disabled={saving || !selectedPlanId || elementCount === 0}
    >
      {#if saving}
        STARTING…
      {:else}
        BEGIN WALK →
      {/if}
    </button>

  </div>
</div>

<style>
  .start-screen {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  /* ── Header ─────────────────────────────────────────────────────────── */
  .start-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1.25rem 1rem;
    border-bottom: 1px solid #1e1e2a;
  }

  .back-btn {
    background: none;
    border: none;
    color: #f97316;
    font-family: inherit;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    cursor: pointer;
    padding: 0;
  }

  .start-title {
    font-size: 0.7rem;
    letter-spacing: 0.25em;
    color: #444;
  }

  /* ── Body ────────────────────────────────────────────────────────────── */
  .start-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    flex: 1;
  }

  /* ── Field groups ────────────────────────────────────────────────────── */
  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .field-label {
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    color: #f97316;
  }

  .field-hint {
    font-size: 0.75rem;
    color: #444;
  }

  /* ── Type grid ───────────────────────────────────────────────────────── */
  .type-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .type-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 0.875rem 0.5rem;
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .type-btn:hover    { border-color: #333; }
  .type-btn.selected { border-color: #f97316; background: #1a0f00; }

  .type-btn-icon  { font-size: 1.5rem; }
  .type-btn-label { font-size: 0.7rem; letter-spacing: 0.05em; color: #aaa; }
  .type-btn.selected .type-btn-label { color: #f97316; }

  /* ── Plan list ───────────────────────────────────────────────────────── */
  .plan-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .plan-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1rem;
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: all 0.15s;
  }

  .plan-btn:hover:not(.empty) { border-color: #333; }
  .plan-btn.selected          { border-color: #f97316; background: #1a0f00; }
  .plan-btn.empty             { opacity: 0.4; cursor: not-allowed; }

  .plan-btn-main {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .plan-building { font-size: 0.875rem; color: #e8e8e0; }
  .plan-floor    { font-size: 0.7rem;   color: #555; }

  .plan-count      { font-size: 0.7rem; color: #555; }
  .plan-count.zero { color: #333; }

  /* ── Select ──────────────────────────────────────────────────────────── */
  .field-select {
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    color: #e8e8e0;
    font-family: inherit;
    font-size: 0.825rem;
    padding: 0.875rem 1rem;
    width: 100%;
    appearance: none;
    cursor: pointer;
  }

  .field-select:focus {
    outline: none;
    border-color: #f97316;
  }

  /* ── Summary box ─────────────────────────────────────────────────────── */
  .summary-box {
    background: #0d1117;
    border: 1px solid #1e2d1e;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .summary-key { font-size: 0.6rem; letter-spacing: 0.15em; color: #444; }
  .summary-val { font-size: 0.8rem; color: #e8e8e0; }

  /* ── Error ───────────────────────────────────────────────────────────── */
  .error-msg {
    font-size: 0.8rem;
    color: #ef4444;
    padding: 0.75rem 1rem;
    background: #1a0000;
    border: 1px solid #ef4444;
    border-radius: 6px;
  }

  /* ── Start action ────────────────────────────────────────────────────── */
  .start-action-btn {
    padding: 1.25rem;
    background: #f97316;
    border: none;
    border-radius: 8px;
    color: #0a0a0f;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    cursor: pointer;
    transition: all 0.15s;
    margin-top: auto;
  }

  .start-action-btn:hover:not(:disabled) { background: #ea6a0a; }
  .start-action-btn:disabled             { opacity: 0.35; cursor: not-allowed; }
</style>
