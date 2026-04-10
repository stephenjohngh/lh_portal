<script>
  // src/lib/apps/mobileplan/MobilePlanApp.svelte
  // Mobile-first, read-only floor plan viewer using the V2 component data model.
  // Entry point — initialises permissions, loads store, renders shell layout.

  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { auth }              from '$lib/stores/auth';
  import { permissions }       from '$lib/stores/permissions';
  import { mobileplanStore }   from './stores/mobileplanStore.js';
  import FloorBar              from './components/FloorBar.svelte';
  import PlanView              from './components/PlanView.svelte';
  import ComponentSheet        from './components/ComponentSheet.svelte';
  import ActionSheet           from './components/ActionSheet.svelte';
  import FilterSheet           from './components/FilterSheet.svelte';
  import UnplacedSheet         from './components/UnplacedSheet.svelte';

  // ── Store state ──────────────────────────────────────────────────────────────

  let state = {
    building: null, floors: [], systems: [], types: [], attrDefs: {}, plans: [],
    currentFloor: null, currentPlan: null, components: [], spaces: [], annotations: [], inspections: {},
    hiddenTypes: new Set(), hiddenStatuses: new Set(), showSpaces: true,
    usingCache: false, cachedAt: null,
    loading: false, loadingFloor: false, error: null,
  };

  const unsub = mobileplanStore.subscribe(s => { state = s; });
  onDestroy(() => unsub());

  const dispatch = createEventDispatcher();

  // ── Sheet visibility ──────────────────────────────────────────────────────────

  let selectedComponent = null;   // opens ComponentSheet
  let actionComponent   = null;   // opens ActionSheet
  let showFilter        = false;
  let showList          = false;

  // ── Plan view ref (for centreOnComponent) ────────────────────────────────────

  let planViewEl;

  // ── Online / cache indicators ────────────────────────────────────────────────

  let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  function handleOnline()  { isOnline = true;  tryRefresh(); }
  function handleOffline() { isOnline = false; }

  async function tryRefresh() {
    if (isOnline) await mobileplanStore.refresh();
  }

  // ── Cache age label (reactive) ────────────────────────────────────────────────

  $: cacheLabel = state.cachedAt
    ? mobileplanStore.ageLabel(Date.now() - state.cachedAt.getTime())
    : null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  onMount(async () => {
    if ($auth.user) {
      await permissions.init($auth.user.id, 'mobileplan');
    }

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    await mobileplanStore.load();
  });

  onDestroy(() => {
    window.removeEventListener('online',  handleOnline);
    window.removeEventListener('offline', handleOffline);
  });

  // ── Event handlers ────────────────────────────────────────────────────────────

  function onMarkerTap(e) {
    selectedComponent = e.detail ?? e;
    actionComponent   = null;
  }

  function onMarkerLongPress(e) {
    actionComponent   = e.detail ?? e;
    selectedComponent = null;
  }

  function onPlanTap() {
    if (!actionComponent) selectedComponent = null;
    actionComponent = null;
  }

  function closeComponentSheet() {
    selectedComponent = null;
  }

  function closeActionSheet() {
    actionComponent = null;
  }

  function onActionViewDetails(e) {
    selectedComponent = e.detail;
  }

  function onActionCentreOnPlan(e) {
    planViewEl?.centreOnComponent(e.detail);
  }

  function onNavigateTo(e) {
    planViewEl?.centreOnComponent(e.detail);
    selectedComponent = e.detail;
  }

  function onOpenDetail(e) {
    selectedComponent = e.detail;
  }

  // Back to portal home
  function goHome() {
    dispatch('navigate', 'home');
  }
</script>

<div class="app-shell">

  <!-- Fixed header -->
  <header class="app-header">
    <div class="header-left">
      <button class="back-btn" on:click={goHome} aria-label="Back to home">←</button>
      <span class="app-name">{state.building?.name ?? 'Plan View'}</span>
    </div>
    <div class="header-right">
      {#if !isOnline}
        <span class="pill offline-pill">OFFLINE</span>
      {/if}
      {#if state.usingCache && cacheLabel}
        <span class="pill cache-pill">cached {cacheLabel}</span>
      {/if}
      {#if isOnline}
        <button class="icon-btn" on:click={tryRefresh} aria-label="Refresh data" title="Refresh">
          ↺
        </button>
      {/if}
      <button class="filter-btn" on:click={() => showFilter = true} aria-label="Open filters">
        ⊞ Filter
      </button>
    </div>
  </header>

  <!-- Floor selector -->
  <FloorBar
    floors={state.floors}
    currentFloor={state.currentFloor}
    loadingFloor={state.loadingFloor}
  />

  <!-- Main content -->
  <main class="main-content">
    {#if state.loading}
      <div class="full-center">
        <div class="spinner"></div>
        <p class="loading-msg">Loading…</p>
      </div>

    {:else if state.error && !state.currentFloor}
      <div class="full-center">
        <p class="error-msg">{state.error}</p>
        {#if isOnline}
          <button class="retry-btn" on:click={tryRefresh}>Retry</button>
        {/if}
      </div>

    {:else}
      <PlanView
        bind:this={planViewEl}
        plan={state.currentPlan}
        components={state.components}
        spaces={state.spaces}
        annotations={state.annotations}
        types={state.types}
        inspections={state.inspections}
        hiddenTypes={state.hiddenTypes}
        hiddenStatuses={state.hiddenStatuses}
        showSpaces={state.showSpaces}
        loadingFloor={state.loadingFloor}
        selectedId={selectedComponent?.id ?? null}
        on:markerTap={onMarkerTap}
        on:markerLongPress={onMarkerLongPress}
        on:planTap={onPlanTap}
        on:openList={() => showList = true}
      />
    {/if}
  </main>

  <!-- Bottom sheets -->
  {#if selectedComponent}
    <ComponentSheet
      component={selectedComponent}
      types={state.types}
      attrDefs={state.attrDefs}
      inspections={state.inspections}
      on:close={closeComponentSheet}
    />
  {/if}

  {#if actionComponent}
    <ActionSheet
      component={actionComponent}
      types={state.types}
      on:viewDetails={onActionViewDetails}
      on:centreOnPlan={onActionCentreOnPlan}
      on:close={closeActionSheet}
    />
  {/if}

  {#if showFilter}
    <FilterSheet
      systems={state.systems}
      types={state.types}
      hiddenTypes={state.hiddenTypes}
      hiddenStatuses={state.hiddenStatuses}
      showSpaces={state.showSpaces}
      on:close={() => showFilter = false}
    />
  {/if}

  {#if showList}
    <UnplacedSheet
      components={state.components}
      currentFloor={state.currentFloor}
      types={state.types}
      inspections={state.inspections}
      on:navigateTo={onNavigateTo}
      on:openDetail={onOpenDetail}
      on:close={() => showList = false}
    />
  {/if}
</div>

<style>
  /* Import DM Mono font */
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&display=swap');

  :global(body) {
    background: #0d0d14;
    margin: 0;
    padding: 0;
  }

  .app-shell {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #0d0d14;
    font-family: 'DM Mono', monospace;
    color: #e2e8f0;
    overflow: hidden;
    z-index: 100;  /* above portal nav */
  }

  /* ── Header ── */
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    padding: 0 12px;
    background: #1a1a2e;
    border-bottom: 1px solid #252540;
    flex-shrink: 0;
    gap: 8px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .back-btn {
    min-width: 44px;
    min-height: 44px;
    background: transparent;
    border: none;
    color: #2dd4bf;
    font-size: 20px;
    cursor: pointer;
    touch-action: manipulation;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .app-name {
    font-size: 15px;
    font-weight: 700;
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .icon-btn {
    min-width: 36px;
    min-height: 36px;
    background: transparent;
    border: none;
    color: #64748b;
    font-size: 18px;
    cursor: pointer;
    touch-action: manipulation;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .filter-btn {
    min-height: 36px;
    padding: 0 12px;
    background: #252540;
    border: 1px solid #252540;
    border-radius: 8px;
    color: #e2e8f0;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    cursor: pointer;
    touch-action: manipulation;
    white-space: nowrap;
  }

  /* Status pills */
  .pill {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 8px;
    white-space: nowrap;
  }

  .offline-pill { background: #d97706; color: #0d0d14; }
  .cache-pill   { background: #252540; color: #64748b; }

  /* ── Main content ── */
  .main-content {
    flex: 1;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .full-center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #252540;
    border-top-color: #2dd4bf;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .loading-msg {
    font-size: 14px;
    color: #64748b;
    margin: 0;
  }

  .error-msg {
    font-size: 14px;
    color: #dc2626;
    text-align: center;
    padding: 0 32px;
    margin: 0;
    line-height: 1.5;
  }

  .retry-btn {
    min-height: 44px;
    padding: 0 24px;
    background: #2dd4bf;
    color: #0d0d14;
    border: none;
    border-radius: 8px;
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }
</style>
