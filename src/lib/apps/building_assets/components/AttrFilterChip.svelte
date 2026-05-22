<!-- src/lib/apps/building_assets/components/AttrFilterChip.svelte -->
<!-- A single active attribute filter, rendered as a removable chip.
     Click the body of the chip → emit 'edit' (parent re-opens the popover).
     Click the ✕                  → emit 'remove'. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { OP_SYMBOL } from '../utils/attrFilters.js';

  /** The filter object — see attrFilters.js for the shape */
  export let filter;
  /** The attribute definition this filter targets (for label + display_type) */
  export let def;

  const dispatch = createEventDispatcher();

  // Human-readable value summary depending on op
  $: valueText = (() => {
    if (!filter) return '';
    switch (filter.op) {
      case 'in':
        return (filter.values ?? []).join(' | ');
      case 'is_true':  return 'Yes';
      case 'is_false': return 'No';
      case 'lt': case 'lte': case 'eq': case 'gte': case 'gt':
        return String(filter.values ?? '');
      case 'contains': case 'starts': case 'eq_text':
        return `"${filter.values ?? ''}"`;
      default:
        return String(filter.values ?? '');
    }
  })();

  $: opText = OP_SYMBOL[filter?.op] ?? filter?.op ?? '';
</script>

<div
  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-purple-500/40
         bg-purple-600/15 text-purple-200 text-xs whitespace-nowrap shrink-0
         hover:bg-purple-600/25 transition-colors"
>
  <button
    on:click={() => dispatch('edit')}
    class="flex items-center gap-1 hover:text-white"
    title="Click to edit this filter"
  >
    <span class="font-medium">{def?.name ?? '?'}</span>
    {#if filter?.op !== 'in' && filter?.op !== 'is_true' && filter?.op !== 'is_false'}
      <span class="text-purple-400/80">{opText}</span>
    {/if}
    <span>{valueText}</span>
    {#if filter?.includeUnset}
      <span class="text-[10px] text-purple-400/70" title="Also includes components with no value">+∅</span>
    {/if}
  </button>
  <button
    on:click={() => dispatch('remove')}
    class="text-purple-400/70 hover:text-red-400 ml-0.5"
    title="Remove this filter"
    aria-label="Remove filter on {def?.name}"
  >✕</button>
</div>
