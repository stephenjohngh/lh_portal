<script context="module">
  // Persist search + scope across open/close cycles without lifting state.
  // Object wrapper avoids a vite-plugin-svelte "module-level reassignment" warning.
  const _persist = { query: '', scope: 'floor' };
</script>

<script>
  // src/lib/apps/mobileplan/components/ComponentTableSheet.svelte
  // A tabular list of components — columns: Ref · Type · Label · Status — with a
  // scope toggle (This floor / All building), a Status chip row, a Systems menu
  // (dropdown, since a building can have many systems), and a search box.
  //
  // Filter chips/menu edit the SAME shared filter as the plan (via
  // mobileplanStore.setFilter), so plan and table stay in sync; changes apply
  // instantly. Tapping a row centres a placed component on the plan (switching
  // floors first when it lives on another floor), or opens the detail sheet for
  // an unplaced one. Sort: (floor →) system → type → asset_id.

  import { createEventDispatcher, onMount } from 'svelte';
  import { mobileplanStore } from '../stores/mobileplanStore.js';
  import {
    STATUSES, STATUS_LABELS, systemState, toggleSystem, toggleStatus,
    isFiltered, componentRef, resultLabel, resultClass, typesForSystem,
  } from '../utils/planFilter.js';

  export let components     = [];    // current floor's components
  export let allComponents  = [];    // building-wide (lazy; loaded on "All building")
  export let loadingAll     = false;
  export let currentFloor   = null;
  export let floors         = [];
  export let types          = [];
  export let systems        = [];
  export let hiddenTypes    = new Set();
  export let hiddenStatuses = new Set();

  const dispatch = createEventDispatcher();

  let query = _persist.query;
  $: _persist.query = query;

  let scope = _persist.scope;        // 'floor' | 'building'
  $: _persist.scope = scope;
  let showSystems = false;           // systems dropdown open?

  function setScope(s) {
    scope = s;
    if (s === 'building') mobileplanStore.loadAllComponents();  // idempotent
  }

  // Handle a persisted "All building" scope on reopen (setScope only fires on tap).
  onMount(() => { if (scope === 'building') mobileplanStore.loadAllComponents(); });

  function getType(typeCode) {
    return types.find(t => t.code === typeCode) ?? null;
  }

  $: floorById   = Object.fromEntries(floors.map(f => [f.id, f]));
  function floorShort(c) {
    return floorById[c.floor_id]?.short_name ?? currentFloor?.short_name ?? '?';
  }

  // -- Systems menu (edits the shared store filter immediately) -----------------

  $: shownSystems = systems.filter(sys => typesForSystem(types, sys.id).length > 0);
  $: systemStates = Object.fromEntries(
    systems.map(sys => [sys.id, systemState(types, sys.id, hiddenTypes)])
  );
  $: visibleSystemCount = shownSystems.filter(s => (systemStates[s.id] ?? 'all') !== 'none').length;
  $: systemsLabel = visibleSystemCount === shownSystems.length
    ? 'All systems'
    : `Systems ${visibleSystemCount}/${shownSystems.length}`;

  function onToggleSystem(systemId) {
    mobileplanStore.setFilter({ hiddenTypes: toggleSystem(types, systemId, hiddenTypes) });
  }
  function onToggleStatus(status) {
    mobileplanStore.setFilter({ hiddenStatuses: toggleStatus(status, hiddenStatuses) });
  }
  function setAllSystems(visible) {
    const codes = shownSystems.flatMap(s => typesForSystem(types, s.id).map(t => t.code));
    const next = new Set(hiddenTypes);
    codes.forEach(c => visible ? next.delete(c) : next.add(c));
    mobileplanStore.setFilter({ hiddenTypes: next });
  }

  // -- Rows ---------------------------------------------------------------------

  $: source = scope === 'building' ? allComponents : components;

  $: sorted = [...source].sort((a, b) => {
    if (scope === 'building') {
      const fa = floorById[a.floor_id]?.level_order ?? 9999;
      const fb = floorById[b.floor_id]?.level_order ?? 9999;
      if (fa !== fb) return fa - fb;
    }
    const tA = getType(a.type_code), tB = getType(b.type_code);
    const sA = systems.find(s => s.id === tA?.building_system_id);
    const sB = systems.find(s => s.id === tB?.building_system_id);
    const spA = sA?.presentation_order ?? 9999, spB = sB?.presentation_order ?? 9999;
    if (spA !== spB) return spA - spB;
    const tpA = tA?.presentation_order ?? 9999, tpB = tB?.presentation_order ?? 9999;
    if (tpA !== tpB) return tpA - tpB;
    return (a.asset_id ?? '').localeCompare(b.asset_id ?? '', undefined, { numeric: true });
  });

  $: baseList = sorted.filter(c => !isFiltered(c, hiddenTypes, hiddenStatuses));
  $: filtered = query.trim()
    ? baseList.filter(c => {
        const q = query.toLowerCase();
        return (c.asset_id  ?? '').toLowerCase().includes(q)
            || (c.label     ?? '').toLowerCase().includes(q)
            || (c.notes     ?? '').toLowerCase().includes(q)
            || (c.type_code ?? '').toLowerCase().includes(q)
            || (getType(c.type_code)?.name ?? '').toLowerCase().includes(q);
      })
    : baseList;

  function selectComponent(c) {
    if (c.plan_id != null) dispatch('navigateTo', c);
    else                   dispatch('openDetail', c);
    dispatch('close');
  }

  function dismiss() { dispatch('close'); }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click={dismiss}></div>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Component list">

  <!-- Header -->
  <div class="sheet-header">
    <span class="sheet-title">
      Components — {scope === 'building' ? 'All building' : (currentFloor?.name ?? '')}
    </span>
    <button class="close-btn" on:click={dismiss} aria-label="Close">✕</button>
  </div>

  <!-- Scope toggle -->
  <div class="scope-row">
    <button class="scope-btn" class:active={scope === 'floor'}    on:click={() => setScope('floor')}>This floor</button>
    <button class="scope-btn" class:active={scope === 'building'} on:click={() => setScope('building')}>All building</button>
  </div>

  <!-- Filter bar: status chips + systems menu -->
  <div class="filter-bar">
    <div class="chip-row">
      {#each STATUSES as s}
        <button class="chip" class:active={!hiddenStatuses.has(s)} on:click={() => onToggleStatus(s)}>
          {STATUS_LABELS[s]}
        </button>
      {/each}
    </div>

    {#if shownSystems.length > 0}
      <button class="sys-menu-btn" class:open={showSystems} on:click={() => showSystems = !showSystems}>
        {systemsLabel} <span class="caret">{showSystems ? '▲' : '▼'}</span>
      </button>

      {#if showSystems}
        <div class="sys-menu">
          <div class="sys-menu-actions">
            <button on:click={() => setAllSystems(true)}>Show all</button>
            <button on:click={() => setAllSystems(false)}>Hide all</button>
          </div>
          {#each shownSystems as sys (sys.id)}
            {@const st = systemStates[sys.id] ?? 'all'}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div class="sys-item" on:click={() => onToggleSystem(sys.id)}>
              <span class="sys-check">{st === 'all' ? '☑' : st === 'some' ? '▣' : '☐'}</span>
              <span class="sys-dot" style="background:#{sys.colour ?? '64748b'};"></span>
              <span class="sys-name">{sys.name}</span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <!-- Search -->
  <div class="search-row">
    <span class="search-icon" aria-hidden="true">🔍</span>
    <input
      class="search-input"
      type="search"
      placeholder="Search ref, type or label…"
      bind:value={query}
      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
    />
  </div>

  <!-- Table -->
  <div class="table-scroll">
    <div class="table">
      <div class="thead">
        <span class="th">Ref</span>
        <span class="th">Type</span>
        <span class="th">Label</span>
        <span class="th">Status</span>
      </div>

      {#if scope === 'building' && loadingAll && allComponents.length === 0}
        <p class="empty-msg">Loading all floors…</p>
      {:else if scope === 'building' && allComponents.length === 0}
        <p class="empty-msg">Building-wide list unavailable offline — connect once to load it.</p>
      {:else if filtered.length === 0}
        <p class="empty-msg">No components match.</p>
      {:else}
        {#each filtered as c (c.id)}
          {@const type = getType(c.type_code)}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="trow" on:click={() => selectComponent(c)}>
            <span class="td td-ref">{componentRef(c, floorShort(c), type)}</span>
            <span class="td td-type">{type?.name ?? c.type_code ?? '—'}</span>
            <span class="td td-label">{c.label || '—'}</span>
            <span class="td td-status {resultClass(c.status)}">{resultLabel(c.status)}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <div class="sheet-count">{filtered.length} component{filtered.length === 1 ? '' : 's'}</div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 40; }

  .sheet {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    height: 88vh;
    background: #1a1a2e;
    border-radius: 16px 16px 0 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    max-width: 720px;
    margin: 0 auto;
  }

  .sheet-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 8px;
    flex-shrink: 0;
    border-bottom: 1px solid #252540;
  }
  .sheet-title { font-family: 'DM Mono', monospace; font-size: 14px; font-weight: 700; color: #e2e8f0; }
  .close-btn {
    min-width: 44px; min-height: 44px;
    background: transparent; border: none; color: #64748b;
    font-size: 16px; cursor: pointer; touch-action: manipulation;
    display: flex; align-items: center; justify-content: center;
  }

  /* Scope toggle */
  .scope-row {
    display: flex; gap: 4px;
    padding: 10px 12px 0;
    flex-shrink: 0;
  }
  .scope-btn {
    flex: 1;
    min-height: 40px;
    border: 1px solid #252540;
    background: transparent;
    color: #94a3b8;
    font-family: 'DM Mono', monospace;
    font-size: 12px; font-weight: 700;
    border-radius: 8px;
    cursor: pointer; touch-action: manipulation;
    transition: all 0.15s;
  }
  .scope-btn.active { background: #2dd4bf22; border-color: #2dd4bf; color: #e2e8f0; }

  /* Filter bar */
  .filter-bar {
    display: flex; flex-direction: column; gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid #252540;
    flex-shrink: 0;
  }
  .chip-row {
    display: flex; gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .chip-row::-webkit-scrollbar { display: none; }
  .chip {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 18px;
    border: 1px solid #252540;
    background: transparent;
    color: #64748b;
    font-family: 'DM Mono', monospace;
    font-size: 11px; font-weight: 600;
    white-space: nowrap; flex-shrink: 0;
    cursor: pointer; touch-action: manipulation;
    transition: all 0.15s;
  }
  .chip.active { border-color: #2dd4bf; color: #e2e8f0; background: #2dd4bf22; }

  /* Systems menu */
  .sys-menu-btn {
    display: inline-flex; align-items: center; gap: 8px;
    align-self: flex-start;
    min-height: 36px;
    padding: 0 14px;
    border-radius: 8px;
    border: 1px solid #252540;
    background: #252540;
    color: #e2e8f0;
    font-family: 'DM Mono', monospace;
    font-size: 12px; font-weight: 600;
    cursor: pointer; touch-action: manipulation;
  }
  .sys-menu-btn.open { border-color: #2dd4bf; }
  .caret { font-size: 9px; color: #64748b; }

  .sys-menu {
    border: 1px solid #252540;
    border-radius: 8px;
    background: #14142a;
    max-height: 40vh;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #252540 transparent;
  }
  .sys-menu-actions {
    display: flex; gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid #252540;
    position: sticky; top: 0;
    background: #14142a;
  }
  .sys-menu-actions button {
    background: transparent; border: none;
    color: #2dd4bf; font-family: 'DM Mono', monospace;
    font-size: 11px; font-weight: 700;
    cursor: pointer; padding: 4px 6px; min-height: 32px;
    touch-action: manipulation;
  }
  .sys-item {
    display: flex; align-items: center; gap: 10px;
    min-height: 44px;
    padding: 0 12px;
    border-bottom: 1px solid #1e1e38;
    cursor: pointer; touch-action: manipulation;
  }
  @media (hover: hover) { .sys-item:hover { background: #1e1e38; } }
  .sys-check { color: #2dd4bf; font-size: 15px; width: 18px; flex-shrink: 0; }
  .sys-dot   { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .sys-name  { font-family: 'DM Mono', monospace; font-size: 13px; color: #e2e8f0; }

  /* Search */
  .search-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px;
    background: #252540;
    flex-shrink: 0;
  }
  .search-icon { font-size: 14px; }
  .search-input {
    flex: 1; background: transparent; border: none; outline: none;
    font-family: 'DM Mono', monospace; font-size: 14px; color: #e2e8f0; min-height: 34px;
  }
  .search-input::placeholder { color: #64748b; }

  /* Table */
  .table-scroll {
    flex: 1;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: #252540 transparent;
  }
  .table { min-width: 340px; }

  .thead, .trow {
    display: grid;
    grid-template-columns: 74px minmax(60px, 1fr) minmax(64px, 1.3fr) 92px;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
  }
  .thead {
    position: sticky; top: 0;
    background: #14142a;
    border-bottom: 1px solid #252540;
    min-height: 34px;
    z-index: 1;
  }
  .th {
    font-family: 'DM Mono', monospace;
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: #64748b;
  }
  .trow {
    min-height: 46px;
    border-bottom: 1px solid #252540;
    cursor: pointer;
    transition: background 0.1s;
  }
  @media (hover: hover) { .trow:hover { background: #252540; } }
  .td {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: #e2e8f0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .td-ref    { font-weight: 600; }
  .td-status { font-weight: 600; }

  .ok       { color: #16a34a; }
  .failed   { color: #dc2626; }
  .problem  { color: #d97706; }
  .inactive { color: #6b7280; }

  .empty-msg {
    font-family: 'DM Mono', monospace; font-size: 13px; color: #64748b;
    text-align: center; padding: 32px 16px; margin: 0; line-height: 1.5;
  }

  .sheet-count {
    flex-shrink: 0;
    padding: 8px 16px;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    border-top: 1px solid #252540;
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #64748b;
    text-align: right;
  }
</style>
