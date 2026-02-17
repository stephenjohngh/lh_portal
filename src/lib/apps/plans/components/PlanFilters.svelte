<!-- src/lib/apps/plans/components/PlanFilters.svelte -->
<!-- Filter sidebar for floor plan elements -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';
  import { ELEMENT_TYPE_OPTIONS, ELEMENT_STATUS_OPTIONS } from '$lib/utils/planConstants';
  
  const dispatch = createEventDispatcher();
  
  export let elements = [];
  export let elementCounts = {};
  
  let selectedTypes = [];
  let selectedStatuses = [];
  let searchText = '';
  
  $: hasFilters = selectedTypes.length > 0 || selectedStatuses.length > 0 || searchText.length > 0;
  
  // Emit filter changes
  $: {
    dispatch('change', {
      types: selectedTypes,
      statuses: selectedStatuses,
      searchText
    });
  }
  
  function toggleType(type) {
    if (selectedTypes.includes(type)) {
      selectedTypes = selectedTypes.filter(t => t !== type);
    } else {
      selectedTypes = [...selectedTypes, type];
    }
  }
  
  function toggleStatus(status) {
    if (selectedStatuses.includes(status)) {
      selectedStatuses = selectedStatuses.filter(s => s !== status);
    } else {
      selectedStatuses = [...selectedStatuses, status];
    }
  }
  
  function clearFilters() {
    selectedTypes = [];
    selectedStatuses = [];
    searchText = '';
  }
</script>

<div class="bg-slate-800/50 rounded-lg p-4 sticky top-24">
  <div class="flex items-center justify-between mb-4">
    <h3 class="font-semibold flex items-center gap-2">
      <Icon name="filter" size={5} className="text-purple-400" />
      <span>Filters</span>
    </h3>
    {#if hasFilters}
      <Button
        variant="secondary"
        size="small"
        on:click={clearFilters}
      >
        Clear
      </Button>
    {/if}
  </div>
  
  <!-- Search -->
  <div class="mb-4">
    <label for="search" class="block text-sm font-medium mb-2">Search</label>
    <input
      id="search"
      type="text"
      bind:value={searchText}
      placeholder="Name or ID..."
      class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
    />
  </div>
  
  <!-- Element Types -->
  <div class="mb-4">
    <h4 class="text-sm font-semibold mb-2">Element Type</h4>
    <div class="space-y-2">
      {#each ELEMENT_TYPE_OPTIONS as type}
        <label class="flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 p-2 rounded">
          <input
            type="checkbox"
            checked={selectedTypes.includes(type.value)}
            on:change={() => toggleType(type.value)}
            class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
          />
          <span class="text-lg">{type.icon}</span>
          <span class="flex-1 text-sm">{type.label}</span>
          <Badge variant="info" outline>
            {elementCounts[type.value] || 0}
          </Badge>
        </label>
      {/each}
    </div>
  </div>
  
  <!-- Status -->
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
          <div 
            class="w-3 h-3 rounded-full"
            style="background-color: {status.color}"
          />
          <span class="flex-1 text-sm capitalize">{status.label}</span>
        </label>
      {/each}
    </div>
  </div>
  
  <!-- Legend -->
  <div class="border-t border-slate-700 pt-4">
    <h4 class="text-sm font-semibold mb-2">Legend</h4>
    <div class="space-y-1 text-xs text-gray-400">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-orange-600"></div>
        <span>Orange = Doors</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-yellow-600"></div>
        <span>Yellow = Lights</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-blue-600"></div>
        <span>Blue = Sensors</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-green-600"></div>
        <span>Green = Outlets</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-purple-600"></div>
        <span>Purple = Other</span>
      </div>
    </div>
  </div>
</div>
