<!-- src/lib/apps/admin/components/UserFilters.svelte -->
<script>
  import Icon from '$lib/components/icons/Icon.svelte';
  
  export let searchTerm = '';
  export let resultCount = 0;
</script>

<div class="mb-6">
  <!-- Search Bar -->
  <div class="relative">
    <input
      type="search"
      name="user-search-filter"
      id="user-search-filter-input"
      bind:value={searchTerm}
      placeholder="Search users by name or email..."
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      data-lpignore="true"
      data-form-type="other"
      data-1p-ignore="true"
      class="input-search"
    />
    <Icon 
      name="search" 
      size={5} 
      className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
    />
  </div>

  <!-- Results Count -->
  <div class="mt-2 text-muted-sm">
    {resultCount} {resultCount === 1 ? 'user' : 'users'} found
  </div>
</div>
