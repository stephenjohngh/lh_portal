<script>
  // src/lib/apps/v2plan/components/UnplacedSheet.svelte
  // Searchable list of all components on the current floor.
  // Tabs: Placed | Unplaced.
  // Tapping a placed component → navigate to it on plan.
  // Tapping unplaced → open ComponentSheet.

  import { createEventDispatcher } from 'svelte';

  export let components  = [];
  export let currentFloor = null;
  export let types        = [];
  export let inspections  = {};

  const dispatch = createEventDispatcher();

  let query  = '';
  let tab    = 'placed';  // 'placed' | 'unplaced'

  function getType(typeCode) {
    return types.find(t => t.code === typeCode) ?? null;
  }

  $: placed   = components.filter(c => c.x_position != null && c.y_position != null);
  $: unplaced = components.filter(c => c.x_position == null || c.y_position == null);

  $: activeList = tab === 'placed' ? placed : unplaced;

  $: filtered = query.trim()
    ? activeList.filter(c => {
        const q = query.toLowerCase();
        return (c.asset_id ?? '').toLowerCase().includes(q)
            || (c.label   ?? '').toLowerCase().includes(q)
            || (c.notes   ?? '').toLowerCase().includes(q)
            || (c.type_code ?? '').toLowerCase().includes(q);
      })
    : activeList;

  function resultLabel(r) {
    switch (r) {
      case 'ok':       return '✓ OK';
      case 'failed':   return '✗ FAILED';
      case 'problem':  return '⚙ PROBLEM';
      case 'inactive': return '— INACTIVE';
      default:         return r ?? '—';
    }
  }

  function resultClass(r) {
    switch (r) {
      case 'ok':       return 'ok';
      case 'failed':   return 'failed';
      case 'problem':  return 'problem';
      case 'inactive': return 'inactive';
      default:         return '';
    }
  }

  function selectComponent(c) {
    if (tab === 'placed') {
      dispatch('navigateTo', c);
    } else {
      dispatch('openDetail', c);
    }
    dispatch('close');
  }

  function dismiss() {
    dispatch('close');
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click={dismiss}></div>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Components list">

  <!-- Header -->
  <div class="sheet-header">
    <span class="sheet-title">
      Components — {currentFloor?.name ?? ''}
    </span>
    <button class="close-btn" on:click={dismiss} aria-label="Close">✕</button>
  </div>

  <!-- Search -->
  <div class="search-row">
    <span class="search-icon" aria-hidden="true">🔍</span>
    <input
      class="search-input"
      type="search"
      placeholder="Search asset ID or label…"
      bind:value={query}
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
    />
  </div>

  <!-- Tabs -->
  <div class="tabs" role="tablist">
    <button
      role="tab"
      class="tab"
      class:active={tab === 'placed'}
      aria-selected={tab === 'placed'}
      on:click={() => tab = 'placed'}
    >
      Placed ({placed.length})
    </button>
    <button
      role="tab"
      class="tab"
      class:active={tab === 'unplaced'}
      aria-selected={tab === 'unplaced'}
      on:click={() => tab = 'unplaced'}
    >
      Unplaced ({unplaced.length})
    </button>
  </div>

  <!-- List -->
  <div class="list-scroll">
    {#if filtered.length === 0}
      <p class="empty-msg">No components match your search.</p>
    {:else}
      {#each filtered as c (c.id)}
        {@const type = getType(c.type_code)}
        {@const insp = inspections[c.id]}

        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="comp-row" on:click={() => selectComponent(c)}>
          <div class="comp-marker" style="background: #{type?.colour ?? '64748b'};">
            {type?.initial ?? '?'}
          </div>
          <div class="comp-info">
            <span class="comp-asset">{c.asset_id ?? '—'}</span>
            {#if c.label}
              <span class="comp-label">{c.label}</span>
            {/if}
          </div>
          <div class="comp-status {resultClass(c.status)}">
            {resultLabel(c.status)}
          </div>
        </div>
      {/each}
    {/if}
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
    height: 75vh;
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
    font-size: 14px;
    font-weight: 700;
    color: #e2e8f0;
  }

  .close-btn {
    min-width: 44px;
    min-height: 44px;
    background: transparent;
    border: none;
    color: #64748b;
    font-size: 16px;
    cursor: pointer;
    touch-action: manipulation;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: #252540;
    flex-shrink: 0;
  }

  .search-icon {
    font-size: 14px;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    color: #e2e8f0;
    min-height: 36px;
  }

  .search-input::placeholder { color: #64748b; }

  .tabs {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid #252540;
  }

  .tab {
    flex: 1;
    min-height: 44px;
    background: transparent;
    border: none;
    color: #64748b;
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    touch-action: manipulation;
  }

  .tab.active {
    color: #2dd4bf;
    border-bottom-color: #2dd4bf;
  }

  .list-scroll {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #252540 transparent;
  }

  .empty-msg {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #64748b;
    text-align: center;
    padding: 32px 16px;
    margin: 0;
  }

  .comp-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    min-height: 56px;
    border-bottom: 1px solid #252540;
    cursor: pointer;
    transition: background 0.1s;
  }

  @media (hover: hover) {
    .comp-row:hover { background: #252540; }
  }

  .comp-marker {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
  }

  .comp-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }

  .comp-asset {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .comp-label {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .comp-status {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .ok       { color: #16a34a; }
  .failed   { color: #dc2626; }
  .problem  { color: #d97706; }
  .inactive { color: #6b7280; }
</style>
