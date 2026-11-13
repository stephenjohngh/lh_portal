<!-- src/lib/apps/building_assets/components/ComponentLocation.svelte -->
<!-- Where is this one? — the component's floor schematic with it marked.

     The drawing is #lib/utils/planMarker.js, shared with the Inspection app's
     "show on floor plan"; the chrome is this app's. Used in two places: inside
     ComponentPlanPeek (a pop-up, Works) and beside a component's details on the
     Components tab (2026-11-13). Read-only: Schematics is where components are
     placed and moved. -->
<script>
  import { errMessage } from '#lib/utils/errors.js';
  import { tick } from 'svelte';
  import { drawComponentOnPlan } from '#lib/utils/planMarker.js';

  /** The components row — needs schematic_id, x_position, y_position. */
  export let component = null;
  /** schematics from the store; the right one is found by schematic_id. */
  export let plans = [];
  export let typeName = '';
  /** Draw only while true (a closed pop-up draws nothing). */
  export let active = true;

  let canvas;
  let loading = false;
  let error = '';
  let placed = true;

  $: plan = component?.schematic_id
    ? (plans.find(p => p.id === component.schematic_id) ?? null)
    : null;

  // Guard on PRIMITIVES (CLAUDE.md: an object prop reads as changed on every
  // parent update). The position is part of the key so a moved component is
  // drawn again.
  let drawnFor = null;
  $: key = component?.id
    ? `${component.id}|${component.schematic_id}|${component.x_position}|${component.y_position}|${plan?.image_url ?? ''}`
    : null;
  $: if (active && key && key !== drawnFor && component?.schematic_id) {
    drawnFor = key;
    draw();
  }
  $: if (!active) drawnFor = null;

  async function draw() {
    loading = true; error = ''; placed = true;
    await tick();                      // the canvas does not exist until now
    try {
      const result = await drawComponentOnPlan(canvas, {
        imageUrl: plan?.image_url,
        x: component.x_position,
        y: component.y_position,
      });
      placed = result.placed;
    } catch (err) {
      error = errMessage(err);
    } finally {
      loading = false;
    }
  }
</script>

<div class="space-y-3">
  {#if typeName || component?.label || plan?.name}
    <p class="text-xs text-slate-400">
      {#if typeName}<span class="text-slate-300">{typeName}</span>{/if}
      {#if component?.label}· {component.label}{/if}
      {#if plan?.name}· <span class="text-slate-500">{plan.name}</span>{/if}
    </p>
  {/if}

  {#if !component?.schematic_id}
    <!-- Not an error: plenty of components are legitimately unplaced. -->
    <p class="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-3">
      This component is not on a floor schematic. Place it in <strong>Schematics</strong>
      to see it here.
    </p>
  {:else if error}
    <p class="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded p-3">⚠ {error}</p>
  {:else}
    {#if loading}
      <p class="text-xs text-slate-500 text-center py-6">Loading schematic…</p>
    {/if}
    <div class="flex justify-center">
      <canvas bind:this={canvas} class="max-w-full rounded border border-slate-700 bg-slate-900"></canvas>
    </div>
    {#if !placed && !loading}
      <p class="text-xs text-amber-300">On this schematic, but without a position set — nothing is marked.</p>
    {/if}
  {/if}
</div>
