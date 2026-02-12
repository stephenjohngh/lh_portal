<!-- src/lib/apps/users/components/modals/DeleteUserModal.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { usersStore } from '../../stores/usersStore';
  import { getLogger } from '$lib/utils/logger';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  const logger = getLogger('DeleteUserModal');

  export let show = false;
  export let user = null;

  const dispatch = createEventDispatcher();

  let deleting = false;
  let error = '';
  let confirmText = '';

  $: confirmMatch = confirmText.toLowerCase() === 'delete';

  async function handleDelete() {
    if (!user || !confirmMatch) return;

    deleting = true;
    error = '';

    try {
      await usersStore.deleteUser(user.id);

      logger('User deleted successfully:', user.email);
      dispatch('success');
      resetForm();
      show = false;

    } catch (err) {
      logger('Failed to delete user:', err);
      error = err.message;
    } finally {
      deleting = false;
    }
  }

  function resetForm() {
    confirmText = '';
    error = '';
  }

  function handleClose() {
    resetForm();
    show = false;
    dispatch('close');
  }
</script>

<Modal
  bind:show
  title="Delete User"
  size="medium"
  on:close={handleClose}
>
  <div class="form-spacing">
    <!-- User Info -->
    {#if user}
      <div class="alert-error">
        <div class="flex items-start space-x-3">
          <Icon name="alert" size={6} className="text-red-400 mt-0.5" />
          <div class="flex-1">
            <p class="font-semibold mb-2">Warning: This action cannot be undone!</p>
            <p class="text-sm text-gray-300 mb-1">You are about to permanently delete:</p>
            <p class="font-semibold text-white">{user.email}</p>
            {#if user.full_name}
              <p class="text-muted-sm">{user.full_name}</p>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- What will be deleted -->
    <div class="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
      <p class="font-semibold text-white mb-2">This will permanently delete:</p>
      <ul class="space-y-1 text-sm text-gray-300">
        <li class="flex-row">
          <Icon name="user" size={4} className="text-gray-400" />
          <span>User account and profile</span>
        </li>
        <li class="flex-row">
          <Icon name="grid" size={4} className="text-gray-400" />
          <span>All app permissions</span>
        </li>
        <li class="flex-row">
          <Icon name="database" size={4} className="text-gray-400" />
          <span>User authentication credentials</span>
        </li>
      </ul>
    </div>

    <!-- What will be preserved -->
    <div class="alert-info">
      <p class="font-semibold mb-2">Data that will be preserved:</p>
      <ul class="space-y-1 text-sm text-gray-300">
        <li class="flex-row">
          <Icon name="clipboard" size={4} />
          <span>Issues created by this user (shown as "Deleted User")</span>
        </li>
        <li class="flex-row">
          <Icon name="calendar" size={4} />
          <span>Comments and actions authored by this user</span>
        </li>
        <li class="flex-row">
          <Icon name="chart" size={4} />
          <span>Historical audit trail and timestamps</span>
        </li>
      </ul>
    </div>

    <!-- Error Display -->
    <ErrorDisplay 
      message={error} 
      onDismiss={() => error = ''}
    />

    <!-- Confirmation Input -->
    <div class="space-y-2">
      <label class="text-label block">
        Type <span class="font-bold text-red-400">DELETE</span> to confirm:
      </label>
      <input
        type="text"
        bind:value={confirmText}
        placeholder="Type DELETE to confirm"
        disabled={deleting}
        class="input"
      />
      {#if confirmText && !confirmMatch}
        <p class="text-sm text-amber-400">
          Please type "DELETE" exactly (case insensitive)
        </p>
      {/if}
    </div>
  </div>

  <!-- Footer Buttons -->
  <div slot="footer" class="flex space-x-3">
    <Button
      variant="secondary"
      size="large"
      fullWidth={true}
      on:click={handleClose}
      disabled={deleting}
    >
      Cancel
    </Button>
    <Button
      variant="danger"
      size="large"
      fullWidth={true}
      icon="delete"
      loading={deleting}
      disabled={!confirmMatch || deleting}
      on:click={handleDelete}
    >
      {deleting ? 'Deleting...' : 'Delete User Permanently'}
    </Button>
  </div>
</Modal>
