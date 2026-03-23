<!-- src/lib/apps/walk/components/WalkJumpList.svelte -->
<!-- List all elements in the walk session — tap any to jump there directly -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getElementDisplayName } from '$lib/utils/planConstants';

  const dispatch = createEventDispatcher();

  export let elements     = [];
  export let currentIndex = 0;
  export let inspections  = {};
  export let floorLevel;

  $: inspectedIds = new Set(Object.keys(inspections));
  $: passCount    = Object.values(inspections).flat().filter(i => i.result === 'OK').length;
  $: failCount    = Object.values(inspections).flat().filter(i => i.result === 'failed').length;
  $: problemCount = Object.values(inspections).flat().filter(i => i.result === 'problem').length;

  function lastResultFor(el) {
    const list = inspections[el.id];
    if (!list || list.length === 0) return null;
    return list[list.length - 1].result;
  }

  function dotCls(el) {
    const r = lastResultFor(el);
    if (r === 'OK')       return 'dot-pass';
    if (r === 'failed')   return 'dot-fail';
    if (r === 'problem')  return 'dot-repair';
    if (r === 'inactive') return 'dot-na';
    return 'dot-none';
  }
</script>

<div class="jl">

  <div class="jl-hdr">
    <button class="close-btn" on:click={() => dispatch('close')}>✕ CLOSE</button>
    <div class="jl-title">ALL ELEMENTS</div>
    <div class="jl-stats">
      <span class="stat-pass">✓ {passCount}</span>
      <span class="stat-fail">✗ {failCount}</span>
      {#if problemCount > 0}<span class="stat-repair">⚙ {problemCount}</span>{/if}
      <span class="stat-total">{inspectedIds.size}/{elements.length}</span>
    </div>
  </div>

  <div class="jl-body">
    {#each elements as el, idx}
      {@const isCurrent = idx === currentIndex}
      {@const result    = lastResultFor(el)}
      <button
        class="jl-item"
        class:is-current={isCurrent}
        class:is-pass={result === 'OK'}
        class:is-fail={result === 'failed'}
        class:is-repair={result === 'problem'}
        on:click={() => dispatch('jump', { index: idx })}
      >
        <div class="dot {dotCls(el)}"></div>

        <div class="item-body">
          <div class="item-name">{getElementDisplayName(el, floorLevel)}</div>
          {#if el.label}<div class="item-label">{el.label}</div>{/if}
          {#if el.subtype}<div class="item-sub">{el.subtype}</div>{/if}
        </div>

        <div class="item-r">
          {#if el.status !== 'active'}
            <span class="item-status st-{el.status}">{el.status}</span>
          {/if}
          {#if isCurrent}<span class="item-here">HERE</span>{/if}
          {#if result === 'OK'}
            <span class="item-res res-pass">✓</span>
          {:else if result === 'failed'}
            <span class="item-res res-fail">✗</span>
          {:else if result === 'problem'}
            <span class="item-res res-repair">⚙</span>
          {:else if result === 'inactive'}
            <span class="item-res res-na">—</span>
          {/if}
        </div>
      </button>
    {/each}
  </div>

</div>

<style>
  .jl {
    display: flex; flex-direction: column; flex: 1;
    background: #0d0d14; color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
    overflow: hidden;
  }

  /* ── Header ───────────────────────────────────────────────────────────────*/
  .jl-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem 1.25rem; border-bottom: 1px solid #2e2e42; flex-shrink: 0;
    background: #111122;
  }
  .close-btn {
    background: none; border: none; color: #fb923c;
    font-family: inherit; font-size: 0.78rem; font-weight: 700;
    letter-spacing: 0.1em; cursor: pointer; padding: 0;
  }
  .close-btn:hover { color: #fdba74; }
  .jl-title { font-size: 0.65rem; letter-spacing: 0.2em; color: #ccc; }
  .jl-stats { display: flex; gap: 0.625rem; font-size: 0.75rem; letter-spacing: 0.05em; }
  .stat-pass   { color: #4ade80; }
  .stat-fail   { color: #f87171; }
  .stat-repair { color: #fb923c; }
  .stat-total  { color: #ccc; }

  /* ── List ─────────────────────────────────────────────────────────────────*/
  .jl-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }

  .jl-item {
    width: 100%; display: flex; align-items: center; gap: 0.875rem;
    padding: 0.875rem 1.25rem; background: none; border: none;
    border-bottom: 1px solid #1a1a2a; text-align: left;
    cursor: pointer; font-family: inherit; transition: background 0.1s;
  }
  .jl-item:hover      { background: #111122; }
  .jl-item.is-current { background: #1a1200; border-left: 3px solid #fb923c; padding-left: calc(1.25rem - 3px); }
  .jl-item.is-pass    { border-left: 3px solid #22c55e; padding-left: calc(1.25rem - 3px); }
  .jl-item.is-fail    { border-left: 3px solid #ef4444; padding-left: calc(1.25rem - 3px); }

  .jl-item.is-repair  { border-left: 3px solid #ea580c; padding-left: calc(1.25rem - 3px); }

  .dot {
    width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
  }
  .dot-none   { background: #3e3e58; }
  .dot-pass   { background: #22c55e; }
  .dot-fail   { background: #ef4444; }
  .dot-repair { background: #ea580c; }
  .dot-na     { background: #888; }

  .item-body { flex: 1; min-width: 0; }
  .item-name  { font-size: 0.9rem; color: #f0f0f0; font-weight: 600; letter-spacing: 0.02em; }
  .item-label { font-size: 0.72rem; color: #ccc; margin-top: 0.1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item-sub   { font-size: 0.67rem; color: #bbb; margin-top: 0.1rem; }

  .item-r { display: flex; flex-direction: column; align-items: flex-end; gap: 0.2rem; flex-shrink: 0; }
  .item-here { font-size: 0.58rem; letter-spacing: 0.15em; color: #fb923c; font-weight: 700; }

  .item-status { font-size: 0.58rem; letter-spacing: 0.08em; padding: 0.15rem 0.4rem; border-radius: 3px; }
  .st-inactive    { background: #222235; color: #ccc; }
  .st-maintenance { background: #2a1800; color: #fbbf24; }
  .st-removed     { background: #2a0000; color: #f87171; }

  .item-res   { font-size: 1.1rem; font-weight: 800; }
  .res-pass   { color: #4ade80; }
  .res-fail   { color: #f87171; }
  .res-repair { color: #fb923c; }
  .res-na     { color: #ccc; }
</style>
