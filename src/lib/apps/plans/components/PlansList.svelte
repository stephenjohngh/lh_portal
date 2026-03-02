<!-- src/lib/apps/plans/components/PlansList.svelte -->
<!-- Grid view of all floor plans -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { onMount } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import PlanCard from './PlanCard.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { plansStore } from '../stores/plansStore';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';
  
  const logger = getLogger('PlansList');
  const dispatch = createEventDispatcher();
  import { permissions } from '$lib/stores/permissions';
  
  export let plans = [];
  $: isAdmin = $permissions.isAdmin;
  
  let elementCounts = {};
  let totalElementCounts = {};
  let loading = true;
  
  onMount(async () => {
    await loadElementCounts();
    loading = false;
  });
  
  async function loadElementCounts() {
    logger('Loading element counts for all plans');
    
    // Initialize total counts
    totalElementCounts = {};
    
    for (const plan of plans) {
      try {
        const elements = await plansStore.loadElements(plan.id);
        
        // Count elements by type for this plan
        const counts = elements.reduce((acc, element) => {
          acc[element.element_type] = (acc[element.element_type] || 0) + 1;
          return acc;
        }, {});
        
        elementCounts[plan.id] = counts;
        
        // Add to total counts
        Object.keys(counts).forEach(type => {
          totalElementCounts[type] = (totalElementCounts[type] || 0) + counts[type];
        });
        
      } catch (error) {
        logger('❌ Error loading elements for plan:', plan.id, error);
        elementCounts[plan.id] = {};
      }
    }
    
    // Trigger reactivity
    elementCounts = { ...elementCounts };
    totalElementCounts = { ...totalElementCounts };
  }
  
  function handleViewPlan(event) {
    dispatch('selectPlan', { planId: event.detail.planId });
  }

  function handleViewBuilding() {
    dispatch('selectPlan', { isBuildingOverview: true });
  }
  
  // FIX #3: Sort plans in standard order: Overview, L, U, G, 1-7
  $: sortedPlans = [...plans].sort((a, b) => {
    const order = { 'L': 0, 'U': 1, 'G': 2, '1': 3, '2': 4, '3': 5, '4': 6, '5': 7, '6': 8, '7': 9 };
    return (order[a.floor_level] ?? 999) - (order[b.floor_level] ?? 999);
  });
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
      
      <!-- Building Overview Card (always first) - FIX #2: Added border -->
      <button
        class="card-info text-left hover:border-purple-500 transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/20 cursor-pointer relative overflow-hidden group border-2 border-purple-600/50"
        on:click={handleViewBuilding}
      >
        <!-- Gradient overlay for visual distinction -->
        <div class="absolute inset-0 bg-gradient-to-br from-purple-900/20 to-blue-900/20"></div>
        
        <div class="relative z-10">
          <!-- Header with icon -->
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="text-4xl">🏢</div>
              <div>
                <h3 class="text-lg font-bold">Building Overview</h3>
                <p class="text-sm text-gray-400">All Floors</p>
              </div>
            </div>
            <Icon name="arrow-right" size={5} className="text-purple-400 group-hover:translate-x-1 transition-transform" />
          </div>

          <!-- Stats -->
          <div class="space-y-2 mb-4">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">Total Elements</span>
              <span class="font-bold text-lg">
                {Object.values(totalElementCounts).reduce((sum, count) => sum + count, 0)}
              </span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">Floors</span>
              <span class="font-semibold">{plans.length}</span>
            </div>
          </div>

          <!-- Element type badges -->
          {#if Object.keys(totalElementCounts).length > 0}
            <div class="flex flex-wrap gap-2">
              {#each ELEMENT_TYPE_OPTIONS as type}
                {#if totalElementCounts[type.value] > 0}
                  <div
                    class="px-2 py-1 rounded text-xs flex items-center gap-1.5 font-medium"
                    style="background-color: {type.color}20; border: 1px solid {type.color}40; color: {type.color};"
                  >
                    <span>{type.icon}</span>
                    <span>{totalElementCounts[type.value]}</span>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}

          <!-- View all elements text -->
          <div class="mt-4 pt-4 border-t border-slate-700">
            <p class="text-xs text-gray-400 group-hover:text-purple-400 transition-colors">
              View all elements across all floors →
            </p>
          </div>
        </div>
      </button>

      <!-- Individual Floor Plans - FIX #3: Now sorted in standard order -->
      {#each sortedPlans as plan (plan.id)}
        <PlanCard
          {plan}
          elementCounts={elementCounts[plan.id] || {}}
          on:view={handleViewPlan}
        />
      {/each}
    </div>
  {/if}
</div>
