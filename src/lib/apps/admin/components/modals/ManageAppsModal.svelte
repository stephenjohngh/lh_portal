<!-- src/lib/apps/admin/components/modals/ManageAppsModal.svelte -->
<!-- Manage a user's role (Admin / Editor / Viewer) and per-app access level. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { usersStore }  from '../../stores/usersStore';
  import { getLogger }   from '$lib/utils/logger';
  import { getPermissionedApps } from '$lib/apps/apps';
  import Modal           from '$lib/components/common/Modal.svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import Checkbox        from '$lib/components/common/Checkbox.svelte';
  import Icon            from '$lib/components/icons/Icon.svelte';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner  from '$lib/components/common/LoadingSpinner.svelte';

  const logger = getLogger('ManageAppsModal');

  export let show = false;
  export let user = null;

  const dispatch = createEventDispatcher();

  const availableApps = getPermissionedApps();

  let permissions        = [];
  let readOnly           = {};
  let loading            = false;
  let error              = '';
  let togglingContractor = false;
  let settingRole        = false;

  const appPermissionsStore = usersStore.appPermissions;
  const appReadOnlyStore    = usersStore.appReadOnly;
  const loadingStore        = usersStore.loadingApps;

  $: if (user && show)            { loadUserData(); }
  $: if (user && $appPermissionsStore) { permissions = $appPermissionsStore[user.id] || []; }
  $: if (user && $appReadOnlyStore)    { readOnly    = $appReadOnlyStore[user.id]    || {}; }
  $: if (user && $loadingStore)        { loading     = $loadingStore[user.id]        || false; }

  // Guard: can't change your own role
  $: isSelf = user?.id === $auth.user?.id;

  // Derive current role from profile flags
  $: currentRole = user?.is_admin ? 'admin' : user?.is_read_only ? 'ro' : 'rw';

  const ROLES = [
    {
      id: 'admin',
      label: 'Admin',
      desc: 'Full access to all apps and portal administration. No per-app restrictions apply.',
      activeCls: 'bg-purple-600 border-purple-500 text-white',
      hoverCls:  'border-slate-600 text-slate-400 hover:border-purple-500 hover:text-purple-300',
    },
    {
      id: 'rw',
      label: 'Editor',
      desc: 'Can read and write data in permitted apps. Per-app access controls apply.',
      activeCls: 'bg-blue-600 border-blue-500 text-white',
      hoverCls:  'border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-300',
    },
    {
      id: 'ro',
      label: 'Viewer',
      desc: 'Read-only access to permitted apps. Cannot create, edit, or delete any data.',
      activeCls: 'bg-slate-600 border-slate-500 text-white',
      hoverCls:  'border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-300',
    },
  ];

  function roleBtnCls(r) {
    const active = currentRole === r.id;
    const base   = 'px-3 py-1.5 text-sm font-medium rounded border transition-colors';
    const state  = settingRole || isSelf ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
    return `${base} ${active ? r.activeCls : r.hoverCls} ${state}`;
  }

  const ACCESS_LEVELS = [
    { id: 'none', label: 'None',  activeCls: 'bg-slate-700 border-slate-500 text-white',  hoverCls: 'border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300' },
    { id: 'rw',   label: 'Edit',  activeCls: 'bg-blue-700  border-blue-500  text-white',  hoverCls: 'border-slate-600 text-slate-400 hover:border-blue-500  hover:text-blue-300'  },
    { id: 'ro',   label: 'View',  activeCls: 'bg-amber-700 border-amber-500 text-white',  hoverCls: 'border-slate-600 text-slate-400 hover:border-amber-500 hover:text-amber-300' },
  ];

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

  async function setRole(roleId) {
    if (!user || settingRole || currentRole === roleId || isSelf) return;
    settingRole = true;
    error = '';
    try {
      await usersStore.setUserRole(user.id, roleId);
      // No local `user = { ...user, ... }` here — the parent derives `user`
      // from the store reactively, so the prop updates automatically once
      // setUserRole() commits. Mutating the prop locally would (a) cause a
      // second loadUserData() call and (b) be overwritten by the parent anyway.
    } catch (err) {
      logger('Failed to set role:', err);
      error = `Failed to set role: ${err.message}`;
    } finally {
      settingRole = false;
    }
  }

  async function setAccessLevel(appId, level) {
    if (!user) return;
    error = '';
    try {
      await usersStore.setAppAccessLevel(user.id, appId, level);
    } catch (err) {
      logger('Failed to set access level:', err);
      error = `Failed to update ${appId} access: ${err.message}`;
    }
  }

  async function toggleContractor() {
    if (!user) return;
    togglingContractor = true;
    error = '';
    try {
      await usersStore.toggleContractor(user.id, user.is_contractor || false);
      // Parent prop updates from the store — no local mutation needed.
    } catch (err) {
      logger('Failed to toggle contractor status:', err);
      error = `Failed to update contractor status: ${err.message}`;
    } finally {
      togglingContractor = false;
    }
  }

  function handleClose() {
    show  = false;
    error = '';
    dispatch('close');
  }
</script>

<Modal
  bind:show
  title={user ? `Manage Access — ${user.full_name || user.email}` : 'Manage Access'}
  size="medium"
  on:close={handleClose}
>
  <div class="form-spacing">

    <ErrorDisplay message={error} onDismiss={() => error = ''} />

    <!-- ── Role ─────────────────────────────────────────────────────── -->
    <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600 space-y-3">
      <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</p>

      {#if isSelf}
        <p class="text-xs text-amber-400">You cannot change your own role.</p>
      {/if}

      <div class="flex gap-2 flex-wrap">
        {#each ROLES as r}
          <button
            class={roleBtnCls(r)}
            disabled={settingRole || isSelf}
            on:click={() => setRole(r.id)}
          >{r.label}</button>
        {/each}
        {#if settingRole}
          <span class="text-xs text-slate-500 self-center animate-pulse">Saving…</span>
        {/if}
      </div>

      <p class="text-xs text-slate-500">
        {ROLES.find(r => r.id === currentRole)?.desc ?? ''}
      </p>
    </div>

    <!-- ── Contractor ────────────────────────────────────────────────── -->
    <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
      <label class="flex items-center gap-3 cursor-pointer group">
        <Checkbox
          checked={user?.is_contractor || false}
          disabled={togglingContractor}
          on:change={toggleContractor}
        />
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-200 group-hover:text-white">
            Contractor account
          </p>
          <p class="text-xs text-slate-500 mt-0.5">
            Restricts this user to only seeing maintenance jobs assigned to them.
            Allows them to complete jobs and upload documents.
          </p>
        </div>
        {#if togglingContractor}
          <span class="text-xs text-slate-500 animate-pulse">Saving…</span>
        {/if}
      </label>
    </div>

    <!-- ── App access ────────────────────────────────────────────────── -->
    {#if loading}
      <LoadingSpinner size="medium" />
    {:else}
      <div class="space-y-2">
        <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">App Access</p>

        {#if currentRole === 'admin'}
          <p class="text-sm text-slate-500 italic">
            Admins always have full access to all apps — no per-app restrictions apply.
          </p>
        {:else}
          {#if currentRole === 'ro'}
            <p class="text-xs text-amber-500/80">
              This user is a Viewer — all permitted apps are read-only regardless of the Edit button below.
            </p>
          {/if}

          {#each availableApps as app}
            {@const level = permissions.includes(app.id)
              ? (readOnly[app.id] ? 'ro' : 'rw')
              : 'none'}
            <div class="bg-slate-700/50 rounded-lg px-3 py-2.5 border border-slate-600
                        flex items-center gap-3">
              <Icon name={app.icon} size={4} className="text-purple-400 shrink-0" />
              <p class="text-sm text-slate-200 flex-1 min-w-0 truncate">{app.name}</p>
              <div class="flex gap-1 shrink-0">
                {#each ACCESS_LEVELS as lv}
                  {@const isActive = level === lv.id}
                  <button
                    class="px-2 py-0.5 text-xs rounded border transition-colors
                           {isActive ? lv.activeCls : lv.hoverCls}"
                    on:click={() => setAccessLevel(app.id, lv.id)}
                  >{lv.label}</button>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="alert-info">
        <p class="text-sm">
          <Icon name="refresh" size={4} className="inline mr-1" />
          User must refresh their browser to see access changes.
        </p>
      </div>
    {/if}

  </div>

  <div slot="footer">
    <Button variant="primary" size="large" fullWidth={true} on:click={handleClose}>
      Done
    </Button>
  </div>
</Modal>
