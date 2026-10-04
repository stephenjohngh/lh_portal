<!-- src/lib/apps/parking/components/BayMap.svelte -->
<!-- A basement plan with its bays coloured by state. READ-ONLY on purpose:
     bays are drawn and reshaped in Building Assets → Plan View, whose editor
     is PlanCanvas. This is a picture of that drawing, not a second editor, so
     it uses the same frame (plan image + an SVG overlay in 0–1 coordinates)
     without borrowing any of the editing behaviour.
     docs/requirements/app_designs/Parking_App_Design.md §6. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { centroid } from '#lib/apps/building_assets/components/plan/planMeasure.js';
  import { BAY_STATE } from '../utils/bayModel.js';

  export let plan = null;          // { image_url, name }
  export let bays = [];            // merged bays drawn on this plan
  export let selectedSpaceId = null;

  const dispatch = createEventDispatcher();

  $: drawn = bays.filter(b => (b.space?.polygon?.length ?? 0) >= 3);
</script>

{#if !plan}
  <p class="text-sm text-slate-500 italic">No plan for this level.</p>
{:else}
  <div class="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900" data-testid="bay-map">
    <img src={plan.image_url} alt="{plan.name ?? 'Basement'} plan" class="w-full h-auto block select-none" draggable="false" />

    <svg class="absolute inset-0 w-full h-full" viewBox="0 0 1 1" preserveAspectRatio="none">
      {#each drawn as bay (bay.space_id)}
        {@const colour = BAY_STATE[bay.state]?.colour ?? '#94a3b8'}
        {@const selected = bay.space_id === selectedSpaceId}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <polygon
          points={bay.space.polygon.map(v => `${v.x},${v.y}`).join(' ')}
          fill={colour}
          fill-opacity={selected ? 0.6 : 0.35}
          stroke={selected ? '#ffffff' : colour}
          stroke-width={selected ? 0.004 : 0.002}
          style="cursor:pointer"
          on:click={() => dispatch('select', bay.space_id)}
        >
          <title>{bay.ref} · {BAY_STATE[bay.state]?.label}{bay.size ? ' · ' + bay.size : ''}</title>
        </polygon>
      {/each}
    </svg>

    <!-- Bay numbers as HTML, not SVG text: the overlay is stretched to the
         image, so SVG text would be distorted with it. -->
    {#each drawn as bay (bay.space_id)}
      {@const c = centroid(bay.space.polygon)}
      <span
        class="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none text-[10px] font-bold
               text-white px-0.5 rounded bg-black/40"
        style="left:{c.x * 100}%; top:{c.y * 100}%"
      >{bay.number ?? '?'}</span>
    {/each}
  </div>
{/if}
