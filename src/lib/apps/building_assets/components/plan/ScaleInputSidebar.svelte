<!-- plan/ScaleInputSidebar.svelte -->
<!-- Sidebar panel for entering the real-world distance between the two
     scale reference points the user clicked on the plan. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher } from 'svelte';
  import { inp } from '../../ui.js';

  export let point1  = null;   // { x, y } — first reference click (fractions)
  export let point2  = null;   // { x, y } — second reference click (fractions)
  export let saving  = false;

  const dispatch = createEventDispatcher();

  let metresInput = '';


  $: parsedMetres = parseFloat(metresInput);
  $: valid = point1 && point2 && parsedMetres > 0;
</script>

<div class="bg-slate-800 rounded-xl border border-teal-700/50 p-4">

  <!-- Header -->
  <div class="flex items-center justify-between mb-3">
    <div>
      <p class="font-semibold text-white text-sm">Set Scale</p>
      <p class="text-xs text-slate-500 mt-0.5">Enter the real-world distance between your two points</p>
    </div>
    <Button variant="tertiary" size="xs" on:click={() => dispatch('cancel')}>✕</Button>
  </div>

  <!-- Coordinate readout -->
  {#if point1 && point2}
    <div class="mb-3 p-2 rounded bg-slate-700/50 text-xs font-mono text-slate-400 space-y-0.5">
      <p>A ({(point1.x * 100).toFixed(1)}%, {(point1.y * 100).toFixed(1)}%)</p>
      <p>B ({(point2.x * 100).toFixed(1)}%, {(point2.y * 100).toFixed(1)}%)</p>
    </div>
  {/if}

  <!-- Distance input -->
  <div class="flex flex-col gap-1 mb-4">
    <label class="text-xs text-slate-400" for="scale-metres">
      Distance A → B <span class="text-red-400">*</span>
    </label>
    <div class="flex items-center gap-2">
      <input
        id="scale-metres"
        type="number"
        min="0.01"
        step="0.01"
        bind:value={metresInput}
        placeholder="e.g. 10.0"
        class="{inp} flex-1"
      />
      <span class="text-sm text-slate-400 shrink-0">m</span>
    </div>
  </div>

  <!-- Actions -->
  <div class="flex gap-2">
    <Button variant="tertiary" size="xs" title="Re-pick the second point" on:click={() => dispatch('repick')}>↩ Re-pick</Button>
    <Button variant="secondary" size="small" on:click={() => dispatch('cancel')}>Cancel</Button>
    <Button variant="primary" size="small" disabled={!valid || saving} on:click={() => dispatch('apply', { metres: parsedMetres })}>{saving ? 'Saving…' : 'Apply'}</Button>
  </div>

</div>
