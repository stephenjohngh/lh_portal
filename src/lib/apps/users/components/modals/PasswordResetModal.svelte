<!-- src/lib/apps/users/components/modals/PasswordResetModal.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { usersStore } from '../../stores/usersStore';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';

  export let show = false;
  export let user = null;

  const dispatch = createEventDispatcher();

  let password = '';
  let passwordConfirm = '';
  let resetting = false;
  let error = '';
  let passwordError = '';

  function validateForm() {
    passwordError = '';
    error = '';

    if (!password) {
      passwordError = 'Password is required';
      return false;
    }

    if (password.length < 6) {
      passwordError = 'Password must be at least 6 characters';
      return false;
    }

    if (password !== passwordConfirm) {
      error = 'Passwords do not match';
      return false;
    }

    return true;
  }

  async function handleSubmit() {
    if (!user || !validateForm()) return;

    resetting = true;
    error = '';

    try {
      await usersStore.resetPassword(user.id, password);

      dispatch('success');
      resetForm();
      show = false;

    } catch (err) {
      error = err.message;
    } finally {
      resetting = false;
    }
  }

  function resetForm() {
    password = '';
    passwordConfirm = '';
    passwordError = '';
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
  title="Reset Password"
  size="medium"
  on:close={handleClose}
>
  <div class="space-y-4">
    <!-- User Info -->
    {#if user}
      <div class="p-3 bg-slate-700/50 rounded-lg">
        <p class="text-sm text-gray-400 mb-1">Resetting password for:</p>
        <p class="font-semibold text-white">{user.email}</p>
      </div>
    {/if}

    <!-- Error Message -->
    {#if error}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
        <p class="text-red-400 text-sm">{error}</p>
      </div>
    {/if}

    <!-- New Password -->
    <FormInput
      label="New Password"
      type="password"
      bind:value={password}
      placeholder="Minimum 6 characters"
      required={true}
      error={passwordError}
      on:input={() => passwordError = ''}
      disabled={resetting}
    />

    <!-- Confirm Password -->
    <FormInput
      label="Confirm Password"
      type="password"
      bind:value={passwordConfirm}
      placeholder="Re-enter password"
      required={true}
      disabled={resetting}
    />

    <!-- Warning -->
    <div class="p-3 bg-amber-500/10 border border-amber-500/50 rounded-lg">
      <p class="text-amber-400 text-sm">
        ⚠️ The user will need to use this new password for their next login.
        Make sure to communicate it securely.
      </p>
    </div>
  </div>

  <!-- Footer Buttons -->
  <div slot="footer" class="flex space-x-3">
    <Button
      variant="secondary"
      size="large"
      fullWidth={true}
      on:click={handleClose}
      disabled={resetting}
    >
      Cancel
    </Button>
    <Button
      variant="amber"
      size="large"
      fullWidth={true}
      icon="settings"
      loading={resetting}
      disabled={resetting}
      on:click={handleSubmit}
    >
      {resetting ? 'Resetting...' : 'Reset Password'}
    </Button>
  </div>
</Modal>
