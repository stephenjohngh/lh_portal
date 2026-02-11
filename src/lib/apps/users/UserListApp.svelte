<!-- src/lib/apps/users/UserListApp.svelte -->
<!-- Updated to use ErrorDisplay and LoadingSpinner components -->
<script>
  import { onMount } from 'svelte';
  import { permissions } from '$lib/stores/permissions';
  import { auth } from '$lib/stores/auth';
  import { usersStore } from './stores/usersStore';
  import { isAdmin as checkIsAdmin } from '$lib/utils/auth';
  
  import UserFilters from './components/UserFilters.svelte';
  import UserCard from './components/UserCard.svelte';
  import UserStats from './components/UserStats.svelte';
  import CreateUserModal from './components/modals/CreateUserModal.svelte';
  import PasswordResetModal from './components/modals/PasswordResetModal.svelte';
  import ManageAppsModal from './components/modals/ManageAppsModal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';

  let searchTerm = '';
  let isAdmin = false;
  
  // DEBUG: Track searchTerm changes
  $: {
    if (searchTerm) {
      console.log('🔍 searchTerm changed to:', searchTerm);
      console.trace('Stack trace:');
    }
  }
  
  // Modal states
  let showCreateModal = false;
  let showPasswordResetModal = false;
  let showManageAppsModal = false;
  let selectedUser = null;

  // Subscribe to store
  $: ({ users, loading, error } = $usersStore);
  
  // Filtered users based on search
  $: filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  onMount(async () => {
    // Initialize permissions for 'users' app
    if ($auth.user) {
      await permissions.init($auth.user.id, 'users');
      isAdmin = await checkIsAdmin($auth.user.id);
    }
    
    // Fetch users
    await usersStore.fetchUsers();
  });

  function handlePasswordReset(event) {
    selectedUser = event.detail;
    showPasswordResetModal = true;
  }

  function handleManageApps(event) {
    selectedUser = event.detail;
    showManageAppsModal = true;
  }

  function handleCreateSuccess() {
    // User created successfully
    // Store automatically refreshes, modal handles its own close
    // Clear search to prevent bug and show new user
    searchTerm = '';
  }

  function handleCreateClose() {
    showCreateModal = false;
    // Clear search - CreateUser modal has email input that triggers autocomplete
    searchTerm = '';
  }

  function handlePasswordResetSuccess() {
    // Password reset successful
    // Clear search to prevent bug and give fresh view
    searchTerm = '';
  }

  function handlePasswordResetClose() {
    showPasswordResetModal = false;
    selectedUser = null;
    // Clear search - PasswordReset has user context that triggers autocomplete
    searchTerm = '';
  }

  function handleManageAppsClose() {
    showManageAppsModal = false;
    selectedUser = null;
    // No clear - ManageApps doesn't trigger autocomplete bug
  }
</script>

<div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
  <!-- Header -->
  <div class="flex justify-between items-start mb-6">
    <div>
      <h2 class="text-3xl font-bold mb-1">User Management</h2>
      <p class="text-gray-400">Manage user accounts and permissions</p>
    </div>
    {#if isAdmin}
      <Button
        variant="primary"
        size="large"
        icon="plus"
        on:click={() => showCreateModal = true}
      >
        Create User
      </Button>
    {/if}
  </div>

  <!-- Filters -->
  <UserFilters 
    bind:searchTerm 
    resultCount={filteredUsers.length}
  />

  <!-- Error Display -->
  <ErrorDisplay 
    message={error} 
    onDismiss={() => usersStore.clearError()}
  />

  <!-- Loading State -->
  {#if loading}
    <LoadingSpinner />

  <!-- Empty State -->
  {:else if filteredUsers.length === 0}
    <div class="text-center py-12 text-gray-400">
      {#if searchTerm}
        No users found matching "{searchTerm}". Try a different search.
      {:else}
        No users found.
      {/if}
    </div>

  <!-- Users Grid -->
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each filteredUsers as user (user.id)}
        <UserCard 
          {user}
          {isAdmin}
          on:resetPassword={handlePasswordReset}
          on:manageApps={handleManageApps}
        />
      {/each}
    </div>
  {/if}

  <!-- Statistics -->
  {#if !loading && users.length > 0}
    <UserStats {users} />
  {/if}
</div>

<!-- Modals -->
<CreateUserModal 
  bind:show={showCreateModal}
  on:success={handleCreateSuccess}
  on:close={handleCreateClose}
/>

<PasswordResetModal 
  bind:show={showPasswordResetModal}
  user={selectedUser}
  on:success={handlePasswordResetSuccess}
  on:close={handlePasswordResetClose}
/>

<ManageAppsModal 
  bind:show={showManageAppsModal}
  user={selectedUser}
  on:close={handleManageAppsClose}
/>
