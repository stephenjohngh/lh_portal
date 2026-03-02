<!-- src/lib/apps/plans/components/PlanCard.svelte -->
<!-- Individual floor plan card with summary - FIX #3: Made 30% smaller -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';
  
  const dispatch = createEventDispatcher();
  
  export let plan;
  export let elementCounts = {};
  
  $: totalElements = Object.values(elementCounts).reduce((sum, count) => sum + count, 0);
  
  function handleView() {
    dispatch('view', { planId: plan.id });
  }
</script>

<!-- Whole card is a button — same effect as the old "View Plan" button -->
<button
  class="w-full text-left bg-slate-800 border border-slate-700 rounded-lg overflow-hidden hover:border-purple-500 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
  on:click={handleView}
  aria-label="View plan: {plan.name}"
>
  <!-- Plan Image Preview - FIX #3: Reduced from h-48 to h-32 (33% smaller) -->
  <div class="relative h-32 bg-slate-900 overflow-hidden">
    <img
      src={plan.image_url}
      alt={plan.name}
      class="w-full h-full object-contain"
    />
    {#if plan.element_count > 0}
      <div class="absolute top-2 right-2">
        <Badge variant="primary">
          {plan.element_count} {plan.element_count === 1 ? 'element' : 'elements'}
        </Badge>
      </div>
    {:else if totalElements > 0}
      <div class="absolute top-2 right-2">
        <Badge variant="primary">
          {totalElements} {totalElements === 1 ? 'element' : 'elements'}
        </Badge>
      </div>
    {/if}
  </div>
  
  <!-- Plan Info - FIX #3: Reduced padding and spacing -->
  <div class="p-3">
    <h3 class="text-base font-bold mb-1">{plan.name}</h3>
    <p class="text-xs text-gray-400 mb-2">
      {plan.building}
      {#if plan.floor_level !== null && plan.floor_level !== undefined}
        · Floor {plan.floor_level}
      {/if}
    </p>
    
    {#if plan.description}
      <p class="text-xs text-gray-300 mb-2 line-clamp-2">
        {plan.description}
      </p>
    {/if}
    
    <!-- Element Counts - FIX #3: Smaller text and spacing -->
    {#if plan.element_count > 0 || totalElements > 0}
      <div class="flex flex-wrap gap-1.5">
        {#each ELEMENT_TYPE_OPTIONS as type}
          {#if elementCounts[type.value] > 0}
            <div class="text-xs flex items-center gap-1">
              <span>{type.icon}</span>
              <span class="text-gray-400">{elementCounts[type.value]}</span>
            </div>
          {/if}
        {/each}
      </div>
    {:else}
      <p class="text-xs text-gray-500 italic">No elements yet</p>
    {/if}
  </div>
</button>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
