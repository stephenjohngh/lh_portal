<!-- src/lib/apps/issues/components/IssueFilters.svelte -->
<script>
  import { STATUS_FILTERS } from '$lib/utils/constants';
  
  export let searchTerm = '';
  export let statusFilter = 'current';
  export let resultCount = 0;
</script>

<div class="space-y-3">
  <!-- Search and Filter Row -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div class="md:col-span-2">
      <input
        type="text"
        bind:value={searchTerm}
        placeholder="Search issues..."
        class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
    </div>
    <select
      bind:value={statusFilter}
      class="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
    >
      {#each STATUS_FILTERS as filter}
        <option value={filter.value}>{filter.label}</option>
      {/each}
    </select>
  </div>

  <!-- Results Count with optional slot for Expand All button -->
  <div class="flex justify-between items-center">
    <div class="text-sm text-gray-400">
      {resultCount} {resultCount === 1 ? 'issue' : 'issues'} found
      <span class="text-gray-500">
        ({STATUS_FILTERS.find(f => f.value === statusFilter)?.label || 'current'})
      </span>
    </div>
    <slot name="actions" />
  </div>
</div>
