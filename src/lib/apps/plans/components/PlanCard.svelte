<!-- src/lib/apps/plans/components/PlanCard.svelte -->
<!-- Individual floor plan card with summary -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
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

<div class="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden hover:border-purple-500 transition-colors">
  <!-- Plan Image Preview -->
  <div class="relative h-48 bg-slate-900 overflow-hidden">
    <img
      src={plan.image_url}
      alt={plan.name}
      class="w-full h-full object-contain"
    />
    {#if totalElements > 0}
      <div class="absolute top-2 right-2">
        <Badge variant="primary">
          {totalElements} {totalElements === 1 ? 'element' : 'elements'}
        </Badge>
      </div>
    {/if}
  </div>
  
  <!-- Plan Info -->
  <div class="p-4">
    <h3 class="text-lg font-bold mb-1">{plan.name}</h3>
    <p class="text-sm text-gray-400 mb-3">
      {plan.building}
      {#if plan.floor_level !== null && plan.floor_level !== undefined}
        · Floor {plan.floor_level}
      {/if}
    </p>
    
    {#if plan.description}
      <p class="text-sm text-gray-300 mb-3 line-clamp-2">
        {plan.description}
      </p>
    {/if}
    
    <!-- Element Counts -->
    {#if totalElements > 0}
      <div class="flex flex-wrap gap-2 mb-3">
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
      <p class="text-sm text-gray-500 mb-3 italic">No elements yet</p>
    {/if}
    
    <!-- Actions -->
    <Button
      variant="primary"
      size="medium"
      icon="map"
      on:click={handleView}
      className="w-full"
    >
      View Plan
    </Button>
  </div>
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
