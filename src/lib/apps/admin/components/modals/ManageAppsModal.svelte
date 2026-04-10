<!-- src/lib/apps/admin/components/modals/ManageAppsModal.svelte -->
<!-- Updated to use apps.js, ErrorDisplay, and LoadingSpinner -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { usersStore } from '../../stores/usersStore';
  import { getLogger } from '$lib/utils/logger';
  import { getPermissionedApps } from '$lib/apps/apps';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';

  const logger = getLogger('ManageAppsModal');

  export let show = false;
  export let user = null;

  const dispatch = createEventDispatcher();

  // Use centralized app config
  const availableApps = getPermissionedApps();

  let permissions = [];
  let readOnly = {};
  let loading = false;
  let error = '';

  // Get the separate stores
  const appPermissionsStore = usersStore.appPermissions;
  const appReadOnlyStore = usersStore.appReadOnly;
  const loadingStore = usersStore.loadingApps;

  // Update local state when user changes
  $: if (user && show) {
    loadUserData();
  }

  // Subscribe to store values and update local state
  $: if (user && $appPermissionsStore) {
    permissions = $appPermissionsStore[user.id] || [];
  }
  
  $: if (user && $appReadOnlyStore) {
    readOnly = $appReadOnlyStore[user.id] || {};
  }
  
  $: if (user && $loadingStore) {
    loading = $loadingStore[user.id] || false;
  }

  async function loadUserData() {
    if (!user) return;
    
    error = '';
    
    try {
      await usersStore.loadAppPermissions(user.id);
      await usersStore.loadAppReadOnly(user.id);
    } catch (err) {
      logger('Failed to load user data:', err);
      error = 'Failed to load user permissions. Please try again.';
    }
  }

  async function toggleAppPermission(appId) {
    if (!user) return;

    error = '';

    try {
      await usersStore.toggleAppPermission(user.id, appId, permissions);
    } catch (err) {
      logger('Failed to update app permission:', err);
      error = `Failed to update ${appId} permission: ${err.message}`;
    }
  }

  async function toggleAppReadOnly(appId) {
    if (!user) return;

    error = '';
    const currentValue = readOnly[appId] || false;

    try {
      await usersStore.toggleAppReadOnly(user.id, appId, currentValue);
    } catch (err) {
      logger('Failed to update read-only status:', err);
      error = `Failed to update read-only status: ${err.message}`;
    }
  }

  function handleClose() {
    show = false;
    error = '';
    dispatch('close');
  }
</script>

<Modal
  bind:show
  title={user ? `Manage Apps for ${user.email}` : 'Manage Apps'}
  size="medium"
  on:close={handleClose}
>
  <div class="form-spacing">
    <!-- Instructions -->
    <p class="text-muted-sm">
      Select which apps <strong>{user?.email || 'this user'}</strong> can access. 
      Changes take effect immediately but user must refresh their browser.
    </p>

    <!-- Error Display -->
    <ErrorDisplay 
      message={error} 
      onDismiss={() => error = ''}
    />

    <!-- Loading State -->
    {#if loading}
      <LoadingSpinner size="medium" />

    <!-- Apps List -->
    {:else}
      <div class="section-spacing">
        {#each availableApps as app}
          {@const hasPermission = permissions.includes(app.id)}
          {@const appReadOnly = readOnly[app.id] || false}
          
          <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
            <!-- App Access Checkbox -->
            <div class="flex-row-md {hasPermission ? 'mb-3' : ''}">
              <Checkbox
                checked={hasPermission}
                on:change={() => toggleAppPermission(app.id)}
              />
              <div class="flex-1">
                <div class="flex-row">
                  <Icon name={app.icon} size={5} className="text-purple-400" />
                  <span class="font-medium">{app.name}</span>
                </div>
                {#if app.description}
                  <p class="text-xs text-gray-500 mt-1">{app.description}</p>
                {/if}
              </div>
            </div>
            
            <!-- Read-Only Toggle (only if has access) -->
            {#if hasPermission}
              <div class="ml-8 pl-3 border-l-2 border-slate-600">
                <label class="flex-row cursor-pointer group">
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
      <div class="alert-info">
        <p class="text-sm">
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
