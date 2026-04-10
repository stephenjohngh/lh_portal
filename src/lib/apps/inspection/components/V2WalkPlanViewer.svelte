<!-- src/lib/apps/inspection/components/V2WalkPlanViewer.svelte -->
<!-- Floor component map: grouped component list for the current floor.
     Note: V2 components do not yet have SVG position data.
     This view provides a practical spatial overview by type group. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { resultLabel } from '../utils/v2walkHelpers.js';
  import WalkButton from '$lib/apps/inspection/components/common/WalkButton.svelte';

  const dispatch = createEventDispatcher();

  export let components   = [];
  export let currentIndex = 0;
  export let inspections  = {};
  export let floor        = null;
  export let types        = [];

  function getType(c)   { return types.find(t => t.code === c.type_code); }
  function getResult(c) { return inspections[c.id]?.inspection_result ?? null; }

  // Group by type_code for spatial-style display
  $: typeGroups = (() => {
    const map = {};
    for (const c of components) {
      const k = c.type_code;
      if (!map[k]) map[k] = { type: getType(c), components: [] };
      map[k].components.push(c);
    }
    return Object.values(map);
  })();

  $: passCount     = components.filter(c => getResult(c) === 'ok').length;
  $: failCount     = components.filter(c => getResult(c) === 'failed').length;
  $: problemCount  = components.filter(c => getResult(c) === 'problem').length;
  $: inspCount     = components.filter(c => getResult(c) !== null).length;

  function resultBarCls(r) {
    return { ok:'bar-ok', failed:'bar-fail', problem:'bar-prob', inactive:'bar-na' }[r] ?? 'bar-none';
  }

  function handleSelect(c) {
    const idx = components.findIndex(x => x.id === c.id);
    if (idx >= 0) dispatch('select', { index: idx });
  }
</script>

<div class="pv">
  <div class="pv-hdr">
    <WalkButton variant="ghost" size="sm" on:click={() => dispatch('close')}>✕ CLOSE</WalkButton>
    <div class="pv-title">{floor?.short_name ?? '?'} — FLOOR STATUS</div>
    <div class="pv-stats">
      <span class="s-pass">✓ {passCount}</span>
      <span class="s-fail">✗ {failCount}</span>
      <span class="s-prob">⚙ {problemCount}</span>
      <span class="s-tot">{inspCount}/{components.length}</span>
    </div>
  </div>

  <div class="pv-body">
    {#if typeGroups.length === 0}
      <div class="empty">No components on this floor</div>
    {:else}
      {#each typeGroups as grp}
        <div class="type-group">
          <div class="type-hdr">
            {#if grp.type}
              <div class="type-dot" style="background:#{grp.type.colour}">{grp.type.initial}</div>
              <span class="type-name">{grp.type.name}</span>
            {:else}
              <div class="type-dot">?</div>
              <span class="type-name">Unknown</span>
            {/if}
            <span class="type-count">{grp.components.length}</span>
          </div>
          <div class="comp-grid">
            {#each grp.components as c}
              {@const result  = getResult(c)}
              {@const isCurr  = components.indexOf(c) === currentIndex}
              <button
                class="comp-cell"
                class:cell-current={isCurr}
                class:cell-ok={result === 'ok'}
                class:cell-fail={result === 'failed'}
                class:cell-prob={result === 'problem'}
                class:cell-na={result === 'inactive'}
                on:click={() => handleSelect(c)}
              >
                <div class="cell-id">{c.asset_id ?? '?'}</div>
                {#if result}
                  <div class="cell-res {resultBarCls(result)}"></div>
                {/if}
                {#if isCurr}
                  <div class="cell-here">●</div>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .pv { display:flex; flex-direction:column; min-height:calc(100vh - 64px); background:#0d0d14; color:#f0f0f0; font-family:'DM Mono','Courier New',monospace; }
  .pv-hdr { display:flex; align-items:center; gap:0.75rem; padding:1rem 1.25rem; background:#111122; border-bottom:1px solid #2e2e42; }
  .pv-title { flex:1; font-size:0.7rem; letter-spacing:0.15em; color:#ccc; font-weight:700; }
  .pv-stats { display:flex; gap:0.6rem; font-size:0.75rem; font-weight:700; }
  .s-pass { color:#4ade80; }
  .s-fail { color:#f87171; }
  .s-prob { color:#fb923c; }
  .s-tot  { color:#ccc; }

  .pv-body { overflow-y:auto; flex:1; padding:1rem; display:flex; flex-direction:column; gap:1.25rem; }

  .type-hdr { display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem; }
  .type-dot  { width:1.5rem; height:1.5rem; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.6rem; font-weight:700; color:#fff; flex-shrink:0; background:#444; }
  .type-name { font-size:0.72rem; font-weight:700; color:#ddd; flex:1; }
  .type-count { font-size:0.65rem; color:#888; }

  .comp-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(5rem, 1fr)); gap:0.375rem; }
  .comp-cell { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:0.625rem 0.25rem; background:#111122; border:1px solid #2e2e42; border-radius:6px; cursor:pointer; transition:all 0.12s; min-height:3.5rem; gap:0.2rem; }
  .comp-cell:hover { border-color:#fb923c; background:#1a1200; }
  .cell-id { font-size:0.7rem; font-weight:700; color:#f0f0f0; font-variant-numeric:tabular-nums; text-align:center; }

  .cell-current { border-color:#fb923c !important; background:#1a0e00 !important; }

  .cell-ok   { border-color:#166534; background:#071207; }
  .cell-fail { border-color:#7f1d1d; background:#120707; }
  .cell-prob { border-color:#7c2d12; background:#100a00; }
  .cell-na   { border-color:#374151; background:#111122; }

  .cell-res { width:100%; height:3px; border-radius:2px; }
  .bar-ok   { background:#22c55e; }
  .bar-fail { background:#ef4444; }
  .bar-prob { background:#fb923c; }
  .bar-na   { background:#4b5563; }
  .bar-none { background:transparent; }

  .cell-here { position:absolute; top:3px; right:4px; font-size:0.5rem; color:#fb923c; }

  .empty { padding:3rem; text-align:center; color:#555; font-size:0.82rem; }
</style>
