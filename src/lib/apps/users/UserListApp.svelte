<!-- src/lib/apps/users/UserListApp.svelte -->
<!-- REFACTORED: Now uses common components (Button, FormInput, Modal) -->
<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { auth } from '$lib/stores/auth';
  import { api } from '$lib/utils/api';
  import { isAdmin as checkIsAdmin } from '$lib/utils/auth';
  import { isValidEmail, isRequired } from '$lib/utils/validation';
  import { formatDateTimeFull } from '$lib/utils/dates';
  import Button from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';

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
  
  // Form validation errors
  let emailError = '';
  let passwordError = '';

  // Check if current user is admin
  async function checkAdminStatus() {
    if (!$auth.user) return;
    isAdmin = await checkIsAdmin($auth.user.id);
  }

  // Fetch users from database
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

  // Validate form
  function validateForm() {
    emailError = '';
    passwordError = '';
    createError = '';
    
    // Validate email
    if (!isRequired(newUserEmail)) {
      emailError = 'Email is required';
      return false;
    }
    
    if (!isValidEmail(newUserEmail)) {
      emailError = 'Invalid email format';
      return false;
    }
    
    // Validate password
    if (!isRequired(newUserPassword)) {
      passwordError = 'Password is required';
      return false;
    }
    
    if (newUserPassword.length < 8) {
      passwordError = 'Password must be at least 8 characters';
      return false;
    }
    
    return true;
  }

  // Create new user (admin only)
  async function createUser() {
    if (!isAdmin) return;
    
    if (!validateForm()) return;
    
    creating = true;
    createError = '';
    
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
          requesting_user_id: user.id
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
      resetForm();
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

  function resetForm() {
    newUserEmail = '';
    newUserPassword = '';
    newUserFullName = '';
    emailError = '';
    passwordError = '';
    createError = '';
  }

  function handleCloseModal() {
    showCreateModal = false;
    resetForm();
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
      <Icon name="search" size={5} className="text-gray-400 absolute left-3 top-3.5" />
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="mb-4 flex justify-between items-center">
    <div class="text-sm text-gray-400">
      {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'} found
    </div>
    <div class="flex space-x-2">
      {#if isAdmin}
        <Button
          variant="green"
          size="large"
          icon="plus"
          on:click={() => showCreateModal = true}
        >
          Create User
        </Button>
      {/if}
      <Button
        variant="primary"
        size="large"
        icon="refresh"
        disabled={loading}
        loading={loading}
        on:click={fetchUsers}
      >
        {loading ? 'Loading...' : 'Refresh'}
      </Button>
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
      <Icon name="users" size={16} className="text-gray-600 mx-auto mb-4" />
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
              <Icon name="user" size={4} className="flex-shrink-0" />
              <span class="truncate">ID: {user.id.substring(0, 8)}...</span>
            </div>
            
            <div class="flex items-center space-x-2 text-gray-400">
              <Icon name="calendar" size={4} className="flex-shrink-0" />
              <span class="truncate">Joined: {formatDateTimeFull(user.created_at)}</span>
            </div>

            {#if user.updated_at && user.updated_at !== user.created_at}
              <div class="flex items-center space-x-2 text-gray-400">
                <Icon name="refresh" size={4} className="flex-shrink-0" />
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
<Modal 
  bind:show={showCreateModal}
  title="Create New User"
  size="small"
  on:close={handleCloseModal}
>
  <div class="space-y-4">
    <FormInput
      label="Email"
      type="email"
      bind:value={newUserEmail}
      placeholder="user@example.com"
      required={true}
      error={emailError}
      on:input={() => emailError = ''}
    />

    <FormInput
      label="Password"
      type="password"
      bind:value={newUserPassword}
      placeholder="••••••••"
      required={true}
      error={passwordError}
      helpText="Minimum 8 characters"
      on:input={() => passwordError = ''}
    />

    <FormInput
      label="Full Name"
      type="text"
      bind:value={newUserFullName}
      placeholder="John Smith"
      helpText="Optional"
    />

    {#if createError}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
        <p class="text-red-400 text-sm">{createError}</p>
      </div>
    {/if}
  </div>

  <div slot="footer" class="flex space-x-3">
    <Button
      variant="secondary"
      size="large"
      fullWidth={true}
      disabled={creating}
      on:click={handleCloseModal}
    >
      Cancel
    </Button>
    <Button
      variant="green"
      size="large"
      fullWidth={true}
      disabled={creating || !newUserEmail || !newUserPassword}
      loading={creating}
      on:click={createUser}
    >
      {creating ? 'Creating...' : 'Create User'}
    </Button>
  </div>
</Modal>
