<!-- plan/PlanModeHints.svelte -->
<!-- Context hint bar shown below the toolbar in the plan view.
     One coloured hint per active drawing mode, plus a vertex-editing reminder.
     Purely presentational — no events dispatched. -->
<script>
  export let drawingMode         = 'off';
  export let vertexEditingActive = false;
  export let drawingVertices     = [];   // plain array (resolved from store in parent)
  export let scalePoint1         = null;
  export let scalePoint2         = null;
</script>

{#if drawingMode === 'component'}
  <div class="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20
              text-xs text-amber-300/80 flex items-center gap-2">
    <span>✏</span>
    <span>Click a blank area to place a component. Drag existing markers to reposition.</span>
  </div>

{:else if drawingMode === 'space'}
  <div class="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20
              text-xs text-purple-300/80 flex items-center gap-2">
    <span>⬡</span>
    <span>
      {#if drawingVertices.length > 0}
        Click on the plan to add polygon vertices.
        {#if drawingVertices.length >= 3}
          Click the first vertex <strong>●</strong> to close, or press <strong>Finish</strong>.
        {:else}
          {3 - drawingVertices.length} more {3 - drawingVertices.length === 1 ? 'vertex' : 'vertices'} needed.
        {/if}
      {:else}
        Click an existing space to select and edit it, or click a blank area to draw a new space.
      {/if}
    </span>
  </div>

{:else if drawingMode === 'scale'}
  <div class="px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20
              text-xs text-teal-300/80 flex items-center gap-2">
    <span>📏</span>
    <span>
      {#if !scalePoint1}
        Click the <strong>first point</strong> of a known distance on the plan.
      {:else if !scalePoint2}
        Click the <strong>second point</strong> of the same known distance.
      {:else}
        Enter the real-world distance in the panel and press <strong>Apply</strong>.
      {/if}
    </span>
  </div>

{:else if drawingMode === 'annotation'}
  <div class="px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20
              text-xs text-sky-300/80 flex items-center gap-2">
    <span>🏷</span>
    <span>Click anywhere on the plan to drop a text note. Drag existing notes to reposition.</span>
  </div>
{/if}

{#if vertexEditingActive}
  <div class="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20
              text-xs text-purple-300/80 flex items-center gap-2">
    <span>✦</span>
    <span>Drag the <strong class="text-purple-400">●</strong> vertex handles to reshape
      the space. Press <strong>Done editing</strong> in the panel when finished.</span>
  </div>
{/if}
