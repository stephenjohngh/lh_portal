<script>
  // src/lib/apps/mobileplan/components/UnplacedSheet.svelte
  // Searchable list of all components on the current floor.
  // Each row: marker | ref | label | type | status  (BA report columns 1–5).
  // Tapping a placed component → navigate to it on plan.
  // Tapping unplaced → open ComponentSheet.

  import { createEventDispatcher } from 'svelte';

  export let components   = [];
  export let currentFloor = null;
  export let types        = [];
  export let inspections  = {};

  const dispatch = createEventDispatcher();

  let query = '';

  function getType(typeCode) {
    return types.find(t => t.code === typeCode) ?? null;
  }

  $: filtered = query.trim()
    ? components.filter(c => {
        const q = query.toLowerCase();
        return (c.asset_id  ?? '').toLowerCase().includes(q)
            || (c.label     ?? '').toLowerCase().includes(q)
            || (c.notes     ?? '').toLowerCase().includes(q)
            || (c.type_code ?? '').toLowerCase().includes(q);
      })
    : components;

  function refStr(c, type) {
    const fl  = currentFloor?.short_name ?? '?';
    const ini = type?.initial ?? '?';
    const id  = c.asset_id || '—';
    return `${fl}/${ini}/${id}`;
  }

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
    if (c.plan_id != null) {
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

  <!-- List -->
  <div class="list-scroll">
    {#if filtered.length === 0}
      <p class="empty-msg">No components match your search.</p>
    {:else}
      {#each filtered as c (c.id)}
        {@const type = getType(c.type_code)}
        {@const ref  = refStr(c, type)}

        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="comp-row" on:click={() => selectComponent(c)}>
          <div class="comp-marker" style="background: #{type?.colour ?? '64748b'};">
            {type?.initial ?? '?'}
          </div>
          <p class="comp-line">
            <span class="seg-ref">{ref}</span><span class="sep"> | </span><span class="seg">{c.label || '—'}</span><span class="sep"> | </span><span class="seg">{type?.name ?? c.type_code ?? '—'}</span><span class="sep"> | </span><span class="seg {resultClass(c.status)}">{resultLabel(c.status)}</span>
          </p>
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
    gap: 10px;
    padding: 0 14px;
    min-height: 48px;
    border-bottom: 1px solid #252540;
    cursor: pointer;
    transition: background 0.1s;
  }

  @media (hover: hover) {
    .comp-row:hover { background: #252540; }
  }

  .comp-marker {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
  }

  .comp-line {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .seg-ref { font-weight: 600; }
  .seg     { }
  .sep     { color: #475569; }

  .ok       { color: #16a34a; }
  .failed   { color: #dc2626; }
  .problem  { color: #d97706; }
  .inactive { color: #6b7280; }
</style>
