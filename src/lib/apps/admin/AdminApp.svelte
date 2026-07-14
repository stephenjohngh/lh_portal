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
  import SpaceTypesPanel from './components/SpaceTypesPanel.svelte';
  import PortalSettingsPanel from './components/PortalSettingsPanel.svelte';
  import MaintenanceGroupsTab from './components/MaintenanceGroupsTab.svelte';
  import TenYearPlanTab from './components/TenYearPlanTab.svelte';
  import DatabasePanel   from './components/DatabasePanel.svelte';
  import DocumentsTab    from './components/DocumentsTab.svelte';
  import InspectionDefinitionsTab from './components/InspectionDefinitionsTab.svelte';
  import TabDropdown     from './components/TabDropdown.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import { buildingAssetsStore } from '$lib/apps/building_assets/stores/buildingAssetsStore.js';
  import { maintenanceGroupsStore } from './stores/maintenanceGroupsStore.js';


  let searchTerm = '';
  let activeTab = 'users';
  let assetsStoreLoaded = false;   // lazy — load buildingAssetsStore only when a building assets tab is first opened
  let componentsLoaded = false;    // lazy — components/attrs/inspections (for the Inspections scope preview)

  // Grouped tabs — collapsed into dropdowns so the top bar stays short.
  // The ids match the activeTab values handled in the content section below.
  const longTermTabs = [
    { id: 'maint-groups', icon: '🗃', label: 'Maint. Groups' },
    { id: 'ten-year',     icon: '📅', label: '10-Yr Plan' },
  ];
  const otherConfigTabs = [
    { id: 'floors',    icon: '🏢', label: 'Floors' },
    { id: 'space-types', icon: '🏷', label: 'Space Types' },
    { id: 'portal',    icon: '⚙',  label: 'Portal' },
    { id: 'database',  icon: '🔌', label: 'Database' },
    { id: 'documents', icon: '📁', label: 'Document Demo' },
  ];
  
  // Modal states
  let showCreateModal = false;
  let showPasswordResetModal = false;
  let showManageAppsModal = false;
  let showDeleteModal = false;
  let selectedUser = null;

  // ManageAppsModal needs a live view of the user from the store so that role /
  // contractor changes made inside the modal are immediately reflected when it
  // is closed and reopened (selectedUser is a snapshot and goes stale once the
  // store updates).
  let manageUserId = null;
  $: manageAppsUser = manageUserId
    ? (users.find(u => u.id === manageUserId) ?? null)
    : null;

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
    manageUserId = event.detail.id;
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
    if ((id === 'types' || id === 'floors' || id === 'space-types' || id === 'maint-groups' || id === 'ten-year' || id === 'inspections') && !assetsStoreLoaded) {
      assetsStoreLoaded = true;
      await buildingAssetsStore.load();
    }
    if ((id === 'maint-groups' || id === 'ten-year') && $maintenanceGroupsStore.groups.length === 0) {
      await maintenanceGroupsStore.load();
    }
    // Inspections scope preview needs the component set (attrs + latest inspections).
    if (id === 'inspections' && !componentsLoaded) {
      componentsLoaded = true;
      await buildingAssetsStore.loadComponents();
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
    manageUserId = null;
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
          class="px-4 py-2 transition-colors {activeTab === 'inspections'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => activateTab('inspections')}
        >
          <span class="flex items-center space-x-2">
            <span>🔎</span>
            <span>Inspections</span>
          </span>
        </button>
        <TabDropdown
          label="Long Term"
          icon="⏳"
          items={longTermTabs}
          {activeTab}
          on:select={(e) => activateTab(e.detail)}
        />
        <TabDropdown
          label="Other Config"
          icon="🛠"
          items={otherConfigTabs}
          {activeTab}
          on:select={(e) => activateTab(e.detail)}
        />
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

  {:else if activeTab === 'space-types'}
    {#if $buildingAssetsStore.loading}
      <LoadingSpinner />
    {:else}
      <SpaceTypesPanel
        types={$buildingAssetsStore.spaceTypes}
        on:saved={() => buildingAssetsStore.loadSpaceTypes()}
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

  {:else if activeTab === 'inspections'}
    {#if $buildingAssetsStore.loading}
      <LoadingSpinner />
    {:else}
      <InspectionDefinitionsTab />
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
  user={manageAppsUser}
  on:close={handleManageAppsClose}
/>

<DeleteUserModal 
  bind:show={showDeleteModal}
  user={selectedUser}
  on:success={handleDeleteSuccess}
  on:close={handleDeleteClose}
/>
