<!-- src/lib/apps/plans/components/PlansList.svelte -->
<!-- Plans list grid with Building Overview card -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { getFloorLevelLabel } from '$lib/utils/planConstants';

  const dispatch = createEventDispatcher();

  export let plans;

  // Group plans by building
  $: buildingGroups = plans.reduce((acc, plan) => {
    const building = plan.building || 'Unknown';
    if (!acc[building]) acc[building] = [];
    acc[building].push(plan);
    return acc;
  }, {});

  // Sort plans within each building by floor level
  $: Object.keys(buildingGroups).forEach(building => {
    buildingGroups[building].sort((a, b) => {
      const order = { 'U': 0, 'L': 1, 'G': 2, '1': 3, '2': 4, '3': 5, '4': 6, '5': 7, '6': 8, '7': 9 };
      return (order[a.floor_level] || 999) - (order[b.floor_level] || 999);
    });
  });

  function handleBuildingOverviewClick() {
    dispatch('selectPlan', { isBuildingOverview: true });
  }

  function handlePlanClick(planId) {
    dispatch('selectPlan', { planId });
  }
</script>

{#if plans.length === 0}
  <div class="text-center py-12">
    <Icon name="map" size={12} className="mx-auto mb-4 text-gray-600" />
    <p class="text-gray-400 mb-4">No floor plans available yet</p>
  </div>
{:else}
  {#each Object.entries(buildingGroups) as [building, buildingPlans]}
    <div class="mb-8">
      <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
        <Icon name="building" size={6} className="text-blue-400" />
        {building}
        <span class="text-sm text-gray-400 font-normal">({buildingPlans.length} floors)</span>
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <!-- Building Overview Card -->
        <button
          class="card-interactive text-left h-full group"
          on:click={handleBuildingOverviewClick}
        >
          <div class="flex flex-col h-full">
            <!-- Icon Header -->
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center">
                  <Icon name="building" size={5} className="text-purple-400" />
                </div>
                <div>
                  <h3 class="font-semibold text-sm text-white group-hover:text-purple-300 transition-colors">
                    Building Overview
                  </h3>
                  <p class="text-xs text-gray-400">All Floors</p>
                </div>
              </div>
              <Icon name="arrow-right" size={4} className="text-gray-600 group-hover:text-purple-400 transition-colors" />
            </div>

            <!-- Stats -->
            <div class="mt-auto pt-2 border-t border-slate-700">
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-400">Total Elements</span>
                <span class="font-semibold text-purple-300">
                  {buildingPlans.reduce((sum, p) => sum + (p.element_count || 0), 0)}
                </span>
              </div>
              <div class="flex items-center justify-between text-xs mt-1">
                <span class="text-gray-400">Floors</span>
                <span class="font-semibold text-white">{buildingPlans.length}</span>
              </div>
            </div>
          </div>
        </button>

        <!-- Individual Floor Cards -->
        {#each buildingPlans as plan (plan.id)}
          <button
            class="card-interactive text-left h-full group"
            on:click={() => handlePlanClick(plan.id)}
          >
            <div class="flex flex-col h-full">
              <!-- Floor Preview Image -->
              {#if plan.image_url}
                <div class="mb-2 rounded-lg overflow-hidden bg-slate-900 border border-slate-700">
                  <img
                    src={plan.image_url}
                    alt={plan.name}
                    class="w-full h-20 object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              {:else}
                <div class="mb-2 rounded-lg bg-slate-900 border border-slate-700 h-20 flex items-center justify-center">
                  <Icon name="map" size={6} className="text-gray-700" />
                </div>
              {/if}

              <!-- Plan Info -->
              <div class="flex-1">
                <div class="flex items-center justify-between mb-1">
                  <h3 class="font-semibold text-sm text-white group-hover:text-purple-300 transition-colors">
                    {getFloorLevelLabel(String(plan.floor_level))}
                  </h3>
                  <Icon name="arrow-right" size={4} className="text-gray-600 group-hover:text-purple-400 transition-colors" />
                </div>
                <p class="text-xs text-gray-400 line-clamp-1">
                  {plan.name}
                </p>
                {#if plan.description}
                  <p class="text-xs text-gray-500 mt-0.5 line-clamp-1">
                    {plan.description}
                  </p>
                {/if}
              </div>

              <!-- Stats -->
              <div class="mt-auto pt-2 border-t border-slate-700">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-gray-400">Elements</span>
                  <span class="font-semibold text-white">{plan.element_count || 0}</span>
                </div>
              </div>
            </div>
          </button>
        {/each}
      </div>
    </div>
  {/each}
{/if}

<style>
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
