<!-- src/lib/apps/plans/components/ElementTypeFilter.svelte -->
<!-- Reusable element-type checkbox list with sub-filters.
     Used by both PlanFilters (sidebar) and PlansReport (modal).
     
     Props:
       elementCounts  — { [type]: number } — shown as badges (optional, defaults to {})
       initialFilters — pre-populate from current viewer filters (optional)
     
     Events:
       change — { types, lightFilters, communalFilters, apartmentFilters, fireFilters }
-->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import {
    ELEMENT_TYPE_OPTIONS,
    ELEMENT_SUBTYPES,
    BATTERY_OPTIONS,
    SECURITY_OPTIONS
  } from '$lib/utils/planConstants';

  const dispatch = createEventDispatcher();

  export let elementCounts  = {};
  export let initialFilters = null;  // carry filters in from PlanViewer

  let selectedTypes    = [];

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

  // Initialise from passed-in filters (e.g. current PlanViewer state)
  onMount(() => {
    if (initialFilters) {
      selectedTypes    = initialFilters.types        ?? [];
      lightSubtypes    = initialFilters.lightFilters?.subtypes       ?? [];
      lightBattery     = initialFilters.lightFilters?.battery        ?? [];
      lightEmergency   = initialFilters.lightFilters?.emergency      ?? false;
      lightMovement    = initialFilters.lightFilters?.movementSensor ?? false;
      lightLightSensor = initialFilters.lightFilters?.lightSensor    ?? false;
      communalSubtypes = initialFilters.communalFilters?.subtypes    ?? [];
      communalSecurity = initialFilters.communalFilters?.security    ?? [];
      communalRetained = initialFilters.communalFilters?.retained    ?? false;
      fireSubtypes     = initialFilters.fireFilters?.subtypes        ?? [];
    }
  });

  // Emit change whenever any filter value changes
  $: dispatch('change', {
    types: selectedTypes,
    lightFilters: {
      subtypes:       lightSubtypes,
      battery:        lightBattery,
      emergency:      lightEmergency,
      movementSensor: lightMovement,
      lightSensor:    lightLightSensor
    },
    communalFilters: {
      subtypes:  communalSubtypes,
      security:  communalSecurity,
      retained:  communalRetained
    },
    apartmentFilters: {},
    fireFilters: { subtypes: fireSubtypes }
  });

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

  export function clearAll() {
    selectedTypes = [];
    clearLightFilters();
    clearCommunalFilters();
    fireSubtypes = [];
  }
</script>

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
        {#if elementCounts[type.value] !== undefined}
          <Badge variant="info" outline>{elementCounts[type.value] || 0}</Badge>
        {/if}
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
