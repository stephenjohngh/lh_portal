<!-- src/lib/apps/building_assets/components/ComponentPlanPeek.svelte -->
<!-- Where is this one? — a floor plan with a single component marked.

     The same idea as the Inspection app's "show on floor plan", and the same
     drawing (utils/planMarker.js). Not the same component: Inspection is dark,
     monospaced and touch-sized by design, and standard apps are Tailwind. The
     picture is shared; the chrome is each app's own.

     Deliberately read-only and single-purpose. Plan View is where components
     are placed and moved; this answers one question — "which one is that?" —
     without leaving the list you are working through. -->
<script>
  import { createEventDispatcher, tick } from 'svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import { drawComponentOnPlan } from '$lib/utils/planMarker.js';

  export let show = false;
  /** The components row — needs plan_id, x_position, y_position. */
  export let component = null;
  /** plans[] from the store; the right one is found by plan_id. */
  export let plans = [];
  /** Canonical reference, e.g. "G/L/L-042". */
  export let componentRef = '';
  /** Human type name, e.g. "LED Batten". */
  export let typeName = '';

  const dispatch = createEventDispatcher();

  let canvas;
  let loading = false;
  let error = '';
  let placed = true;

  $: plan = component?.plan_id
    ? (plans.find(p => p.id === component.plan_id) ?? null)
    : null;

  // Guard on a PRIMITIVE: `component` is an object prop and safe_not_equal
  // reports every object as changed, so keying off it would redraw on every
  // parent update — a fresh image load each time.
  let drawnFor = null;
  $: if (show && component?.id && component.id !== drawnFor) {
    drawnFor = component.id;
    draw();
  }
  $: if (!show) drawnFor = null;

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
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function close() { drawnFor = null; show = false; dispatch('close'); }
</script>

<Modal bind:show title={componentRef || 'Location'} size="large" on:close={close}>
  <div class="space-y-3">
    <p class="text-xs text-slate-400">
      {#if typeName}<span class="text-slate-300">{typeName}</span>{/if}
      {#if component?.label}· {component.label}{/if}
      {#if plan?.name}· <span class="text-slate-500">{plan.name}</span>{/if}
    </p>

    {#if !component?.plan_id}
      <!-- Not an error: plenty of components are legitimately unplaced, and
           saying so plainly is more useful than an empty box. -->
      <p class="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30
                rounded p-3">
        This component is not on a floor plan. Place it in <strong>Plan View</strong>
        to see it here.
      </p>
    {:else if error}
      <p class="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded p-3">
        ⚠ {error}
      </p>
    {:else}
      {#if loading}
        <p class="text-xs text-slate-500 text-center py-6">Loading plan…</p>
      {/if}
      <div class="flex justify-center">
        <canvas bind:this={canvas}
                class="max-w-full rounded border border-slate-700 bg-slate-900"></canvas>
      </div>
      {#if !placed && !loading}
        <p class="text-xs text-amber-300">
          On this plan, but without a position set — nothing is marked.
        </p>
      {/if}
    {/if}
  </div>

  <div slot="footer" class="flex justify-end">
    <Button variant="secondary" on:click={close}>Close</Button>
  </div>
</Modal>
