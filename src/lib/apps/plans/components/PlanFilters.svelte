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

  // Door sub-filters
  let doorSubtypes  = [];
  let doorSecurity  = [];
  let doorRetained  = false;

  // Fire Control sub-filters
  let fireSubtypes = [];

  $: lightSelected = selectedTypes.includes('light');
  $: doorSelected  = selectedTypes.includes('door');
  $: fireSelected  = selectedTypes.includes('fire_control');

  $: hasFilters = selectedTypes.length > 0 || selectedStatuses.length > 0 || searchText.length > 0 ||
    lightSubtypes.length > 0 || lightBattery.length > 0 || lightEmergency || lightMovement || lightLightSensor ||
    doorSubtypes.length > 0 || doorSecurity.length > 0 || doorRetained ||
    fireSubtypes.length > 0;
  
  $: {
    dispatch('change', {
      types:       selectedTypes,
      statuses:    selectedStatuses,
      searchText,
      lightFilters: { subtypes: lightSubtypes, battery: lightBattery, emergency: lightEmergency, movementSensor: lightMovement, lightSensor: lightLightSensor },
      doorFilters:  { subtypes: doorSubtypes,  security: doorSecurity, retained: doorRetained },
      fireFilters:  { subtypes: fireSubtypes }
    });
  }
  
  function toggleType(type) {
    if (selectedTypes.includes(type)) {
      selectedTypes = selectedTypes.filter(t => t !== type);
      // Clear sub-filters for this type when deselected
      if (type === 'light')        { lightSubtypes = []; lightBattery = []; lightEmergency = false; lightMovement = false; lightLightSensor = false; }
      if (type === 'door')         { doorSubtypes = []; doorSecurity = []; doorRetained = false; }
      if (type === 'fire_control') { fireSubtypes = []; }
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
    doorSubtypes  = []; doorSecurity  = []; doorRetained   = false;
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
            <span class="text-lg">{type.icon}</span>
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
                  <span class="text-xs">Emergency only</span>
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

          <!-- Door sub-filters -->
          {#if type.value === 'door' && isSelected}
            <div class="ml-6 mt-1 mb-2 pl-3 border-l-2 border-orange-500/30 space-y-3">
              <div>
                <p class="text-xs text-gray-400 font-medium mb-1">Subtype</p>
                <div class="flex flex-wrap gap-x-3 gap-y-1">
                  {#each ELEMENT_SUBTYPES.door as sub}
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={doorSubtypes.includes(sub)}
                        on:change={() => doorSubtypes = toggleArr(doorSubtypes, sub)}
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
                      <input type="checkbox" checked={doorSecurity.includes(opt.value)}
                        on:change={() => doorSecurity = toggleArr(doorSecurity, opt.value)}
                        class="w-3.5 h-3.5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
                      <span class="text-xs">{opt.label}</span>
                    </label>
                  {/each}
                </div>
              </div>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" bind:checked={doorRetained}
                  class="w-3.5 h-3.5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
                <span class="text-xs">Retained only</span>
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
          <div class="w-3 h-3 rounded-full" style="background-color: {status.color}"></div>
          <span class="flex-1 text-sm">{status.label}</span>
        </label>
      {/each}
    </div>
  </div>
  
  <div class="border-t border-slate-700 pt-4">
    <h4 class="text-sm font-semibold mb-2">Legend</h4>
    <div class="space-y-1 text-xs text-gray-400">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-orange-500"></div>
        <span>Orange = Doors</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
        <span>Yellow = Lights</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-red-500"></div>
        <span>Red = Fire Control</span>
      </div>
    </div>
  </div>
</div>
