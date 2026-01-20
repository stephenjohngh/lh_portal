<!-- src/lib/components/UserListApp.svelte -->
<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';

  let users = [];
  let loading = true;
  let error = '';
  let searchTerm = '';

  // Fetch users from database
  async function fetchUsers() {
    loading = true;
    error = '';
    
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      
      users = data || [];
    } catch (err) {
      error = err.message;
      console.error('Error fetching users:', err);
    } finally {
      loading = false;
    }
  }

  // Filter users based on search
  $: filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Load users when component mounts
  onMount(() => {
    fetchUsers();
  });

  // Format date
  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
  <!-- Header -->
  <div class="mb-6">
    <h2 class="text-3xl font-bold mb-2">User Management</h2>
    <p class="text-gray-400">View all registered users in the system</p>
  </div>

  <!-- Search Bar -->
  <div class="mb-6">
    <div class="relative">
      <input
        type="text"
        bind:value={searchTerm}
        placeholder="Search by name or email..."
        class="w-full px-4 py-3 pl-10 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      <svg class="w-5 h-5 text-gray-400 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
    </div>
  </div>

  <!-- Refresh Button -->
  <div class="mb-4 flex justify-between items-center">
    <div class="text-sm text-gray-400">
      {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'} found
    </div>
    <button
      on:click={fetchUsers}
      disabled={loading}
      class="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg transition-colors"
    >
      <svg class="w-5 h-5 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      <span>{loading ? 'Loading...' : 'Refresh'}</span>
    </button>
  </div>

  <!-- Error Message -->
  {#if error}
    <div class="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
      <p class="text-red-400">Error: {error}</p>
    </div>
  {/if}

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
    </div>
  
  <!-- Empty State -->
  {:else if filteredUsers.length === 0}
    <div class="text-center py-12">
      <svg class="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
      </svg>
      <p class="text-gray-400">
        {searchTerm ? 'No users found matching your search' : 'No users found'}
      </p>
    </div>

  <!-- User Cards -->
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each filteredUsers as user}
        <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600 hover:border-purple-500 transition-colors">
          <!-- User Avatar -->
          <div class="flex items-start space-x-3 mb-3">
            <div class="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span class="text-xl font-bold text-white">
                {user.full_name ? user.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-white truncate">
                {user.full_name || 'No name'}
              </h3>
              <p class="text-sm text-gray-400 truncate">{user.email}</p>
            </div>
          </div>

          <!-- User Details -->
          <div class="space-y-2 text-sm">
            <div class="flex items-center space-x-2 text-gray-400">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
              <span class="truncate">ID: {user.id.substring(0, 8)}...</span>
            </div>
            
            <div class="flex items-center space-x-2 text-gray-400">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span class="truncate">Joined: {formatDate(user.created_at)}</span>
            </div>

            {#if user.updated_at && user.updated_at !== user.created_at}
              <div class="flex items-center space-x-2 text-gray-400">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                <span class="truncate">Updated: {formatDate(user.updated_at)}</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Stats Footer -->
  {#if !loading && users.length > 0}
    <div class="mt-6 pt-4 border-t border-slate-700">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-purple-400">{users.length}</div>
          <div class="text-sm text-gray-400">Total Users</div>
        </div>
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-blue-400">
            {users.filter(u => u.full_name).length}
          </div>
          <div class="text-sm text-gray-400">With Names</div>
        </div>
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-green-400">
            {users.filter(u => {
              const created = new Date(u.created_at);
              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 7);
              return created > weekAgo;
            }).length}
          </div>
          <div class="text-sm text-gray-400">New This Week</div>
        </div>
      </div>
    </div>
  {/if}
</div>