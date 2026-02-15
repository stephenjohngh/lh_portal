<!-- src/lib/apps/users/components/UserCard.svelte -->
<!-- REFACTORED: Uses new CSS utility classes -->
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

  function handleDelete() {
    dispatch('deleteUser', user);
  }

  $: isCurrentUser = $auth.user?.id === user.id;
</script>

<div class="card">
  <!-- User Header -->
  <div class="flex-start mb-3">
    <div class="flex-row-md">
      <div class="flex-shrink-0">
        <div class="avatar-md bg-purple-600">
          <Icon name="user" size={6} className="text-white" />
        </div>
      </div>
      
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold text-white truncate">
          {user.full_name || user.email}
        </h3>
        <p class="text-muted-sm truncate">{user.email}</p>
      </div>
    </div>

    {#if user.is_admin}
      <Badge color="bg-purple-600">Admin</Badge>
    {/if}
  </div>

  <!-- User Info -->
  <div class="section-spacing mb-4">
    <div class="text-icon text-muted-sm">
      <Icon name="calendar" size={4} />
      <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
    </div>
    {#if user.last_sign_in_at}
      <div class="text-icon text-muted-sm">
        <Icon name="clock" size={4} />
        <span>Last login {new Date(user.last_sign_in_at).toLocaleDateString()}</span>
      </div>
    {/if}
  </div>

  <!-- Actions -->
  {#if isAdmin}
    <div class="btn-group-wrap">
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
