<!-- src/lib/apps/inspection/components/V2WalkJumpList.svelte -->
<!-- Full scrollable component list for jumping to any item in the session. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { resultLabel, worstResult } from '../utils/v2walkHelpers.js';
  import WalkButton from '$lib/apps/inspection/components/common/WalkButton.svelte';

  const dispatch = createEventDispatcher();

  export let components    = [];    // walkComponents array
  export let currentIndex  = 0;
  export let inspections   = {};    // { componentId: inspection row }
  export let floor         = null;  // current floor object
  export let types         = [];

  function getType(c) { return types.find(t => t.code === c.type_code); }
  function getInsp(c) { return inspections[c.id] ?? null; }
  function getResult(c) { const i = getInsp(c); return i?.inspection_result ?? null; }

  $: passCount     = components.filter(c => getResult(c) === 'ok').length;
  $: failCount     = components.filter(c => getResult(c) === 'failed').length;
  $: problemCount  = components.filter(c => getResult(c) === 'problem').length;
  $: inspectedCount = components.filter(c => getInsp(c) !== null).length;
</script>

<div class="jl">
  <div class="jl-hdr">
    <WalkButton variant="ghost" size="sm" on:click={() => dispatch('close')}>✕ CLOSE</WalkButton>
    <div class="jl-stats">
      <span class="stat-pass">✓ {passCount}</span>
      <span class="stat-fail">✗ {failCount}</span>
      <span class="stat-prob">⚙ {problemCount}</span>
      <span class="stat-tot">{inspectedCount}/{components.length}</span>
    </div>
  </div>

  <div class="jl-list">
    {#each components as c, i (c.id)}
      {@const t      = getType(c)}
      {@const result = getResult(c)}
      {@const isCurrent = i === currentIndex}
      <button
        class="jl-row"
        class:jl-current={isCurrent}
        class:jl-done={result !== null}
        on:click={() => dispatch('jump', { index: i })}
      >
        <div class="jl-bar bar-{result ?? 'none'}"></div>
        {#if t}
          <div class="jl-dot" style="background:#{t.colour}">{t.initial}</div>
        {:else}
          <div class="jl-dot">?</div>
        {/if}
        <div class="jl-body">
          <div class="jl-ref">{floor?.short_name ?? '?'} / {c.asset_id ?? '?'}</div>
          {#if c.label}<div class="jl-label">{c.label}</div>{/if}
        </div>
        {#if isCurrent}
          <span class="here-badge">HERE</span>
        {:else if result}
          <span class="res-badge res-{result}">{resultLabel(result)}</span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .jl { display:flex; flex-direction:column; min-height:calc(100vh - 64px); background:#0d0d14; color:#f0f0f0; font-family:'DM Mono','Courier New',monospace; }
  .jl-hdr { display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; background:#111122; border-bottom:1px solid #2e2e42; }
  .jl-stats { display:flex; gap:0.75rem; font-size:0.78rem; font-weight:700; }
  .stat-pass { color:#4ade80; }
  .stat-fail { color:#f87171; }
  .stat-prob { color:#fb923c; }
  .stat-tot  { color:#ccc; }
  .jl-list { overflow-y:auto; flex:1; }
  .jl-row { width:100%; display:flex; align-items:center; gap:0.75rem; padding:0.75rem 1rem; background:none; border:none; border-bottom:1px solid #1a1a2e; font-family:inherit; cursor:pointer; text-align:left; transition:background 0.1s; }
  .jl-row:hover { background:#111122; }
  .jl-current { background:#1a0e00 !important; }
  .jl-bar { width:3px; height:2.25rem; border-radius:2px; flex-shrink:0; }
  .bar-ok       { background:#22c55e; }
  .bar-failed   { background:#ef4444; }
  .bar-problem  { background:#fb923c; }
  .bar-inactive { background:#4b5563; }
  .bar-none     { background:#2e2e42; }
  .jl-dot { width:1.75rem; height:1.75rem; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:700; color:#fff; flex-shrink:0; }
  .jl-body { flex:1; min-width:0; }
  .jl-ref   { font-size:0.85rem; font-weight:700; color:#f0f0f0; font-variant-numeric:tabular-nums; }
  .jl-label { font-size:0.68rem; color:#fb923c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .here-badge { font-size:0.6rem; font-weight:800; letter-spacing:0.1em; color:#fb923c; padding:0.2rem 0.5rem; border:1px solid #fb923c; border-radius:4px; flex-shrink:0; }
  .res-badge { font-size:0.6rem; font-weight:700; letter-spacing:0.05em; flex-shrink:0; }
  .res-ok       { color:#4ade80; }
  .res-failed   { color:#f87171; }
  .res-problem  { color:#fb923c; }
  .res-inactive { color:#888; }
</style>
