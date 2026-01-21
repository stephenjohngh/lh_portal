<script>
  export let searchTerm = '';
  export let statusFilter = 'all';
  export let onRefresh = () => {};
  export let loading = false;
  export let resultCount = 0;
</script>

<div class="space-y-4">
  <!-- Search and Filter Row -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      <option value="all">All Issues</option>
      <option value="has-actions">With Actions</option>
      <option value="no-actions">No Actions</option>
    </select>
  </div>

  <!-- Results and Refresh -->
  <div class="flex justify-between items-center">
    <div class="text-sm text-gray-400">
      {resultCount} {resultCount === 1 ? 'issue' : 'issues'} found
    </div>
    <button
      on:click={onRefresh}
      disabled={loading}
      class="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg transition-colors"
    >
      <svg class="w-5 h-5 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      <span>{loading ? 'Loading...' : 'Refresh'}</span>
    </button>
  </div>
</div>

