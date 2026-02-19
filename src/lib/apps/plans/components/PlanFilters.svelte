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

  export let elements     = [];   // was incorrectly `const` — now `let` so parent can update
  export let elementCounts = {};

  let selectedTypes    = [];
  let selectedStatuses = [];
  let searchText       = '';

  // Light sub-filters
  let lightSubtypes    = [];
  let lightBattery     = [];
  let lightEmergency   = false;
  let lightMovement    = false;
  let lightLightSensor = false;

  // Communal door sub-filters
  let communalSubtypes = [];
  let communalSecurity = [];
  let communalRetained = false;

  // Fire control sub-filters
  let fireSubtypes = [];

  $: hasFilters =
    selectedTypes.length > 0    || selectedStatuses.length > 0 || searchText.length > 0 ||
    lightSubtypes.length > 0    || lightBattery.length > 0     ||
    lightEmergency               || lightMovement               || lightLightSensor ||
    communalSubtypes.length > 0 || communalSecurity.length > 0 || communalRetained ||
    fireSubtypes.length > 0;

  $: {
    dispatch('change', {
      types:        selectedTypes,
      statuses:     selectedStatuses,
      searchText,
      lightFilters: {
        subtypes:      lightSubtypes,
        battery:       lightBattery,
        emergency:     lightEmergency,
        movementSensor:lightMovement,
        lightSensor:   lightLightSensor
      },
      communalFilters: {
        subtypes:  communalSubtypes,
        security:  communalSecurity,
        retained:  communalRetained
      },
      apartmentFilters: {},
      fireFilters: { subtypes: fireSubtypes }
    });
  }

  function toggleType(type) {
    if (selectedTypes.includes(type)) {
      selectedTypes = selectedTypes.filter(t => t !== type);
      if (type === 'light')         clearLightFilters();
      if (type === 'communal_door') clearCommunalFilters();
      if (type === 'fire_control')  fireSubtypes = [];
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

  function clearLightFilters() {
    lightSubtypes = []; lightBattery = [];
    lightEmergency = false; lightMovement = false; lightLightSensor = false;
  }

  function clearCommunalFilters() {
    communalSubtypes = []; communalSecurity = []; communalRetained = false;
  }

  function clearFilters() {
    selectedTypes    = [];
    selectedStatuses = [];
    searchText       = '';
    clearLightFilters();
    clearCommunalFilters();
    fireSubtypes = [];
  }
</script>

<div class="bg-slate-800/50 rounded-lg p-4 sticky top-24">
  <!-- Header -->
  <div class="flex items-center justify-between mb-4">
    <h3 class="font-semibold flex items-center gap-2">
      <Icon name="filter" size={5} className="text-purple-400" />
      <span>Filters</span>
    </h3>
    {#if hasFilters}
      <Button variant="secondary" size="small" on:click={clearFilters}>Clear</Button>
    {/if}
  </div>

  <!-- Search -->
  <div class="mb-4">
    <label for="filter-search" class="block text-sm font-medium mb-2">Search</label>
    <input
      id="filter-search"
      type="text"
      bind:value={searchText}
      placeholder="Name or ID..."
      class="input"
    />
  </div>

  <!-- Element Type -->
  <div class="mb-4">
    <h4 class="text-sm font-semibold mb-2">Element Type</h4>
    <div class="space-y-1">
      {#each ELEMENT_TYPE_OPTIONS as type}
        {@const isSelected = selectedTypes.includes(type.value)}
        <div>
          <label class="flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 p-2 rounded">
            <input
              type="checkbox"
              checked={isSelected}
              on:change={() => toggleType(type.value)}
              class="checkbox"
            />
            <span class="flex-1 text-sm">{type.label}</span>
            <Badge variant="info" outline>{elementCounts[type.value] || 0}</Badge>
          </label>

          <!-- Light sub-filters -->
          {#if type.value === 'light' && isSelected}
            <div class="filter-subpanel border-yellow-500/30">
              <div>
                <p class="filter-subpanel-label">Subtype</p>
                <div class="flex flex-wrap gap-x-3 gap-y-1">
                  {#each ELEMENT_SUBTYPES.light as sub}
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={lightSubtypes.includes(sub)}
                        on:change={() => lightSubtypes = toggleArr(lightSubtypes, sub)}
                        class="checkbox-sm" />
                      <span class="text-xs">{sub}</span>
                    </label>
                  {/each}
                </div>
              </div>
              <div>
                <p class="filter-subpanel-label">Battery</p>
                <div class="space-y-1">
                  {#each BATTERY_OPTIONS as opt}
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={lightBattery.includes(opt.value)}
                        on:change={() => lightBattery = toggleArr(lightBattery, opt.value)}
                        class="checkbox-sm" />
                      <span class="text-xs">{opt.label}</span>
                    </label>
                  {/each}
                </div>
              </div>
              <div class="space-y-1">
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" bind:checked={lightEmergency} class="checkbox-sm" />
                  <span class="text-xs">Emergency</span>
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" bind:checked={lightMovement} class="checkbox-sm" />
                  <span class="text-xs">Movement Sensor</span>
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" bind:checked={lightLightSensor} class="checkbox-sm" />
                  <span class="text-xs">Light Sensor</span>
                </label>
              </div>
            </div>
          {/if}

          <!-- Communal Door sub-filters -->
          {#if type.value === 'communal_door' && isSelected}
            <div class="filter-subpanel border-orange-500/30">
              <div>
                <p class="filter-subpanel-label">Subtype</p>
                <div class="flex flex-wrap gap-x-3 gap-y-1">
                  {#each ELEMENT_SUBTYPES.communal_door as sub}
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={communalSubtypes.includes(sub)}
                        on:change={() => communalSubtypes = toggleArr(communalSubtypes, sub)}
                        class="checkbox-sm" />
                      <span class="text-xs">{sub}</span>
                    </label>
                  {/each}
                </div>
              </div>
              <div>
                <p class="filter-subpanel-label">Security</p>
                <div class="space-y-1">
                  {#each SECURITY_OPTIONS as opt}
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={communalSecurity.includes(opt.value)}
                        on:change={() => communalSecurity = toggleArr(communalSecurity, opt.value)}
                        class="checkbox-sm" />
                      <span class="text-xs">{opt.label}</span>
                    </label>
                  {/each}
                </div>
              </div>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" bind:checked={communalRetained} class="checkbox-sm" />
                <span class="text-xs">Retained</span>
              </label>
            </div>
          {/if}

          <!-- Fire Control sub-filters -->
          {#if type.value === 'fire_control' && isSelected}
            <div class="filter-subpanel border-red-500/30">
              <div>
                <p class="filter-subpanel-label">Subtype</p>
                <div class="flex flex-wrap gap-x-3 gap-y-1">
                  {#each ELEMENT_SUBTYPES.fire_control as sub}
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={fireSubtypes.includes(sub)}
                        on:change={() => fireSubtypes = toggleArr(fireSubtypes, sub)}
                        class="checkbox-sm" />
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

  <!-- Status -->
  <div class="mb-4">
    <h4 class="text-sm font-semibold mb-2">Status</h4>
    <div class="space-y-1">
      {#each ELEMENT_STATUS_OPTIONS as status}
        <label class="flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 p-2 rounded">
          <input
            type="checkbox"
            checked={selectedStatuses.includes(status.value)}
            on:change={() => toggleStatus(status.value)}
            class="checkbox"
          />
          <span class="flex-1 text-sm">{status.label}</span>
        </label>
      {/each}
    </div>
  </div>

  <!-- Legend -->
  <div class="border-t border-slate-700 pt-4">
    <h4 class="text-sm font-semibold mb-2">Legend</h4>
    <div class="space-y-1 text-xs text-gray-400">
      {#each [
        { color: 'bg-orange-800',  shape: 'rounded-sm', label: 'Brown — Communal Doors' },
        { color: 'bg-purple-500',  shape: 'rounded-sm', label: 'Purple — Apartment Doors' },
        { color: 'bg-yellow-500',  shape: 'rounded-full', label: 'Yellow — Lights' },
        { color: 'bg-red-500',     shape: 'rounded-sm', label: 'Red — Fire Control' }
      ] as item}
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 {item.color} {item.shape}"></div>
          <span>{item.label}</span>
        </div>
      {/each}
    </div>
  </div>
</div>
