<!-- src/lib/apps/settings/SettingsApp.svelte -->
<script>
  import { auth } from '$lib/stores/auth';
  import { supabase } from '$lib/supabaseClient';
  import { getLogger } from '$lib/utils/logger';
  import Button from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';

  const logger = getLogger('SettingsApp');

  let showPasswordModal = false;
  let passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
  let passwordErrors = { currentPassword: '', newPassword: '', confirmPassword: '' };
  let passwordSuccess = '';
  let passwordLoading = false;

  function validatePasswordForm() {
    passwordErrors = { currentPassword: '', newPassword: '', confirmPassword: '' };
    passwordSuccess = '';
    if (!passwordForm.currentPassword) { passwordErrors.currentPassword = 'Current password is required'; return false; }
    if (!passwordForm.newPassword) { passwordErrors.newPassword = 'New password is required'; return false; }
    if (passwordForm.newPassword === passwordForm.currentPassword) { passwordErrors.newPassword = 'New password must be different from current password'; return false; }
    if (!passwordForm.confirmPassword) { passwordErrors.confirmPassword = 'Please confirm your new password'; return false; }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { passwordErrors.confirmPassword = 'Passwords do not match'; return false; }
    return true;
  }

  async function handleChangePassword() {
    if (!validatePasswordForm()) return;
    passwordLoading = true;
    passwordSuccess = '';
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: $auth.user.email,
        password: passwordForm.currentPassword
      });
      if (signInError) { passwordErrors.currentPassword = 'Current password is incorrect'; passwordLoading = false; return; }
      const { error: updateError } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      if (updateError) throw updateError;
      passwordSuccess = 'Password updated successfully!';
      setTimeout(() => { resetPasswordForm(); showPasswordModal = false; }, 2000);
    } catch (err) {
      logger('❌ Password change error:', err);
      passwordErrors.newPassword = err.message || 'Failed to update password';
    } finally {
      passwordLoading = false;
    }
  }

  function resetPasswordForm() {
    passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
    passwordErrors = { currentPassword: '', newPassword: '', confirmPassword: '' };
    passwordSuccess = '';
  }

  function closePasswordModal() { showPasswordModal = false; resetPasswordForm(); }
</script>

<div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
  <div class="mb-6">
    <h2 class="text-3xl font-bold mb-2">Settings</h2>
    <p class="text-gray-400">Manage your account settings and preferences</p>
  </div>

  <div class="mb-8">
    <h3 class="text-xl font-semibold mb-4 flex items-center gap-2">
      <Icon name="user" size={6} className="text-purple-400" />
      Account Information
    </h3>
    <div class="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p class="block text-sm font-medium text-gray-400 mb-1">Email</p>
          <p class="text-white text-lg">{$auth.user?.email || 'Not available'}</p>
        </div>
        <div>
          <p class="block text-sm font-medium text-gray-400 mb-1">User ID</p>
          <p class="text-white text-sm font-mono">{$auth.user?.id?.substring(0, 16) || 'Not available'}...</p>
        </div>
      </div>
    </div>
  </div>

  <div class="mb-8">
    <h3 class="text-xl font-semibold mb-4 flex items-center gap-2">
      <Icon name="settings" size={6} className="text-purple-400" />
      Security
    </h3>
    <div class="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-lg font-medium text-white mb-1">Password</h4>
          <p class="text-gray-400 text-sm">Change your account password</p>
        </div>
        <Button variant="primary" size="large" icon="edit" on:click={() => showPasswordModal = true}>
          Change Password
        </Button>
      </div>
    </div>
  </div>

  <div class="mb-8">
    <h3 class="text-xl font-semibold mb-4 flex items-center gap-2">
      <Icon name="settings" size={6} className="text-purple-400" />
      Preferences
    </h3>
    <div class="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
      <p class="text-gray-400">Additional preferences will be added here.</p>
    </div>
  </div>
</div>

<Modal bind:show={showPasswordModal} title="Change Password" size="small" on:close={closePasswordModal}>
  <div class="space-y-4">
    <FormInput label="Current Password" type="password" bind:value={passwordForm.currentPassword}
      placeholder="Enter current password" required={true} error={passwordErrors.currentPassword}
      on:input={() => passwordErrors.currentPassword = ''} />
    <FormInput label="New Password" type="password" bind:value={passwordForm.newPassword}
      placeholder="Enter new password" required={true} error={passwordErrors.newPassword}
      on:input={() => passwordErrors.newPassword = ''} />
    <FormInput label="Confirm New Password" type="password" bind:value={passwordForm.confirmPassword}
      placeholder="Confirm new password" required={true} error={passwordErrors.confirmPassword}
      on:input={() => passwordErrors.confirmPassword = ''} />
    {#if passwordSuccess}
      <div class="p-3 bg-green-500/10 border border-green-500/50 rounded-lg">
        <p class="text-green-400 text-sm">{passwordSuccess}</p>
      </div>
    {/if}
  </div>
  <div slot="footer" class="flex space-x-3">
    <Button variant="secondary" size="large" fullWidth={true} disabled={passwordLoading} on:click={closePasswordModal}>Cancel</Button>
    <Button variant="primary" size="large" fullWidth={true} loading={passwordLoading} disabled={passwordLoading} on:click={handleChangePassword}>
      {passwordLoading ? 'Updating...' : 'Update Password'}
    </Button>
  </div>
</Modal>
