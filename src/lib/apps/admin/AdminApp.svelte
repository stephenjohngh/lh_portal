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
  import DocumentsTab    from './components/DocumentsTab.svelte';
  import InspectionDefinitionsTab from './components/InspectionDefinitionsTab.svelte';
  import DisplayRegisterTab from './components/DisplayRegisterTab.svelte';
  import TabDropdown     from './components/TabDropdown.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import { buildingAssetsStore } from '$lib/apps/building_assets/stores/buildingAssetsStore.js';


  let searchTerm = '';
  let activeTab = 'users';
  let assetsStoreLoaded = false;   // lazy — load buildingAssetsStore only when a building assets tab is first opened
  let componentsLoaded = false;    // lazy — components/attrs/inspections (for the Inspections scope preview)

  // Grouped tabs — collapsed into dropdowns so the top bar stays short.
  // The ids match the activeTab values handled in the content section below.
  // (The capital-planning tabs — Maintenance Groups + 10-Year Plan — now live in
  // the Maintenance app; see MaintenanceApp.svelte.)
  const otherConfigTabs = [
    { id: 'floors',    icon: '🏢', label: 'Floors' },
    { id: 'space-types', icon: '🏷', label: 'Space Types' },
    { id: 'portal',    icon: '⚙',  label: 'Portal' },
    { id: 'documents', icon: '📁', label: 'Document Demo' },
    { id: 'display-register', icon: '📌', label: 'Display Register' },
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

    // ⛔ ADMINS ONLY, and the gate is the point rather than caution: the
    // Inspections tab is inside `{#if $permissions.isAdmin}`, so a non-admin
    // defaulted onto it would land on a tab that is not in their tab bar and
    // whose content they cannot reach. They keep Users, which is the only tab
    // they have. ⚠ It cannot be decided before `permissions.init` resolves,
    // which is why it is here and not in the `activeTab` initialiser.
    //
    // ⚠ THE COST, accepted deliberately: `activateTab('inspections')` loads the
    // whole component set (types, attributes, latest inspections), so every
    // admin now pays for the register on opening Admin whether or not they came
    // for it. That is the trade the default IS — the register is what this tab
    // group is mostly opened for, and the content block already shows a spinner
    // while it arrives.
    if ($permissions.isAdmin) {
      await activateTab('inspections');
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
    if ((id === 'types' || id === 'floors' || id === 'space-types' || id === 'inspections') && !assetsStoreLoaded) {
      assetsStoreLoaded = true;
      await buildingAssetsStore.load();
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
    <!-- ⚠ Inspections leads, and for an ADMIN it also opens by default (see
         onMount). It is where the compliance register and the building's
         obligations live, which is the work this tab group is mostly opened
         for; Users is administration that happens rarely.
         ⚠ `activeTab` still initialises to 'users' — that is what a non-admin
         gets and what shows for the moment before permissions resolve. -->
    <div class="flex space-x-2 border-b border-slate-600">
      {#if $permissions.isAdmin}
        <button
          class="px-4 py-2 transition-colors {activeTab === 'inspections'
            ? 'border-b-2 border-purple-500 text-white font-semibold'
            : 'text-gray-400 hover:text-white'}"
          on:click={() => activateTab('inspections')}
        >
          <span class="flex items-center space-x-2">
            <span>🔎</span>
            <span>Requirements</span>
          </span>
        </button>
      {/if}
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

  {:else if activeTab === 'inspections'}
    {#if $buildingAssetsStore.loading}
      <LoadingSpinner />
    {:else}
      <InspectionDefinitionsTab />
    {/if}

  {:else if activeTab === 'documents'}
    <DocumentsTab />

  {:else if activeTab === 'display-register'}
    <DisplayRegisterTab />
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
