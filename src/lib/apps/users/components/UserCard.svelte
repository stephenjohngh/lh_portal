<!-- src/lib/apps/users/components/UserCard.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { formatDateTimeFull } from '$lib/utils/dates';

  export let user;
  export let isAdmin = false;

  const dispatch = createEventDispatcher();

  function handleResetPassword() {
    dispatch('resetPassword', user);
  }

  function handleManageApps() {
    dispatch('manageApps', user);
  }
</script>

<div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600 hover:border-purple-500 transition-colors">
  <!-- User Header -->
  <div class="flex items-start justify-between mb-3">
    <div class="flex items-center space-x-3">
      <div class="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center">
        <Icon name="user" size={6} className="text-white" />
      </div>
      <div>
        <h3 class="text-lg font-semibold text-white">
          {user.full_name || 'Unknown User'}
        </h3>
        <p class="text-sm text-gray-400">{user.email}</p>
      </div>
    </div>

    <!-- Admin Badge -->
    {#if user.is_admin}
      <div class="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">
        Admin
      </div>
    {/if}
  </div>

  <!-- User Info -->
  <div class="space-y-2 text-sm">
    <!-- Created Date -->
    <div class="flex items-center space-x-2 text-gray-400">
      <Icon name="calendar" size={4} />
      <span>Created: {formatDateTimeFull(user.created_at)}</span>
    </div>

    <!-- Last Sign In -->
    {#if user.last_sign_in_at}
      <div class="flex items-center space-x-2 text-gray-400">
        <Icon name="clock" size={4} />
        <span>Last sign in: {formatDateTimeFull(user.last_sign_in_at)}</span>
      </div>
    {/if}

    <!-- User ID -->
    <div class="flex items-center space-x-2 text-gray-500 text-xs">
      <span>ID: {user.id.substring(0, 8)}...</span>
    </div>
  </div>

  <!-- Admin Controls -->
  {#if isAdmin && !user.is_admin}
    <div class="mt-4 pt-4 border-t border-slate-600 space-y-2">
      <Button
        variant="blue"
        size="small"
        icon="settings"
        fullWidth={true}
        on:click={handleResetPassword}
      >
        Reset Password
      </Button>
      
      <Button
        variant="blue"
        size="small"
        icon="grid"
        fullWidth={true}
        on:click={handleManageApps}
      >
        Manage Apps
      </Button>
    </div>
  {/if}
</div>
