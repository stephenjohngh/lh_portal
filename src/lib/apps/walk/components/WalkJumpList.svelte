<!-- src/lib/apps/walk/components/WalkJumpList.svelte -->
<!-- List all elements in the walk session — tap any to jump there directly -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getElementDisplayName } from '$lib/utils/planConstants';

  const dispatch = createEventDispatcher();

  export let elements    = [];
  export let currentIndex = 0;
  export let inspections  = {};
  export let floorLevel;

  $: inspectedIds = new Set(Object.keys(inspections));

  $: passCount = Object.values(inspections).flat().filter(i => i.result === 'pass').length;
  $: failCount = Object.values(inspections).flat().filter(i => i.result === 'fail').length;

  function handleJump(index) {
    dispatch('jump', { index });
  }

  function lastResultFor(element) {
    const list = inspections[element.id];
    if (!list || list.length === 0) return null;
    return list[list.length - 1].result;
  }

  function statusDot(element) {
    const r = lastResultFor(element);
    if (r === 'pass') return 'dot-pass';
    if (r === 'fail') return 'dot-fail';
    if (r === 'na')   return 'dot-na';
    return 'dot-none';
  }
</script>

<div class="jump-list">

  <div class="jump-header">
    <button class="close-btn" on:click={() => dispatch('close')}>✕ CLOSE</button>
    <div class="jump-title">ALL ELEMENTS</div>
    <div class="jump-stats">
      <span class="stat-pass">✓ {passCount}</span>
      <span class="stat-fail">✗ {failCount}</span>
      <span class="stat-total">{inspectedIds.size}/{elements.length}</span>
    </div>
  </div>

  <div class="list-body">
    {#each elements as element, index}
      {@const isCurrent = index === currentIndex}
      {@const result = lastResultFor(element)}
      <button
        class="list-item"
        class:is-current={isCurrent}
        class:is-pass={result === 'pass'}
        class:is-fail={result === 'fail'}
        on:click={() => handleJump(index)}
      >
        <!-- Status dot -->
        <div class="dot {statusDot(element)}"></div>

        <!-- Name + label -->
        <div class="item-body">
          <div class="item-name">
            {getElementDisplayName(element, floorLevel)}
          </div>
          {#if element.label}
            <div class="item-label">{element.label}</div>
          {/if}
          {#if element.subtype}
            <div class="item-sub">{element.subtype}</div>
          {/if}
        </div>

        <!-- Status badge -->
        <div class="item-right">
          {#if element.status !== 'active'}
            <span class="item-status status-{element.status}">{element.status}</span>
          {/if}
          {#if isCurrent}
            <span class="item-here">HERE</span>
          {/if}
          {#if result === 'pass'}
            <span class="item-result result-pass">✓</span>
          {:else if result === 'fail'}
            <span class="item-result result-fail">✗</span>
          {:else if result === 'na'}
            <span class="item-result result-na">—</span>
          {/if}
        </div>
      </button>
    {/each}
  </div>

</div>

<style>
  .jump-list {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background: #0a0a0f;
  }

  /* ── Header ─────────────────────────────────────────────────────────── */
  .jump-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #1e1e2a;
    flex-shrink: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #f97316;
    font-family: inherit;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    cursor: pointer;
    padding: 0;
  }

  .jump-title {
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    color: #444;
  }

  .jump-stats {
    display: flex;
    gap: 0.5rem;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
  }

  .stat-pass  { color: #22c55e; }
  .stat-fail  { color: #ef4444; }
  .stat-total { color: #444; }

  /* ── List ────────────────────────────────────────────────────────────── */
  .list-body {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .list-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.875rem 1.25rem;
    background: none;
    border: none;
    border-bottom: 1px solid #111118;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.1s;
  }

  .list-item:hover     { background: #0d0d13; }
  .list-item.is-current { background: #0f1a00; border-left: 3px solid #f97316; padding-left: calc(1.25rem - 3px); }
  .list-item.is-pass   { border-left: 3px solid #22c55e; padding-left: calc(1.25rem - 3px); }
  .list-item.is-fail   { border-left: 3px solid #ef4444; padding-left: calc(1.25rem - 3px); }

  /* Status dot */
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-none { background: #2a2a3a; }
  .dot-pass { background: #22c55e; }
  .dot-fail { background: #ef4444; }
  .dot-na   { background: #555; }

  /* Item text */
  .item-body { flex: 1; min-width: 0; }

  .item-name {
    font-size: 0.875rem;
    color: #e8e8e0;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .item-label {
    font-size: 0.7rem;
    color: #666;
    margin-top: 0.1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-sub {
    font-size: 0.65rem;
    color: #444;
    margin-top: 0.1rem;
  }

  /* Right badges */
  .item-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .item-here {
    font-size: 0.55rem;
    letter-spacing: 0.15em;
    color: #f97316;
    font-weight: 700;
  }

  .item-status {
    font-size: 0.55rem;
    letter-spacing: 0.08em;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
  }

  .status-inactive    { background: #1a1a1a; color: #555; }
  .status-maintenance { background: #2a1a00; color: #f59e0b; }
  .status-removed     { background: #2a0000; color: #ef4444; }

  .item-result { font-size: 1rem; font-weight: 700; }
  .result-pass { color: #22c55e; }
  .result-fail { color: #ef4444; }
  .result-na   { color: #555; }
</style>
