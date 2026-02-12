<!-- src/lib/apps/users/UserListApp.svelte -->
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
  import DeleteUserModal from './components/modals/DeleteUserModal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';

  let searchTerm = '';
  let isAdmin = false;
  
  // Modal states
  let showCreateModal = false;
  let showPasswordResetModal = false;
  let showManageAppsModal = false;
  let showDeleteModal = false;
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

  function handleDeleteUser(event) {
    selectedUser = event.detail;
    showDeleteModal = true;
  }

  function handleCreateSuccess() {
    searchTerm = '';
  }

  function handleCreateClose() {
    showCreateModal = false;
    searchTerm = '';
  }

  function handlePasswordResetSuccess() {
    searchTerm = '';
  }

  function handlePasswordResetClose() {
    showPasswordResetModal = false;
    selectedUser = null;
    searchTerm = '';
  }

  function handleManageAppsClose() {
    showManageAppsModal = false;
    selectedUser = null;
  }

  function handleDeleteSuccess() {
    searchTerm = '';
  }

  function handleDeleteClose() {
    showDeleteModal = false;
    selectedUser = null;
  }
</script>

<div class="app-container">
  <!-- Header -->
  <div class="flex-start mb-6">
    <div>
      <h2 class="heading-page">User Management</h2>
      <p class="text-muted">Manage user accounts and permissions</p>
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
    <div class="empty-state">
      {#if searchTerm}
        No users found matching "{searchTerm}". Try a different search.
      {:else}
        No users found.
      {/if}
    </div>

  <!-- Users Grid -->
  {:else}
    <div class="grid-cards">
      {#each filteredUsers as user (user.id)}
        <UserCard 
          {user}
          {isAdmin}
          on:resetPassword={handlePasswordReset}
          on:manageApps={handleManageApps}
          on:deleteUser={handleDeleteUser}
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

<DeleteUserModal 
  bind:show={showDeleteModal}
  user={selectedUser}
  on:success={handleDeleteSuccess}
  on:close={handleDeleteClose}
/>
