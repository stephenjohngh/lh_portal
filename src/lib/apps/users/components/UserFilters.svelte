<!-- src/lib/apps/users/components/UserFilters.svelte -->
<script>
  import Icon from '$lib/components/icons/Icon.svelte';
  
  export let searchTerm = '';
  export let resultCount = 0;
</script>

<div class="mb-6">
  <!-- Search Bar -->
  <div class="relative">
    <input
      type="text"
      bind:value={searchTerm}
      placeholder="Search users by name or email..."
      class="w-full px-4 py-3 pl-12 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
    />
    <Icon 
      name="search" 
      size={5} 
      className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
    />
  </div>

  <!-- Results Count -->
  <div class="mt-2 text-sm text-gray-400">
    {resultCount} {resultCount === 1 ? 'user' : 'users'} found
  </div>
</div>
