<!-- src/lib/apps/users/components/UserCard.svelte -->
<!-- ADD DELETE FUNCTIONALITY -->

<script>
  import { createEventDispatcher } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';

  export let user;
  export let isAdmin = false;

  const dispatch = createEventDispatcher();

  function handleResetPassword() {
    dispatch('resetPassword', user);
  }

  function handleManageApps() {
    dispatch('manageApps', user);
  }

  // NEW: Delete user handler
  function handleDelete() {
    dispatch('deleteUser', user);
  }

  // Check if this is the current logged-in user
  $: isCurrentUser = $auth.user?.id === user.id;
</script>

<div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600 hover:border-purple-500 transition-colors">
  <!-- User Header -->
  <div class="flex items-start justify-between mb-3">
    <div class="flex items-start space-x-3">
      <div class="flex-shrink-0">
        <div class="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center">
          <Icon name="user" size={6} className="text-white" />
        </div>
      </div>
      
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold text-white truncate">
          {user.full_name || user.email}
        </h3>
        <p class="text-sm text-gray-400 truncate">{user.email}</p>
      </div>
    </div>

    <!-- Admin Badge -->
    {#if user.is_admin}
      <Badge color="bg-purple-600">
        Admin
      </Badge>
    {/if}
  </div>

  <!-- User Info -->
  <div class="space-y-1 text-sm text-gray-400 mb-4">
    <div class="flex items-center space-x-2">
      <Icon name="calendar" size={4} />
      <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
    </div>
    {#if user.last_sign_in_at}
      <div class="flex items-center space-x-2">
        <Icon name="clock" size={4} />
        <span>Last login {new Date(user.last_sign_in_at).toLocaleDateString()}</span>
      </div>
    {/if}
  </div>

  <!-- Actions -->
  {#if isAdmin}
    <div class="flex flex-wrap gap-2">
      <ProtectedButton
        action="modify"
        variant="secondary"
        size="small"
        icon="settings"
        on:click={handleResetPassword}
      >
        Reset Password
      </ProtectedButton>

      <ProtectedButton
        action="modify"
        variant="primary"
        size="small"
        icon="grid"
        on:click={handleManageApps}
      >
        Manage Apps
      </ProtectedButton>

      <!-- NEW: Delete Button - disabled for current user -->
      <ProtectedButton
        action="modify"
        variant="danger"
        size="small"
        icon="delete"
        disabled={isCurrentUser}
        title={isCurrentUser ? 'Cannot delete your own account' : 'Delete user'}
        on:click={handleDelete}
      >
        Delete
      </ProtectedButton>
    </div>

    {#if isCurrentUser}
      <p class="text-xs text-gray-500 mt-2">
        (You cannot delete your own account)
      </p>
    {/if}
  {/if}
</div>
