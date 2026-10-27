<!-- src/lib/apps/admin/AdminApp.svelte -->
<!-- User management, permissions, and audit log viewer -->
<script>
  import { matchesSearch } from '#lib/utils/textSearch.js';
  import { onMount } from 'svelte';
  import { permissions } from '#lib/stores/permissions.js';
  import { auth }        from '#lib/stores/auth.js';
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
  import DueWindowsPanel from './components/DueWindowsPanel.svelte';
  import WorkflowsPanel  from './components/WorkflowsPanel.svelte';
  import IdentityPanel from './components/IdentityPanel.svelte';
  import PoliciesPanel from './components/PoliciesPanel.svelte';
  import WordingPanel from './components/WordingPanel.svelte';
  import DocumentCategoriesPanel from './components/DocumentCategoriesPanel.svelte';
  import NonWorkingDaysPanel from './components/NonWorkingDaysPanel.svelte';
  import DocumentsTab    from './components/DocumentsTab.svelte';
  import AdminNav        from './components/AdminNav.svelte';
  import { NEEDS_BUILDING_DATA, leavesOf, sectionOf } from './utils/adminSections.js';
  import TabBar from '#lib/components/common/TabBar.svelte';
  import { getPref, setPref } from '#lib/utils/prefs.js';
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import { buildingAssetsStore } from '#lib/apps/building_assets/stores/buildingAssetsStore.js';


  let searchTerm = '';
  let activeTab = 'users';
  let assetsStoreLoaded = false;   // lazy — load buildingAssetsStore only when a building assets tab is first opened

  // The sections and their groups are in utils/adminSections.js (left-hand list).
  // ⚠ Components for the capital-planning screens live in the Maintenance app.

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
  // ⚠ Before matchesSearch, a user with no name and no email was hidden even
  // with nothing typed.
  $: filteredUsers = users.filter(user => matchesSearch([user.email, user.full_name], searchTerm));

  // Nothing reads as empty until the users have been read. Before it the
  // store is empty because it has not been read, and "No users found" with
  // "0 users found" would be untrue for the moment they showed.
  let ready = false;

  onMount(async () => {
    try {
      // Initialize permissions for 'admin' app
      if ($auth.user) {
        await permissions.init($auth.user.id, 'admin');
      }

      // ⚠ Admin opens on Users again. It used to default to the register, which
      // has moved to the Compliance app — so there is nothing here worth
      // defaulting to over the tab a non-admin also gets.

      // Fetch users
      await usersStore.fetchUsers();
    } finally {
      ready = true;
    }
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

  // ⚠ Admin no longer loads the COMPONENT SET at all. Only the planned
  // obligations scope editor ever needed it, and that moved to the Compliance
  // app with the rest of the register — so the tabs left here need the type
  // hierarchy and nothing more.
  // The section list can be hidden to give a screen more width. It hides itself
  // on Workflows, whose diagrams are the widest thing in Admin, unless the person
  // has opened it there; the person's own choice is remembered in this browser.
  const NAV_PREF = 'admin.navCollapsed';
  let navPref = getPref(NAV_PREF) === 'true';
  let openedOnWorkflows = false;
  $: if (activeTab !== 'workflows') openedOnWorkflows = false;
  $: navCollapsed = navPref || (activeTab === 'workflows' && !openedOnWorkflows);
  function toggleNav() {
    if (navCollapsed) {
      navPref = false;
      if (activeTab === 'workflows') openedOnWorkflows = true;
    } else {
      navPref = true;
      openedOnWorkflows = false;
    }
    setPref(NAV_PREF, String(navPref));
  }

  // Opening a section shows the screen last used in it, or its first.
  /** @type {Record<string, string>} */
  const lastScreen = {};
  $: section = sectionOf(activeTab);
  $: screens = section ? leavesOf(section) : [];
  function openSection(sec) {
    activateTab(lastScreen[sec.id] ?? leavesOf(sec)[0].id);
  }

  async function activateTab(id) {
    activeTab = id;
    const sec = sectionOf(id);
    if (sec) lastScreen[sec.id] = id;
    if (NEEDS_BUILDING_DATA.includes(id) && !assetsStoreLoaded) {
      assetsStoreLoaded = true;
      await buildingAssetsStore.load();
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
        <p class="text-muted">People, the building, how the portal behaves, and the record of what was done</p>
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

  </div>

  <div class="flex flex-col md:flex-row gap-6 md:items-start">
    {#if $permissions.isAdmin}
      <AdminNav active={activeTab} isAdmin={$permissions.isAdmin} userCount={users.length}
                collapsed={navCollapsed} on:toggle={toggleNav} on:select={(e) => openSection(e.detail)} />
    {/if}
    <div class="flex-1 min-w-0">
      {#if screens.length > 1}
        <div class="mb-4">
          <TabBar tabs={screens.map((l) => ({ key: l.id, label: l.label }))} active={activeTab}
                  on:select={(e) => activateTab(e.detail)} />
        </div>
      {/if}

  <!-- Tab Content (NEW) -->
  {#if activeTab === 'users'}
    <!-- USERS TAB - Existing Content -->
    
    <!-- Filters -->
    <UserFilters 
      bind:searchTerm 
      resultCount={ready && !loading ? filteredUsers.length : null}
    />

    <!-- Error Display -->
    <ErrorDisplay 
      message={error} 
      onDismiss={() => usersStore.clearError()}
    />

    <!-- Loading State -->
    {#if !ready || loading}
      <LoadingSpinner text="Loading users…" />

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

  {:else if activeTab === 'apps'}
    <PortalSettingsPanel part="apps" />

  {:else if activeTab === 'ai'}
    <PortalSettingsPanel part="ai" />

  {:else if activeTab === 'identity'}
    <IdentityPanel />

  {:else if activeTab === 'non-working-days'}
    <NonWorkingDaysPanel />

  {:else if activeTab === 'due-windows'}
    <DueWindowsPanel />

  {:else if activeTab === 'policies'}
    <PoliciesPanel />

  {:else if activeTab === 'wording'}
    <WordingPanel />

  {:else if activeTab === 'doc-categories'}
    <DocumentCategoriesPanel />

  {:else if activeTab === 'workflows'}
    <WorkflowsPanel />

  {:else if activeTab === 'documents'}
    <DocumentsTab />

  {/if}
    </div>
  </div>
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
