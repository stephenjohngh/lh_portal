<!-- src/lib/apps/users/UserListApp.svelte -->
<!-- REFACTORED: Now uses API client, auth utilities, validation, and date formatters -->
<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { auth } from '$lib/stores/auth';
  import { api } from '$lib/utils/api';
  import { isAdmin as checkIsAdmin } from '$lib/utils/auth';
  import { isValidEmail, isRequired } from '$lib/utils/validation';
  import { formatDateTimeFull } from '$lib/utils/dates';

  let users = [];
  let loading = true;
  let error = '';
  let searchTerm = '';
  let isAdmin = false;
  let showCreateModal = false;
  
  // New user form
  let newUserEmail = '';
  let newUserPassword = '';
  let newUserFullName = '';
  let createError = '';
  let creating = false;

  // Check if current user is admin
  // ✨ REFACTORED: Using auth utility
  async function checkAdminStatus() {
    if (!$auth.user) return;
    isAdmin = await checkIsAdmin($auth.user.id);
  }

  // Fetch users from database
  // ✨ REFACTORED: Using API client
  async function fetchUsers() {
    console.log('🔄 fetchUsers() called');
    console.log('Time:', new Date().toISOString());
    
    loading = true;
    error = '';
    
    try {
      console.log('📡 Querying profiles table...');
      
      users = await api.get('profiles', {
        orderBy: 'created_at',
        ascending: false
      });

      console.log('✅ Users set to:', users.length, 'records');
      console.log('User emails:', users.map(u => u.email));
      
    } catch (err) {
      error = err.message;
      console.error('❌ Exception in fetchUsers:', err);
      console.error('Error details:', err);
    } finally {
      loading = false;
      console.log('Loading state set to false');
      console.log('Final users array length:', users.length);
    }
  }

  // Filter users based on search
  $: filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Load users when component mounts
  onMount(() => {
    checkAdminStatus();
    fetchUsers();
  });

  // Create new user (admin only)
  // ✨ REFACTORED: Added validation
  async function createUser() {
    if (!isAdmin) return;
    
    creating = true;
    createError = '';
    
    // Validate email
    if (!isRequired(newUserEmail)) {
      createError = 'Email is required';
      creating = false;
      return;
    }
    
    if (!isValidEmail(newUserEmail)) {
      createError = 'Invalid email format';
      creating = false;
      return;
    }
    
    // Validate password
    if (!isRequired(newUserPassword)) {
      createError = 'Password is required';
      creating = false;
      return;
    }
    
    if (newUserPassword.length < 8) {
      createError = 'Password must be at least 8 characters';
      creating = false;
      return;
    }
    
    // Validate full name
    if (!isRequired(newUserFullName)) {
      createError = 'Full name is required';
      creating = false;
      return;
    }
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        createError = 'Not authenticated';
        return;
      }

      console.log('Creating user, requesting user ID:', user.id);

      // Call server endpoint to create user
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          full_name: newUserFullName,
          requesting_user_id: user.id  // ← ADD THIS!
        })
      });

      const result = await response.json();

      if (!response.ok) {
        createError = result.error || 'Failed to create user';
        console.error('Server error:', result);
        return;
      }

      console.log('✅ User created successfully:', result);

      // Success! Reset form and refresh list
      newUserEmail = '';
      newUserPassword = '';
      newUserFullName = '';
      showCreateModal = false;
      
      // Wait a moment then refresh to ensure database has written
      setTimeout(async () => {
        await fetchUsers();
      }, 500);
      
    } catch (err) {
      createError = err.message;
      console.error('Create user error:', err);
    } finally {
      creating = false;
    }
  }

  // Load users when component mounts
  onMount(() => {
    checkAdminStatus();
    fetchUsers();
  });

  // ✨ REFACTORED: Removed local formatDate function - using utility instead
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
    <div class="flex space-x-2">
      {#if isAdmin}
        <button
          on:click={() => showCreateModal = true}
          class="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          <span>Create User</span>
        </button>
      {/if}
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
              <span class="truncate">Joined: {formatDateTimeFull(user.created_at)}</span>
            </div>

            {#if user.updated_at && user.updated_at !== user.created_at}
              <div class="flex items-center space-x-2 text-gray-400">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                <span class="truncate">Updated: {formatDateTimeFull(user.updated_at)}</span>
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

<!-- Create User Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
    <div class="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700">
      <h3 class="text-2xl font-bold mb-4">Create New User</h3>
      
      <div class="space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium mb-2">Email</label>
          <input
            id="email"
            type="email"
            bind:value={newUserEmail}
            class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="user@example.com"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium mb-2">Password</label>
          <input
            id="password"
            type="password"
            bind:value={newUserPassword}
            class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label for="fullName" class="block text-sm font-medium mb-2">Full Name (optional)</label>
          <input
            id="fullName"
            type="text"
            bind:value={newUserFullName}
            class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="John Smith"
          />
        </div>

        {#if createError}
          <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
            <p class="text-red-400 text-sm">{createError}</p>
          </div>
        {/if}

        <div class="flex space-x-3 pt-2">
          <button
            on:click={createUser}
            disabled={creating || !newUserEmail || !newUserPassword}
            class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed rounded-lg transition-colors font-semibold"
          >
            {creating ? 'Creating...' : 'Create User'}
          </button>
          <button
            on:click={() => {
              showCreateModal = false;
              newUserEmail = '';
              newUserPassword = '';
              newUserFullName = '';
              createError = '';
            }}
            disabled={creating}
            class="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
