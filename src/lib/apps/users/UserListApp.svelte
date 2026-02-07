<!-- src/lib/apps/users/UserListApp.svelte -->
<!-- UPDATED: Now includes read-only toggle and uses ProtectedButton -->
<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { auth } from '$lib/stores/auth';
  import { api } from '$lib/utils/api';
  import { isAdmin as checkIsAdmin } from '$lib/utils/auth';
  import { isValidEmail, isRequired } from '$lib/utils/validation';
  import { formatDateTimeFull } from '$lib/utils/dates';
  
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Badge from '$lib/components/common/Badge.svelte';

  let users = [];
  let loading = true;
  let error = '';
  let searchTerm = '';
  let isAdmin = false;
  
  // Modals
  let showCreateModal = false;
  let showPasswordResetModal = false;
  let showManageAppsModal = false;
  let selectedUser = null;
  let selectedUserForApps = null;
  
  // New user form
  let newUserEmail = '';
  let newUserPassword = '';
  let newUserFullName = '';
  let createError = '';
  let creating = false;
  
  // Password reset form
  let resetPassword = '';
  let resetPasswordConfirm = '';
  let resetPasswordError = '';
  let resettingPassword = false;
  
  // Form validation errors
  let emailError = '';
  let passwordError = '';

  // App permission management
  let availableApps = [
    { id: 'users', name: 'Users', icon: 'users' },
    { id: 'issues', name: 'Issues', icon: 'clipboard' },
    { id: 'demo', name: 'Demo', icon: 'grid' }
  ];
  let userAppPermissions = {};
  let loadingUserApps = {};

  async function checkAdminStatus() {
    if (!$auth.user) return;
    isAdmin = await checkIsAdmin($auth.user.id);
  }

  async function fetchUsers() {
    loading = true;
    error = '';
    
    try {
      users = await api.get('profiles', {
        orderBy: 'created_at',
        ascending: false
      });
    } catch (err) {
      error = err.message;
      console.error('Error fetching users:', err);
    } finally {
      loading = false;
    }
  }

  async function loadUserAppPermissions(userId) {
    loadingUserApps[userId] = true;
    
    try {
      const { data, error } = await supabase
        .from('app_permissions')
        .select('app_id')
        .eq('user_id', userId);

      if (error) throw error;
      
      userAppPermissions[userId] = (data || []).map(p => p.app_id);
    } catch (err) {
      console.error('Error loading user app permissions:', err);
      userAppPermissions[userId] = [];
    } finally {
      loadingUserApps[userId] = false;
    }
  }

  $: filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  onMount(() => {
    checkAdminStatus();
    fetchUsers();
  });

  function validateForm() {
    emailError = '';
    passwordError = '';
    createError = '';
    
    if (!isRequired(newUserEmail)) {
      emailError = 'Email is required';
      return false;
    }
    
    if (!isValidEmail(newUserEmail)) {
      emailError = 'Invalid email format';
      return false;
    }
    
    if (!isRequired(newUserPassword)) {
      passwordError = 'Password is required';
      return false;
    }
    
    return true;
  }

  async function createUser() {
    if (!isAdmin) return;
    
    if (!validateForm()) return;
    
    creating = true;
    createError = '';
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        createError = 'Not authenticated';
        return;
      }

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          full_name: newUserFullName,
          requesting_user_id: user.id
        })
      });

      const result = await response.json();

      if (!response.ok) {
        createError = result.error || 'Failed to create user';
        return;
      }

      resetForm();
      showCreateModal = false;
      
      setTimeout(async () => {
        await fetchUsers();
      }, 500);
      
    } catch (err) {
      createError = err.message;
    } finally {
      creating = false;
    }
  }

  function resetForm() {
    newUserEmail = '';
    newUserPassword = '';
    newUserFullName = '';
    emailError = '';
    passwordError = '';
    createError = '';
  }

  function handleCloseModal() {
    showCreateModal = false;
    resetForm();
  }

  function openPasswordResetModal(user) {
    selectedUser = user;
    resetPassword = '';
    resetPasswordConfirm = '';
    resetPasswordError = '';
    showPasswordResetModal = true;
  }

  function closePasswordResetModal() {
    showPasswordResetModal = false;
    selectedUser = null;
    resetPassword = '';
    resetPasswordConfirm = '';
    resetPasswordError = '';
  }

  async function handleResetPassword() {
    resetPasswordError = '';

    if (!resetPassword) {
      resetPasswordError = 'Password is required';
      return;
    }

    if (resetPassword !== resetPasswordConfirm) {
      resetPasswordError = 'Passwords do not match';
      return;
    }

    resettingPassword = true;

    try {
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: selectedUser.id,
          new_password: resetPassword
        })
      });

      const result = await response.json();

      if (!response.ok) {
        resetPasswordError = result.error || 'Failed to reset password';
        return;
      }

      closePasswordResetModal();
      alert(`Password for ${selectedUser.email} has been reset successfully.`);

    } catch (err) {
      resetPasswordError = err.message;
    } finally {
      resettingPassword = false;
    }
  }

  function openManageAppsModal(user) {
    selectedUserForApps = user;
    
    if (!userAppPermissions[user.id]) {
      loadUserAppPermissions(user.id);
    }
    
    showManageAppsModal = true;
  }

  function closeManageAppsModal() {
    showManageAppsModal = false;
    selectedUserForApps = null;
  }

  async function toggleAppPermission(userId, appId) {
    const currentPerms = userAppPermissions[userId] || [];
    const hasPermission = currentPerms.includes(appId);

    try {
      if (hasPermission) {
        const { error } = await supabase
          .from('app_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('app_id', appId);

        if (error) throw error;

        userAppPermissions[userId] = currentPerms.filter(id => id !== appId);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        
        const { error } = await supabase
          .from('app_permissions')
          .insert({
            user_id: userId,
            app_id: appId,
            created_by: user?.id,
            updated_by: user?.id
          });

        if (error) throw error;

        userAppPermissions[userId] = [...currentPerms, appId];
      }
    } catch (err) {
      console.error('Error toggling app permission:', err);
      alert('Failed to update app permission: ' + err.message);
    }
  }

  async function toggleReadOnly(user) {
    try {
      const newValue = !user.is_read_only;
      
      await api.update('profiles', user.id, {
        is_read_only: newValue
      });
      
      users = users.map(u => 
        u.id === user.id ? { ...u, is_read_only: newValue } : u
      );
      
      console.log(`Set ${user.email} read-only: ${newValue}`);
    } catch (err) {
      console.error('Error toggling read-only:', err);
      alert('Failed to update user: ' + err.message);
    }
  }

  function getPermissionBadge(user) {
    if (user.is_admin) {
      return { label: 'Admin', variant: 'primary' };
    } else if (user.is_read_only) {
      return { label: 'Viewer', variant: 'secondary' };
    } else {
      return { label: 'Editor', variant: 'success' };
    }
  }
</script>

<div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
  <!-- Header -->
  <div class="mb-6">
    <h2 class="text-3xl font-bold mb-2">User Management</h2>
    <p class="text-gray-400">View all registered users, manage app access, and permissions</p>
  </div>

  <!-- Search Bar -->
  <div class="mb-6">
    <div class="relative">
      <input
        type="text"
        bind:value={searchTerm}
        placeholder="Search by name or email..."
        class="w-full px-4 py-3 pl-10 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      <Icon name="search" size={5} className="text-gray-400 absolute left-3 top-3.5" />
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="mb-4 flex justify-between items-center">
    <div class="text-sm text-gray-400">
      {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'} found
    </div>
    <div class="flex space-x-2">
      <ProtectedButton
        action="modify"
        requireAdmin={true}
        variant="green"
        size="large"
        icon="plus"
        on:click={() => showCreateModal = true}
      >
        Create User
      </ProtectedButton>

      <Button
        variant="primary"
        size="large"
        icon="refresh"
        disabled={loading}
        loading={loading}
        on:click={fetchUsers}
      >
        {loading ? 'Loading...' : 'Refresh'}
      </Button>
    </div>
  </div>

  <!-- Error Message -->
  {#if error}
    <div class="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
      <p class="text-red-400">Error: {error}</p>
    </div>
  {/if}

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
    </div>
  
  <!-- Empty State -->
  {:else if filteredUsers.length === 0}
    <div class="text-center py-12">
      <Icon name="users" size={16} className="text-gray-600 mx-auto mb-4" />
      <p class="text-gray-400">
        {searchTerm ? 'No users found matching your search' : 'No users found'}
      </p>
    </div>

  <!-- User Cards -->
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each filteredUsers as user}
        {@const permBadge = getPermissionBadge(user)}
        <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600 hover:border-purple-500 transition-colors">
          <!-- User Avatar & Info -->
          <div class="flex items-start space-x-3 mb-3">
            <div class="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span class="text-xl font-bold text-white">
                {user.full_name ? user.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-2 mb-1">
                <h3 class="font-semibold text-white truncate">
                  {user.full_name || 'No name'}
                </h3>
                <Badge variant={permBadge.variant} size="small">
                  {permBadge.label}
                </Badge>
              </div>
              <p class="text-sm text-gray-400 truncate">{user.email}</p>
            </div>
          </div>

          <!-- User Details -->
          <div class="space-y-2 text-sm mb-3">
            <div class="flex items-center space-x-2 text-gray-400">
              <Icon name="user" size={4} className="flex-shrink-0" />
              <span class="truncate">ID: {user.id.substring(0, 8)}...</span>
            </div>
            
            <div class="flex items-center space-x-2 text-gray-400">
              <Icon name="calendar" size={4} className="flex-shrink-0" />
              <span class="truncate">Joined: {formatDateTimeFull(user.created_at)}</span>
            </div>
          </div>

          <!-- Admin Controls -->
          {#if isAdmin}
            <!-- Read-Only Toggle (only for non-admin users) -->
            {#if !user.is_admin}
              <div class="mb-3 pb-3 border-b border-slate-600">
                <label class="flex items-center space-x-2 cursor-pointer group">
                  <Checkbox
                    checked={user.is_read_only || false}
                    on:change={() => toggleReadOnly(user)}
                  />
                  <span class="text-sm text-gray-400 group-hover:text-gray-300">
                    Read-only access
                  </span>
                </label>
              </div>
            {/if}

            <div class="space-y-2">
              <ProtectedButton
                action="modify"
                requireAdmin={true}
                variant="amber"
                size="small"
                icon="settings"
                fullWidth={true}
                on:click={() => openPasswordResetModal(user)}
              >
                Reset Password
              </ProtectedButton>
              
              <ProtectedButton
                action="modify"
                requireAdmin={true}
                variant="blue"
                size="small"
                icon="grid"
                fullWidth={true}
                on:click={() => openManageAppsModal(user)}
              >
                Manage Apps
              </ProtectedButton>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Stats Footer -->
  {#if !loading && users.length > 0}
    <div class="mt-6 pt-4 border-t border-slate-700">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-purple-400">{users.length}</div>
          <div class="text-sm text-gray-400">Total Users</div>
        </div>
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-blue-400">
            {users.filter(u => u.is_admin).length}
          </div>
          <div class="text-sm text-gray-400">Admins</div>
        </div>
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-green-400">
            {users.filter(u => !u.is_admin && !u.is_read_only).length}
          </div>
          <div class="text-sm text-gray-400">Editors</div>
        </div>
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-gray-400">
            {users.filter(u => u.is_read_only).length}
          </div>
          <div class="text-sm text-gray-400">Viewers</div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Create User Modal -->
<Modal 
  bind:show={showCreateModal}
  title="Create New User"
  size="small"
  on:close={handleCloseModal}
>
  <div class="space-y-4">
    <FormInput
      label="Email"
      type="email"
      bind:value={newUserEmail}
      placeholder="user@example.com"
      required={true}
      error={emailError}
      on:input={() => emailError = ''}
    />

    <FormInput
      label="Password"
      type="password"
      bind:value={newUserPassword}
      placeholder="••••••••"
      required={true}
      error={passwordError}
      on:input={() => passwordError = ''}
    />

    <FormInput
      label="Full Name"
      type="text"
      bind:value={newUserFullName}
      placeholder="John Smith"
      helpText="Optional"
    />

    {#if createError}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
        <p class="text-red-400 text-sm">{createError}</p>
      </div>
    {/if}
  </div>

  <div slot="footer" class="flex space-x-3">
    <Button
      variant="secondary"
      size="large"
      fullWidth={true}
      disabled={creating}
      on:click={handleCloseModal}
    >
      Cancel
    </Button>
    <Button
      variant="green"
      size="large"
      fullWidth={true}
      disabled={creating || !newUserEmail || !newUserPassword}
      loading={creating}
      on:click={createUser}
    >
      {creating ? 'Creating...' : 'Create User'}
    </Button>
  </div>
</Modal>

<!-- Reset Password Modal -->
{#if selectedUser}
  <Modal 
    bind:show={showPasswordResetModal}
    title="Reset Password for {selectedUser.email}"
    size="small"
    on:close={closePasswordResetModal}
  >
    <div class="space-y-4">
      <div class="p-3 bg-amber-500/10 border border-amber-500/50 rounded-lg">
        <p class="text-amber-400 text-sm">
          <strong>Warning:</strong> This will immediately change the user's password.
        </p>
      </div>

      <FormInput
        label="New Password"
        type="password"
        bind:value={resetPassword}
        placeholder="Enter new password"
        required={true}
        on:input={() => resetPasswordError = ''}
      />

      <FormInput
        label="Confirm Password"
        type="password"
        bind:value={resetPasswordConfirm}
        placeholder="Confirm new password"
        required={true}
        on:input={() => resetPasswordError = ''}
      />

      {#if resetPasswordError}
        <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
          <p class="text-red-400 text-sm">{resetPasswordError}</p>
        </div>
      {/if}
    </div>

    <div slot="footer" class="flex space-x-3">
      <Button
        variant="secondary"
        size="large"
        fullWidth={true}
        disabled={resettingPassword}
        on:click={closePasswordResetModal}
      >
        Cancel
      </Button>
      <Button
        variant="amber"
        size="large"
        fullWidth={true}
        loading={resettingPassword}
        disabled={resettingPassword || !resetPassword || !resetPasswordConfirm}
        on:click={handleResetPassword}
      >
        {resettingPassword ? 'Resetting...' : 'Reset Password'}
      </Button>
    </div>
  </Modal>
{/if}

<!-- Manage Apps Modal -->
{#if showManageAppsModal && selectedUserForApps}
  <Modal
    bind:show={showManageAppsModal}
    title="Manage Apps for {selectedUserForApps.email}"
    size="medium"
    on:close={closeManageAppsModal}
  >
    <div class="space-y-4">
      <p class="text-gray-400 text-sm">
        Select which apps <strong>{selectedUserForApps.email}</strong> can access. 
        Changes take effect immediately but user must refresh their browser.
      </p>

      {#if loadingUserApps[selectedUserForApps.id]}
        <div class="flex justify-center py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      {:else}
        <div class="space-y-3">
          {#each availableApps as app}
            {@const hasPermission = (userAppPermissions[selectedUserForApps.id] || []).includes(app.id)}
            <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600 hover:border-purple-500 transition-colors">
              <div class="flex items-center space-x-3">
                <Checkbox
                  checked={hasPermission}
                  on:change={() => toggleAppPermission(selectedUserForApps.id, app.id)}
                />
                <div class="flex-1">
                  <div class="flex items-center space-x-2">
                    <Icon name={app.icon} size={5} className="text-purple-400" />
                    <span class="font-medium text-white">{app.name}</span>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>

        <div class="p-3 bg-blue-500/10 border border-blue-500/50 rounded-lg">
          <p class="text-blue-400 text-sm">
            <Icon name="refresh" size={4} className="inline mr-1" />
            User must refresh their browser to see app changes.
          </p>
        </div>
      {/if}
    </div>

    <div slot="footer">
      <Button
        variant="primary"
        size="large"
        fullWidth={true}
        on:click={closeManageAppsModal}
      >
        Done
      </Button>
    </div>
  </Modal>
{/if}
