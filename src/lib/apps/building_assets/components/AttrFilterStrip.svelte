<!-- src/lib/apps/building_assets/components/AttrFilterStrip.svelte -->
<!-- One attribute-filter strip (Fixed or Condition) for the Components tab: a
     horizontally-scrolling row of AttrFilterChip + an anchored "+ Add filter"
     button with its AttrFilterPopover. Controlled component — the parent owns
     popoverState + the filter arrays and handles the dispatched events
     (add/edit/remove/apply/cancel). Used twice (Fixed, Condition). See
     CLAUDE.md "Testing". -->
<script>
  import { createEventDispatcher } from 'svelte';
  import AttrFilterChip    from './AttrFilterChip.svelte';
  import AttrFilterPopover from './AttrFilterPopover.svelte';
  const dispatch = createEventDispatcher();

  export let label         = '';      // 'Fixed' | 'Condition'
  export let filters       = [];      // the strip's current filters
  export let defById;                 // Map<defId, def> for chip labels
  export let availableDefs = [];      // defs offered in the popover
  export let attrOptions   = {};
  export let systems       = [];
  export let types         = [];
  export let popoverOpen   = false;   // popoverState?.kind === this strip's kind
  export let editIndex     = null;    // index being edited, or null when adding

  $: existing = editIndex == null ? null : filters[editIndex];
  $: lower    = label.toLowerCase();
</script>

<div class="px-4 py-2 border-b border-slate-700 flex items-center gap-2 bg-slate-800/40">
  <span class="text-[10px] uppercase tracking-wide text-slate-300 font-semibold shrink-0 w-20">{label}</span>
  <div class="min-w-0 overflow-x-auto flex items-center gap-1.5 py-0.5 max-w-full">
    {#each filters as f, i (i + ':' + f.defId)}
      <AttrFilterChip
        filter={f}
        def={defById.get(f.defId)}
        on:edit={() => dispatch('edit', { index: i })}
        on:remove={() => dispatch('remove', { index: i })}
      />
    {/each}
  </div>
  <div class="relative shrink-0">
    <button
      on:click={() => dispatch('add')}
      class="px-2 py-0.5 text-xs rounded-full border border-dashed border-slate-600 text-slate-400
             hover:text-white hover:border-purple-500 whitespace-nowrap transition-colors"
      disabled={availableDefs.length === 0}
      title={availableDefs.length === 0 ? `No ${lower} attributes available` : `Add a ${lower}-attribute filter`}
    >+ Add filter</button>
    {#if popoverOpen}
      <div class="absolute top-full left-0 mt-1 z-50">
        <AttrFilterPopover
          {availableDefs}
          {attrOptions}
          {systems}
          {types}
          {existing}
          className="{label} attribute"
          on:apply={e => dispatch('apply', e.detail)}
          on:cancel={() => dispatch('cancel')}
        />
      </div>
    {/if}
  </div>
</div>
