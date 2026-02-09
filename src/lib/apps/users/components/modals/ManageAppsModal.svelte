<!-- src/lib/apps/users/components/modals/ManageAppsModal.svelte -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { usersStore } from '../../stores/usersStore';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';

  export let show = false;
  export let user = null;

  const dispatch = createEventDispatcher();

  const availableApps = [
    { id: 'users', name: 'Users', icon: 'users' },
    { id: 'issues', name: 'Issues', icon: 'clipboard' },
    { id: 'demo', name: 'Demo', icon: 'grid' }
  ];

  let permissions = [];
  let readOnly = {};
  let loading = false;

  // Subscribe to store
  $: appPermissionsStore = $usersStore.appPermissions;
  $: appReadOnlyStore = $usersStore.appReadOnly;
  $: loadingStore = $usersStore.loadingApps;

  // Update local state when user changes
  $: if (user && show) {
    loadUserData();
  }

  $: if (user) {
    permissions = appPermissionsStore[user.id] || [];
    readOnly = appReadOnlyStore[user.id] || {};
    loading = loadingStore[user.id] || false;
  }

  async function loadUserData() {
    if (!user) return;
    
    try {
      await usersStore.loadAppPermissions(user.id);
      await usersStore.loadAppReadOnly(user.id);
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
  }

  async function toggleAppPermission(appId) {
    if (!user) return;

    try {
      await usersStore.toggleAppPermission(user.id, appId, permissions);
    } catch (err) {
      alert('Failed to update app permission: ' + err.message);
    }
  }

  async function toggleAppReadOnly(appId) {
    if (!user) return;

    const currentValue = readOnly[appId] || false;

    try {
      await usersStore.toggleAppReadOnly(user.id, appId, currentValue);
    } catch (err) {
      alert('Failed to update read-only status: ' + err.message);
    }
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<Modal
  bind:show
  title={user ? `Manage Apps for ${user.email}` : 'Manage Apps'}
  size="medium"
  on:close={handleClose}
>
  <div class="space-y-4">
    <!-- Instructions -->
    <p class="text-gray-400 text-sm">
      Select which apps <strong>{user?.email || 'this user'}</strong> can access. 
      Changes take effect immediately but user must refresh their browser.
    </p>

    <!-- Loading State -->
    {#if loading}
      <div class="flex justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>

    <!-- Apps List -->
    {:else}
      <div class="space-y-3">
        {#each availableApps as app}
          {@const hasPermission = permissions.includes(app.id)}
          {@const appReadOnly = readOnly[app.id] || false}
          
          <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
            <!-- App Access Checkbox -->
            <div class="flex items-center space-x-3 {hasPermission ? 'mb-3' : ''}">
              <Checkbox
                checked={hasPermission}
                on:change={() => toggleAppPermission(app.id)}
              />
              <div class="flex-1">
                <div class="flex items-center space-x-2">
                  <Icon name={app.icon} size={5} className="text-purple-400" />
                  <span class="font-medium">{app.name}</span>
                </div>
              </div>
            </div>
            
            <!-- Read-Only Toggle (only if has access) -->
            {#if hasPermission}
              <div class="ml-8 pl-3 border-l-2 border-slate-600">
                <label class="flex items-center space-x-2 cursor-pointer group">
                  <Checkbox
                    checked={appReadOnly}
                    on:change={() => toggleAppReadOnly(app.id)}
                  />
                  <span class="text-sm text-gray-400 group-hover:text-gray-300">
                    Read-only access (view only, cannot modify)
                  </span>
                </label>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Info Message -->
      <div class="p-3 bg-blue-500/10 border border-blue-500/50 rounded-lg">
        <p class="text-blue-400 text-sm">
          <Icon name="refresh" size={4} className="inline mr-1" />
          User must refresh their browser to see app changes.
        </p>
      </div>
    {/if}
  </div>

  <!-- Footer -->
  <div slot="footer">
    <Button
      variant="primary"
      size="large"
      fullWidth={true}
      on:click={handleClose}
    >
      Done
    </Button>
  </div>
</Modal>
