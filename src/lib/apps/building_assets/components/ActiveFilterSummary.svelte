<!-- src/lib/apps/building_assets/components/ActiveFilterSummary.svelte -->
<!-- Read-only pills summarising the active Components-tab filters. Purely
     presentational (props in, no events/bindings). See CLAUDE.md "Testing". -->
<script>
  export let floorPreset     = 'all';
  export let floorLabel      = '';
  export let filterSystemIds = new Set();
  export let filterTypeCodes = new Set();
  export let filterStatuses  = new Set();
  export let searchQuery     = '';
  export let systems         = [];
  export let types           = [];
</script>

<div class="w-full flex flex-wrap gap-1.5 mt-0.5">
  {#if floorPreset !== 'all'}
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                 bg-purple-900/40 text-purple-300 border border-purple-700/40">
      {floorLabel}
    </span>
  {/if}
  {#if filterSystemIds.size > 0}
    {@const names = systems.filter(s => filterSystemIds.has(s.id)).map(s => s.name)}
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                 bg-slate-700 text-slate-300 border border-slate-600">
      System: {names.join(', ')}
    </span>
  {/if}
  {#if filterTypeCodes.size > 0}
    {@const names = types.filter(t => filterTypeCodes.has(t.code)).map(t => t.name)}
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                 bg-slate-700 text-slate-300 border border-slate-600">
      Type: {names.join(', ')}
    </span>
  {/if}
  {#if filterStatuses.size > 0}
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                 bg-slate-700 text-slate-300 border border-slate-600">
      Status: {[...filterStatuses].join(', ')}
    </span>
  {/if}
  {#if searchQuery.trim()}
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]
                 bg-slate-700 text-slate-300 border border-slate-600">
      "{searchQuery.trim()}"
    </span>
  {/if}
</div>
