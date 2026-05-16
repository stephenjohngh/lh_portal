<!-- src/lib/apps/admin/AdminApp.svelte -->
<!-- User management, permissions, and audit log viewer -->
<script>
  import { onMount } from 'svelte';
  import { permissions } from '$lib/stores/permissions';
  import { auth }        from '$lib/stores/auth';
  import { usersStore }  from './stores/usersStore';
  
  import UserFilters from './components/UserFilters.svelte';
  import UserCard from './components/UserCard.svelte';
  import UserStats from './components/UserStats.svelte';
  import CreateUserModal from './components/modals/CreateUserModal.svelte';
  import PasswordResetModal from './components/modals/PasswordResetModal.svelte';
  import ManageAppsModal from './components/modals/ManageAppsModal.svelte';
  import DeleteUserModal from './components/modals/DeleteUserModal.svelte';
  import AuditLogsView from './components/AuditLogsView.svelte';
  import ComponentTypesTab from './components/ComponentTypesTab.svelte';
  import FloorPanel from './components/FloorPanel.svelte';
  import PortalSettingsPanel from './components/PortalSettingsPanel.svelte';
  import MaintenanceGroupsTab from './components/MaintenanceGroupsTab.svelte';
  import TenYearPlanTab from './components/TenYearPlanTab.svelte';
  import DatabasePanel   from './components/DatabasePanel.svelte';
  import DocumentsTab    from './components/DocumentsTab.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import { buildingAssetsStore } from '$lib/apps/building_assets/stores/buildingAssetsStore.js';
  import { maintenanceGroupsStore } from './stores/maintenanceGroupsStore.js';

  let searchTerm = '';
  let activeTab = 'users';
  let v2Loaded = false;   // lazy — load buildingAssetsStore only when a building assets tab is first opened
  
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
    // Initialize permissions for 'admin' app
    if ($auth.user) {
      await permissions.init($auth.user.id, 'admin');
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

  async function activateTab(id) {
    activeTab = id;
    if ((id === 'types' || id === 'floors' || id === 'maint-groups' || id === 'ten-year') && !v2Loaded) {
      v2Loaded = true;
      await buildingAssetsStore.load();
    }
    if ((id === 'maint-groups' || id === 'ten-year') && $maintenanceGroupsStore.groups.length === 0) {
      await maintenanceGroupsStore.load();
    }
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
  <!-- Header with Tabs (NEW) -->
  <div class="mb-6">
    <div class="flex-start mb-4">
      <div>
        <h2 class="heading-page">Admin Portal</h2>
        <p class="text-muted">User management and activity monitoring</p>
      </div>
      {#if $permissions.isAdmin && activeTab === 'users'}
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

    <!-- Tab Navigation -->
    <div class="flex space-x-2 border-b border-slate-600">
      <button
        class="px-4 py-2 transition-colors {activeTab === 'users'
          ? 'border-b-2 border-purple-500 text-white font-semibold'
          : 'text-gray-400 hover:text-white'}"
        on:click={() => activateTab('users')}
      >
        <span class="flex items-center space-x-2">
          <span>👥</span>
          <span>Users</span>
          <span class="text-xs text-muted">({users.length})</span>
        </span>
      </button>
      {#if $permissions.isAdmin}
        <button
          class="px-4 py-2 transition-colors {activeTab === 'audit'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => activateTab('audit')}
        >
          <span class="flex items-center space-x-2">
            <span>📋</span>
            <span>Audit Logs</span>
          </span>
        </button>
        <button
          class="px-4 py-2 transition-colors {activeTab === 'types'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => activateTab('types')}
        >
          <span class="flex items-center space-x-2">
            <span>🗂</span>
            <span>Component Types</span>
          </span>
        </button>
        <button
          class="px-4 py-2 transition-colors {activeTab === 'floors'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => activateTab('floors')}
        >
          <span class="flex items-center space-x-2">
            <span>🏢</span>
            <span>Floors</span>
          </span>
        </button>
        <button
          class="px-4 py-2 transition-colors {activeTab === 'portal'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => activateTab('portal')}
        >
          <span class="flex items-center space-x-2">
            <span>⚙</span>
            <span>Portal</span>
          </span>
        </button>
        <button
          class="px-4 py-2 transition-colors {activeTab === 'maint-groups'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => activateTab('maint-groups')}
        >
          <span class="flex items-center space-x-2">
            <span>🗃</span>
            <span>Maint. Groups</span>
          </span>
        </button>
        <button
          class="px-4 py-2 transition-colors {activeTab === 'ten-year'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => activateTab('ten-year')}
        >
          <span class="flex items-center space-x-2">
            <span>📅</span>
            <span>10-Yr Plan</span>
          </span>
        </button>
        <button
          class="px-4 py-2 transition-colors {activeTab === 'database'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => activateTab('database')}
        >
          <span class="flex items-center space-x-2">
            <span>🔌</span>
            <span>Database</span>
          </span>
        </button>
        <button
          class="px-4 py-2 transition-colors {activeTab === 'documents'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => activateTab('documents')}
        >
          <span class="flex items-center space-x-2">
            <span>📁</span>
            <span>Documents</span>
          </span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Tab Content (NEW) -->
  {#if activeTab === 'users'}
    <!-- USERS TAB - Existing Content -->
    
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

  {:else if activeTab === 'audit'}
    <AuditLogsView />

  {:else if activeTab === 'types'}
    {#if $buildingAssetsStore.loading}
      <LoadingSpinner />
    {:else}
      <ComponentTypesTab />
    {/if}

  {:else if activeTab === 'floors'}
    {#if $buildingAssetsStore.loading}
      <LoadingSpinner />
    {:else}
      <FloorPanel
        floors={$buildingAssetsStore.floors}
        facilities={$buildingAssetsStore.facilities}
        on:saved={() => buildingAssetsStore.load()}
      />
    {/if}

  {:else if activeTab === 'portal'}
    <PortalSettingsPanel />

  {:else if activeTab === 'maint-groups'}
    {#if $buildingAssetsStore.loading}
      <LoadingSpinner />
    {:else}
      <MaintenanceGroupsTab
        systems={$buildingAssetsStore.systems}
        types={$buildingAssetsStore.types}
        spaces={$buildingAssetsStore.spaces}
        floors={$buildingAssetsStore.floors}
      />
    {/if}

  {:else if activeTab === 'ten-year'}
    {#if $buildingAssetsStore.loading}
      <LoadingSpinner />
    {:else}
      <TenYearPlanTab />
    {/if}

  {:else if activeTab === 'database'}
    <DatabasePanel />

  {:else if activeTab === 'documents'}
    <DocumentsTab />
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
