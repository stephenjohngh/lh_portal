<!-- src/lib/apps/plans/components/PlanFilters.svelte -->
<!-- Filter sidebar for floor plan elements -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { ELEMENT_STATUS_OPTIONS } from '$lib/utils/planConstants';
  import ElementTypeFilter from './ElementTypeFilter.svelte';

  const dispatch = createEventDispatcher();

  export const elements    = [];  // read-only external reference — not mutated internally
  export let elementCounts = {};

  let selectedStatuses = [];
  let searchText       = '';
  let typeFilters      = {};      // last value emitted by ElementTypeFilter
  let typeFilterRef;              // component ref for clearAll()

  $: hasFilters =
    (typeFilters.types?.length > 0) || selectedStatuses.length > 0 || searchText.length > 0 ||
    (typeFilters.lightFilters?.subtypes?.length    > 0) ||
    (typeFilters.lightFilters?.battery?.length     > 0) ||
    typeFilters.lightFilters?.emergency || typeFilters.lightFilters?.movementSensor ||
    typeFilters.lightFilters?.lightSensor ||
    (typeFilters.communalFilters?.subtypes?.length > 0) ||
    (typeFilters.communalFilters?.security?.length > 0) ||
    typeFilters.communalFilters?.retained ||
    (typeFilters.fireFilters?.subtypes?.length     > 0);

  function handleTypeChange(event) {
    typeFilters = event.detail;
    dispatch('change', { ...typeFilters, statuses: selectedStatuses, searchText });
  }

  function toggleStatus(status) {
    selectedStatuses = selectedStatuses.includes(status)
      ? selectedStatuses.filter(s => s !== status)
      : [...selectedStatuses, status];
    dispatch('change', { ...typeFilters, statuses: selectedStatuses, searchText });
  }

  function clearFilters() {
    selectedStatuses = [];
    searchText       = '';
    typeFilterRef?.clearAll();
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

  <!-- Element Type (shared component) -->
  <div class="mb-4">
    <h4 class="text-sm font-semibold mb-2">Element Type</h4>
    <ElementTypeFilter
      bind:this={typeFilterRef}
      {elementCounts}
      on:change={handleTypeChange}
    />
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
        { color: 'bg-orange-800',  shape: 'rounded-sm',   label: 'Brown — Communal Doors' },
        { color: 'bg-purple-500',  shape: 'rounded-sm',   label: 'Purple — Apartment Doors' },
        { color: 'bg-yellow-500',  shape: 'rounded-full', label: 'Yellow — Lights' },
        { color: 'bg-red-500',     shape: 'rounded-sm',   label: 'Red — Fire Control' }
      ] as item}
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 {item.color} {item.shape}"></div>
          <span>{item.label}</span>
        </div>
      {/each}
    </div>
  </div>
</div>
