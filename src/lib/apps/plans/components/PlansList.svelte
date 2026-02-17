<!-- src/lib/apps/plans/components/PlansList.svelte -->
<!-- Grid view of all floor plans -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { onMount } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import PlanCard from './PlanCard.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { plansStore } from '../stores/plansStore';
  
  const logger = getLogger('PlansList');
  const dispatch = createEventDispatcher();
  
  export let plans = [];
  export let permissionLevel = 'readonly';
  $: isAdmin = permissionLevel === 'admin';
  
  let elementCounts = {};
  let loading = true;
  
  onMount(async () => {
    await loadElementCounts();
    loading = false;
  });
  
  async function loadElementCounts() {
    logger('Loading element counts for all plans');
    
    for (const plan of plans) {
      try {
        const elements = await plansStore.loadElements(plan.id);
        
        // Count elements by type
        const counts = elements.reduce((acc, element) => {
          acc[element.element_type] = (acc[element.element_type] || 0) + 1;
          return acc;
        }, {});
        
        elementCounts[plan.id] = counts;
      } catch (error) {
        logger('❌ Error loading elements for plan:', plan.id, error);
        elementCounts[plan.id] = {};
      }
    }
    
    // Trigger reactivity
    elementCounts = { ...elementCounts };
  }
  
  function handleViewPlan(event) {
    dispatch('selectPlan', { planId: event.detail.planId });
  }
</script>

<div>
  {#if plans.length === 0}
    <div class="card-info text-center py-12">
      <Icon name="map" size={16} className="text-gray-600 mx-auto mb-4" />
      <h3 class="text-xl font-bold mb-2">No Floor Plans Yet</h3>
      {#if isAdmin}
        <p class="text-gray-400 mb-2">Get started by uploading your first floor plan.</p>
        <p class="text-sm text-gray-500">💡 Click "New Floor Plan" above to upload an image.</p>
      {:else}
        <p class="text-gray-400">No floor plans have been created yet.</p>
      {/if}
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each plans as plan (plan.id)}
        <PlanCard
          {plan}
          elementCounts={elementCounts[plan.id] || {}}
          on:view={handleViewPlan}
        />
      {/each}
    </div>
  {/if}
</div>
