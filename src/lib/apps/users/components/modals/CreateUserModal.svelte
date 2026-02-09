<!-- src/lib/apps/users/components/modals/CreateUserModal.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { usersStore } from '../../stores/usersStore';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import { isValidEmail, isRequired } from '$lib/utils/validation';

  export let show = false;

  const dispatch = createEventDispatcher();

  let email = '';
  let password = '';
  let fullName = '';
  let creating = false;
  let error = '';
  let emailError = '';
  let passwordError = '';

  function validateForm() {
    emailError = '';
    passwordError = '';
    error = '';

    if (!isRequired(email)) {
      emailError = 'Email is required';
      return false;
    }

    if (!isValidEmail(email)) {
      emailError = 'Invalid email format';
      return false;
    }

    if (!isRequired(password)) {
      passwordError = 'Password is required';
      return false;
    }

    if (password.length < 6) {
      passwordError = 'Password must be at least 6 characters';
      return false;
    }

    return true;
  }

  async function handleSubmit() {
    if (!validateForm()) return;

    creating = true;
    error = '';

    try {
      await usersStore.createUser({
        email,
        password,
        fullName
      });

      dispatch('success');
      resetForm();
      show = false;

    } catch (err) {
      error = err.message;
    } finally {
      creating = false;
    }
  }

  function resetForm() {
    email = '';
    password = '';
    fullName = '';
    emailError = '';
    passwordError = '';
    error = '';
  }

  function handleClose() {
    resetForm();
    dispatch('close');
  }
</script>

<Modal
  bind:show
  title="Create New User"
  size="medium"
  on:close={handleClose}
>
  <div class="space-y-4">
    <!-- Error Message -->
    {#if error}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
        <p class="text-red-400 text-sm">{error}</p>
      </div>
    {/if}

    <!-- Email -->
    <FormInput
      label="Email Address"
      type="email"
      bind:value={email}
      placeholder="user@example.com"
      required={true}
      error={emailError}
      on:input={() => emailError = ''}
      disabled={creating}
    />

    <!-- Full Name -->
    <FormInput
      label="Full Name"
      type="text"
      bind:value={fullName}
      placeholder="John Doe"
      disabled={creating}
    />

    <!-- Password -->
    <FormInput
      label="Password"
      type="password"
      bind:value={password}
      placeholder="Minimum 6 characters"
      required={true}
      error={passwordError}
      on:input={() => passwordError = ''}
      disabled={creating}
    />

    <!-- Info Box -->
    <div class="p-3 bg-blue-500/10 border border-blue-500/50 rounded-lg">
      <p class="text-blue-400 text-sm">
        The user will receive an email with their login credentials.
        They can change their password after first login.
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
      disabled={creating}
    >
      Cancel
    </Button>
    <Button
      variant="primary"
      size="large"
      fullWidth={true}
      icon="plus"
      loading={creating}
      disabled={creating}
      on:click={handleSubmit}
    >
      {creating ? 'Creating...' : 'Create User'}
    </Button>
  </div>
</Modal>
