<!-- src/lib/apps/building_assets/components/ConditionChecklistChips.svelte -->
<!--
  Renders the per-condition pass/fail summary for one inspection as a
  flex-wrap row of small badges. Used by every UI surface that needs to
  surface checklist_results — see lookups.js#conditionChecklistDisplay.

  Props:
    items   — [{ def, passed }] from conditionChecklistDisplay(); the
              component renders one chip per item, in given order.
    size    — 'sm' (default) or 'xs' (denser, for in-table use).
    inline  — when true the row flows inline with surrounding text
              (no wrap container). Otherwise it wraps onto multiple
              lines with consistent gap.

  Behaviour:
    - passed === true   → green tick chip
    - passed === false  → red cross chip (the headline failure indicator)
    - passed === null   → grey dash chip ("not recorded for this inspection")
    - When items is empty, renders nothing — caller is responsible for any
      "no condition attributes" empty-state copy.
-->
<script>
  /** @type {Array<{ def: { id: string, name: string }, passed: boolean|null }>} */
  export let items  = [];
  /** 'sm' | 'xs' */
  export let size   = 'sm';
  /** Render inline (no wrap container) vs a wrapping flex row */
  export let inline = false;

  $: chipClass = size === 'xs'
    ? 'text-[10px] px-1.5 py-0 leading-4'
    : 'text-[11px] px-2 py-0.5';

  /** @param {boolean|null} p */
  function chipColours(p) {
    if (p === true)  return 'bg-green-900/30 border-green-700/40 text-green-300';
    if (p === false) return 'bg-red-900/40 border-red-700/50 text-red-300';
    return                  'bg-slate-800 border-slate-700 text-slate-500';
  }

  /** @param {boolean|null} p */
  function glyph(p) {
    if (p === true)  return '✓';
    if (p === false) return '✗';
    return                  '—';
  }
</script>

{#if items.length > 0}
  <div class="flex {inline ? '' : 'flex-wrap'} gap-1 items-center">
    {#each items as { def, passed } (def.id)}
      <span
        class="inline-flex items-center gap-1 rounded border font-medium whitespace-nowrap
               {chipClass} {chipColours(passed)}"
        title={passed == null ? `${def.name}: not recorded for this inspection` : null}
      >
        <span aria-hidden="true">{glyph(passed)}</span>
        <span>{def.name}</span>
      </span>
    {/each}
  </div>
{/if}
