<!-- src/lib/apps/plans/components/PlanFilters.svelte -->
<!-- Filter sidebar for floor plan elements -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { 
    ELEMENT_TYPE_OPTIONS, 
    ELEMENT_STATUS_OPTIONS,
    ELEMENT_SUBTYPES,
    BATTERY_OPTIONS,
    SECURITY_OPTIONS
  } from '$lib/utils/planConstants';
  
  const dispatch = createEventDispatcher();
  
  export const elements = [];
  export let elementCounts = {};
  
  let selectedTypes    = [];
  let selectedStatuses = [];
  let searchText       = '';

  // Light sub-filters
  let lightSubtypes       = [];
  let lightBattery        = [];
  let lightEmergency      = false;
  let lightMovement       = false;
  let lightLightSensor    = false;

  // Communal door sub-filters
  let communalSubtypes  = [];
  let communalSecurity  = [];
  let communalRetained  = false;

  // Apartment door has no sub-filters

  // Fire Control sub-filters
  let fireSubtypes = [];

  $: communalSelected   = selectedTypes.includes('communal_door');
  $: lightSelected      = selectedTypes.includes('light');
  $: fireSelected       = selectedTypes.includes('fire_control');

  $: hasFilters = selectedTypes.length > 0 || selectedStatuses.length > 0 || searchText.length > 0 ||
    lightSubtypes.length > 0 || lightBattery.length > 0 || lightEmergency || lightMovement || lightLightSensor ||
    communalSubtypes.length > 0 || communalSecurity.length > 0 || communalRetained ||
    fireSubtypes.length > 0;
  
  $: {
    dispatch('change', {
      types:       selectedTypes,
      statuses:    selectedStatuses,
      searchText,
      lightFilters:    { subtypes: lightSubtypes, battery: lightBattery, emergency: lightEmergency, movementSensor: lightMovement, lightSensor: lightLightSensor },
      communalFilters: { subtypes: communalSubtypes, security: communalSecurity, retained: communalRetained },
      apartmentFilters:{ },
      fireFilters:     { subtypes: fireSubtypes }
    });
  }
  
  function toggleType(type) {
    if (selectedTypes.includes(type)) {
      selectedTypes = selectedTypes.filter(t => t !== type);
      // Clear sub-filters for this type when deselected
      if (type === 'light')         { lightSubtypes = []; lightBattery = []; lightEmergency = false; lightMovement = false; lightLightSensor = false; }
      if (type === 'communal_door') { communalSubtypes = []; communalSecurity = []; communalRetained = false; }
      if (type === 'apartment_door'){ /* no sub-filters */ }
      if (type === 'fire_control')  { fireSubtypes = []; }
    } else {
      selectedTypes = [...selectedTypes, type];
    }
  }
  
  function toggleStatus(status) {
    selectedStatuses = selectedStatuses.includes(status)
      ? selectedStatuses.filter(s => s !== status)
      : [...selectedStatuses, status];
  }

  function toggleArr(arr, value) {
    return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
  }
  
  function clearFilters() {
    selectedTypes    = [];
    selectedStatuses = [];
    searchText       = '';
    lightSubtypes = []; lightBattery = []; lightEmergency = false; lightMovement = false; lightLightSensor = false;
    communalSubtypes  = []; communalSecurity  = []; communalRetained  = false;
    fireSubtypes  = [];
  }
</script>

<div class="bg-slate-800/50 rounded-lg p-4 sticky top-24">
  <div class="flex items-center justify-between mb-4">
    <h3 class="font-semibold flex items-center gap-2">
      <Icon name="filter" size={5} className="text-purple-400" />
      <span>Filters</span>
    </h3>
    {#if hasFilters}
      <Button variant="secondary" size="small" on:click={clearFilters}>Clear</Button>
    {/if}
  </div>
  
  <div class="mb-4">
    <label for="filter-search" class="block text-sm font-medium mb-2">Search</label>
    <input
      id="filter-search"
      type="text"
      bind:value={searchText}
      placeholder="Name or ID..."
      class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
    />
  </div>
  
  <div class="mb-4">
    <h4 class="text-sm font-semibold mb-2">Element Type</h4>
    <div class="space-y-1">
      {#each ELEMENT_TYPE_OPTIONS as type}
        {@const isSelected = selectedTypes.includes(type.value)}
        <div>
          <!-- Type checkbox row -->
          <label class="flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 p-2 rounded">
            <input
              type="checkbox"
              checked={isSelected}
              on:change={() => toggleType(type.value)}
              class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
            />
            <span class="flex-1 text-sm">{type.label}</span>
            <Badge variant="info" outline>{elementCounts[type.value] || 0}</Badge>
          </label>

          <!-- Light sub-filters -->
          {#if type.value === 'light' && isSelected}
            <div class="ml-6 mt-1 mb-2 pl-3 border-l-2 border-yellow-500/30 space-y-3">
              <div>
                <p class="text-xs text-gray-400 font-medium mb-1">Subtype</p>
                <div class="flex flex-wrap gap-x-3 gap-y-1">
                  {#each ELEMENT_SUBTYPES.light as sub}
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={lightSubtypes.includes(sub)}
                        on:change={() => lightSubtypes = toggleArr(lightSubtypes, sub)}
                        class="w-3.5 h-3.5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
                      <span class="text-xs">{sub}</span>
                    </label>
                  {/each}
                </div>
              </div>
              <div>
                <p class="text-xs text-gray-400 font-medium mb-1">Battery</p>
                <div class="space-y-1">
                  {#each BATTERY_OPTIONS as opt}
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={lightBattery.includes(opt.value)}
                        on:change={() => lightBattery = toggleArr(lightBattery, opt.value)}
                        class="w-3.5 h-3.5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
                      <span class="text-xs">{opt.label}</span>
                    </label>
                  {/each}
                </div>
              </div>
              <div class="space-y-1">
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" bind:checked={lightEmergency}
                    class="w-3.5 h-3.5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
                  <span class="text-xs">Emergency</span>
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" bind:checked={lightMovement}
                    class="w-3.5 h-3.5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
                  <span class="text-xs">Movement Sensor</span>
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" bind:checked={lightLightSensor}
                    class="w-3.5 h-3.5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
                  <span class="text-xs">Light Sensor</span>
                </label>
              </div>
            </div>
          {/if}

          <!-- Communal Door sub-filters -->
          {#if type.value === 'communal_door' && isSelected}
            <div class="ml-6 mt-1 mb-2 pl-3 border-l-2 border-orange-500/30 space-y-3">
              <div>
                <p class="text-xs text-gray-400 font-medium mb-1">Subtype</p>
                <div class="flex flex-wrap gap-x-3 gap-y-1">
                  {#each ELEMENT_SUBTYPES.communal_door as sub}
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={communalSubtypes.includes(sub)}
                        on:change={() => communalSubtypes = toggleArr(communalSubtypes, sub)}
                        class="w-3.5 h-3.5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
                      <span class="text-xs">{sub}</span>
                    </label>
                  {/each}
                </div>
              </div>
              <div>
                <p class="text-xs text-gray-400 font-medium mb-1">Security</p>
                <div class="space-y-1">
                  {#each SECURITY_OPTIONS as opt}
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={communalSecurity.includes(opt.value)}
                        on:change={() => communalSecurity = toggleArr(communalSecurity, opt.value)}
                        class="w-3.5 h-3.5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
                      <span class="text-xs">{opt.label}</span>
                    </label>
                  {/each}
                </div>
              </div>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" bind:checked={communalRetained}
                  class="w-3.5 h-3.5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
                <span class="text-xs">Retained</span>
              </label>
            </div>
          {/if}

          <!-- Fire Control sub-filters -->
          {#if type.value === 'fire_control' && isSelected}
            <div class="ml-6 mt-1 mb-2 pl-3 border-l-2 border-red-500/30 space-y-3">
              <div>
                <p class="text-xs text-gray-400 font-medium mb-1">Subtype</p>
                <div class="flex flex-wrap gap-x-3 gap-y-1">
                  {#each ELEMENT_SUBTYPES.fire_control as sub}
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={fireSubtypes.includes(sub)}
                        on:change={() => fireSubtypes = toggleArr(fireSubtypes, sub)}
                        class="w-3.5 h-3.5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
                      <span class="text-xs">{sub}</span>
                    </label>
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
  
  <div class="mb-4">
    <h4 class="text-sm font-semibold mb-2">Status</h4>
    <div class="space-y-2">
      {#each ELEMENT_STATUS_OPTIONS as status}
        <label class="flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 p-2 rounded">
          <input
            type="checkbox"
            checked={selectedStatuses.includes(status.value)}
            on:change={() => toggleStatus(status.value)}
            class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
          />
          <span class="flex-1 text-sm">{status.label}</span>
        </label>
      {/each}
    </div>
  </div>
  
  <div class="border-t border-slate-700 pt-4">
    <h4 class="text-sm font-semibold mb-2">Legend</h4>
    <div class="space-y-1 text-xs text-gray-400">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-sm bg-orange-800"></div>
        <span>Brown = Communal Doors</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-sm bg-purple-500"></div>
        <span>Purple = Apartment Doors</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
        <span>Yellow = Lights</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-sm bg-red-500"></div>
        <span>Red = Fire Control</span>
      </div>
    </div>
  </div>
</div>
