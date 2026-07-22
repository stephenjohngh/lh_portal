<script>
  // src/lib/apps/mobileplan/components/FilterSheet.svelte
  // Plan filters: status pills, a "show spaces" toggle, and SYSTEM-level
  // visibility (one checkbox per building system — no per-type rows). Applied on
  // "Apply Filters"; persisted to localStorage by mobileplanStore.setFilter().
  // The system → hidden-types translation lives in ../utils/planFilter.js and is
  // shared with the component table.

  import { createEventDispatcher } from 'svelte';
  import { mobileplanStore } from '../stores/mobileplanStore.js';
  import {
    STATUSES, STATUS_LABELS, systemState, toggleSystem as toggleSystemHelper,
    toggleStatus as toggleStatusHelper, typesForSystem,
  } from '../utils/planFilter.js';

  export let systems       = [];
  export let types         = [];
  export let hiddenTypes   = new Set();
  export let hiddenStatuses = new Set();
  export let showSpaces    = false;

  const dispatch = createEventDispatcher();

  // Local working copies — only pushed to store on Apply
  let localHiddenTypes    = new Set(hiddenTypes);
  let localHiddenStatuses = new Set(hiddenStatuses);
  let localShowSpaces     = showSpaces;

  // Re-initialise local state when props change (sheet re-opened)
  $: {
    localHiddenTypes    = new Set(hiddenTypes);
    localHiddenStatuses = new Set(hiddenStatuses);
    localShowSpaces     = showSpaces;
  }

  function toggleStatus(s) {
    localHiddenStatuses = toggleStatusHelper(s, localHiddenStatuses);
  }

  // Systems with at least one type (empty systems have nothing to toggle).
  $: shownSystems = systems.filter(sys => typesForSystem(types, sys.id).length > 0);

  // Reactive map so Svelte tracks localHiddenTypes as a dependency.
  $: systemCheckStates = Object.fromEntries(
    systems.map(sys => [sys.id, systemState(types, sys.id, localHiddenTypes)])
  );

  function toggleSystem(systemId) {
    localHiddenTypes = toggleSystemHelper(types, systemId, localHiddenTypes);
  }

  // -- Apply / Clear / Set All -----------------------------------------------

  // Button label based on types only — status pills are not affected by this button.
  $: allTypesHidden = types.every(t => localHiddenTypes.has(t.code));

  function apply() {
    mobileplanStore.setFilter({
      hiddenTypes:    localHiddenTypes,
      hiddenStatuses: localHiddenStatuses,
      showSpaces:     localShowSpaces,
    });
    dispatch('close');
  }

  function clearOrSetAll() {
    // Show all / hide all systems (status pills unchanged).
    localHiddenTypes = allTypesHidden ? new Set() : new Set(types.map(t => t.code));
  }

  function dismiss() {
    dispatch('close');
  }

  // -- Quick presets ------------------------------------------------------------
  // One-tap filters for the two most-asked-for views: components with a fault
  // (failed + problem) in a given area. Matched by system/type name so they keep
  // working if type codes change. Applies immediately and closes.

  function isLightingType(t) {
    const sys = systems.find(s => s.id === t.building_system_id);
    return /light/i.test(sys?.name ?? '');
  }
  function isFireDoorType(t) {
    return /fire\s*door/i.test(t.name ?? '') || /fire_door/i.test(t.code ?? '');
  }

  $: lightingCodes = types.filter(isLightingType).map(t => t.code);
  $: fireDoorCodes = types.filter(isFireDoorType).map(t => t.code);

  // Show ONLY the given type codes, with status failed + problem (hide ok/inactive).
  function applyPreset(keepCodes) {
    const keep = new Set(keepCodes);
    mobileplanStore.setFilter({
      hiddenTypes:    new Set(types.filter(t => !keep.has(t.code)).map(t => t.code)),
      hiddenStatuses: new Set(['ok', 'inactive']),
    });
    dispatch('close');
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click={dismiss}></div>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Filters">

  <!-- Header -->
  <div class="sheet-header">
    <span class="sheet-title">Filters</span>
    <button class="clear-btn" on:click={clearOrSetAll}>{allTypesHidden ? 'Set All' : 'Clear'}</button>
  </div>

  <div class="sheet-scroll">

    <!-- Quick presets — one tap: show a fault view (failed + problem) for an area -->
    {#if lightingCodes.length > 0 || fireDoorCodes.length > 0}
      <div class="section">
        <p class="section-title">Quick presets</p>
        <div class="preset-row">
          {#if lightingCodes.length > 0}
            <button class="preset-btn" on:click={() => applyPreset(lightingCodes)}>💡 Lighting issues</button>
          {/if}
          {#if fireDoorCodes.length > 0}
            <button class="preset-btn" on:click={() => applyPreset(fireDoorCodes)}>🚪 Door issues</button>
          {/if}
        </div>
        <p class="preset-hint">Applies immediately — shows failed + problem only.</p>
      </div>
    {/if}

    <!-- Status filters -->
    <div class="section">
      <p class="section-title">Status</p>
      <div class="status-pills">
        {#each STATUSES as s}
          <button
            class="status-pill status-pill-{s}"
            class:active={!localHiddenStatuses.has(s)}
            on:click={() => toggleStatus(s)}
          >
            {STATUS_LABELS[s]}
          </button>
        {/each}
      </div>
    </div>

    <!-- Spaces toggle -->
    <div class="section">
      <p class="section-title">Spaces</p>
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div class="toggle-row" on:click={() => localShowSpaces = !localShowSpaces}>
        <span class="toggle-label">Show spaces on plan</span>
        <div class="toggle" class:on={localShowSpaces}>
          <div class="toggle-knob"></div>
        </div>
      </div>
    </div>

    <!-- Systems (one toggle per building system) -->
    {#if shownSystems.length > 0}
      <div class="section">
        <p class="section-title">Systems</p>
        {#each shownSystems as sys (sys.id)}
          {@const sysState = systemCheckStates[sys.id] ?? 'all'}
          <div class="system-row">
            <button
              class="system-check"
              class:checked={sysState === 'all'}
              class:partial={sysState === 'some'}
              on:click={() => toggleSystem(sys.id)}
              aria-label="Toggle {sys.name} system"
            >
              {sysState === 'all' ? '☑' : sysState === 'some' ? '▣' : '☐'}
            </button>
            <span class="system-name">
              <span class="system-dot" style="background: #{sys.colour ?? '64748b'};"></span>
              {sys.name}
            </span>
          </div>
        {/each}
      </div>
    {/if}

  </div>

  <!-- Apply button -->
  <div class="sheet-footer">
    <button class="apply-btn" on:click={apply}>Apply Filters</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 40;
  }

  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 80vh;
    background: #1a1a2e;
    border-radius: 16px 16px 0 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    max-width: 640px;
    margin: 0 auto;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 8px;
    flex-shrink: 0;
    border-bottom: 1px solid #252540;
  }

  .sheet-title {
    font-family: 'DM Mono', monospace;
    font-size: 15px;
    font-weight: 700;
    color: #e2e8f0;
  }

  .clear-btn {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #2dd4bf;
    background: transparent;
    border: none;
    cursor: pointer;
    min-height: 44px;
    padding: 0 4px;
    touch-action: manipulation;
  }

  .sheet-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px 16px;
    scrollbar-width: thin;
    scrollbar-color: #252540 transparent;
  }

  .section {
    margin-top: 20px;
  }

  .section-title {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
    margin: 0 0 10px;
  }

  /* Quick presets */
  .preset-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .preset-btn {
    flex: 1 1 40%;
    min-height: 48px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid #2dd4bf;
    background: #2dd4bf22;
    color: #e2e8f0;
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    transition: background 0.15s;
  }
  @media (hover: hover) {
    .preset-btn:hover { background: #2dd4bf33; }
  }
  .preset-hint {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: #64748b;
    margin: 8px 0 0;
  }

  /* Status pills */
  .status-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .status-pill {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 22px;
    border: 1px solid #252540;
    background: transparent;
    color: #64748b;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    touch-action: manipulation;
  }

  .status-pill.active { border-color: #2dd4bf; color: #e2e8f0; background: #2dd4bf22; }

  /* Spaces toggle */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    padding: 0 4px;
    cursor: pointer;
  }

  .toggle-label {
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    color: #e2e8f0;
  }

  .toggle {
    width: 46px;
    height: 26px;
    border-radius: 13px;
    background: #252540;
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .toggle.on { background: #2dd4bf; }

  .toggle-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s;
  }

  .toggle.on .toggle-knob { transform: translateX(20px); }

  /* System/type tree */
  .system-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    border-bottom: 1px solid #252540;
  }

  .system-check {
    min-width: 36px;
    min-height: 36px;
    background: transparent;
    border: none;
    font-size: 16px;
    color: #2dd4bf;
    cursor: pointer;
    touch-action: manipulation;
    flex-shrink: 0;
  }

  .system-name {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .system-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .sheet-footer {
    padding: 12px 16px;
    border-top: 1px solid #252540;
    flex-shrink: 0;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }

  .apply-btn {
    width: 100%;
    min-height: 52px;
    background: #2dd4bf;
    color: #0d0d14;
    border: none;
    border-radius: 10px;
    font-family: 'DM Mono', monospace;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    transition: opacity 0.15s;
  }

  @media (hover: hover) {
    .apply-btn:hover { opacity: 0.85; }
  }
</style>
