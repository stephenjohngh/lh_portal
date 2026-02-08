<!-- src/lib/apps/users/UserListApp.svelte -->
<!-- REFACTORED: Now uses common components (Button, FormInput, Modal) -->
<!-- ADDED: App permissions management for admin users -->
<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { auth } from '$lib/stores/auth';
  import { api } from '$lib/utils/api';
  import { isAdmin as checkIsAdmin } from '$lib/utils/auth';
  import { isValidEmail, isRequired } from '$lib/utils/validation';
  import { formatDateTimeFull } from '$lib/utils/dates';
  import Button from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';

  let users = [];
  let loading = true;
  let error = '';
  let searchTerm = '';
  let isAdmin = false;
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
  let userAppPermissions = {}; // { user_id: ['app1', 'app2'] }
  let loadingUserApps = {};

  // Check if current user is admin
  async function checkAdminStatus() {
    if (!$auth.user) return;
    isAdmin = await checkIsAdmin($auth.user.id);
  }

  // Fetch users from database
  async function fetchUsers() {
    console.log('🔄 fetchUsers() called');
    console.log('Time:', new Date().toISOString());
    
    loading = true;
    error = '';
    
    try {
      console.log('📡 Querying profiles table...');
      
      users = await api.get('profiles', {
        orderBy: 'created_at',
        ascending: false
      });

      console.log('✅ Users set to:', users.length, 'records');
      console.log('User emails:', users.map(u => u.email));
      
    } catch (err) {
      error = err.message;
      console.error('❌ Exception in fetchUsers:', err);
      console.error('Error details:', err);
    } finally {
      loading = false;
      console.log('Loading state set to false');
      console.log('Final users array length:', users.length);
    }
  }

  // Load user's app permissions
  async function loadUserAppPermissions(userId) {
    loadingUserApps[userId] = true;
    
    try {
      const { data, error } = await supabase
        .from('app_permissions')
        .select('app_id')
        .eq('user_id', userId);

      if (error) throw error;
      
      userAppPermissions[userId] = (data || []).map(p => p.app_id);
      console.log(`Loaded app permissions for user ${userId}:`, userAppPermissions[userId]);
    } catch (err) {
      console.error('Error loading user app permissions:', err);
      userAppPermissions[userId] = [];
    } finally {
      loadingUserApps[userId] = false;
    }
  }

  // Filter users based on search
  $: filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Load users when component mounts
  onMount(() => {
    checkAdminStatus();
    fetchUsers();
  });

  // Validate form
  function validateForm() {
    emailError = '';
    passwordError = '';
    createError = '';
    
    // Validate email
    if (!isRequired(newUserEmail)) {
      emailError = 'Email is required';
      return false;
    }
    
    if (!isValidEmail(newUserEmail)) {
      emailError = 'Invalid email format';
      return false;
    }
    
    // Validate password
    if (!isRequired(newUserPassword)) {
      passwordError = 'Password is required';
      return false;
    }
    
    return true;
  }

  // Create new user (admin only)
  async function createUser() {
    if (!isAdmin) return;
    
    if (!validateForm()) return;
    
    creating = true;
    createError = '';
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        createError = 'Not authenticated';
        return;
      }

      console.log('Creating user, requesting user ID:', user.id);

      // Call server endpoint to create user
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
        console.error('Server error:', result);
        return;
      }

      console.log('✅ User created successfully:', result);

      // Success! Reset form and refresh list
      resetForm();
      showCreateModal = false;
      
      // Wait a moment then refresh to ensure database has written
      setTimeout(async () => {
        await fetchUsers();
      }, 500);
      
    } catch (err) {
      createError = err.message;
      console.error('Create user error:', err);
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

    // Validate
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
      // Call admin API to reset user password
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

      console.log('✅ Password reset successfully:', result);
      
      // Success - close modal
      closePasswordResetModal();
      
      // Show success message (you could add a toast notification here)
      alert(`Password for ${selectedUser.email} has been reset successfully.`);

    } catch (err) {
      resetPasswordError = err.message;
      console.error('Reset password error:', err);
    } finally {
      resettingPassword = false;
    }
  }

  // Open manage apps modal
  function openManageAppsModal(user) {
    selectedUserForApps = user;
    
    // Load user's current app permissions
    if (!userAppPermissions[user.id]) {
      loadUserAppPermissions(user.id);
    }
    
    showManageAppsModal = true;
  }

  function closeManageAppsModal() {
    showManageAppsModal = false;
    selectedUserForApps = null;
  }

  // Toggle app permission for user
  async function toggleAppPermission(userId, appId) {
    const currentPerms = userAppPermissions[userId] || [];
    const hasPermission = currentPerms.includes(appId);

    try {
      if (hasPermission) {
        // Remove permission
        const { error } = await supabase
          .from('app_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('app_id', appId);

        if (error) throw error;

        // Update local state
        userAppPermissions[userId] = currentPerms.filter(id => id !== appId);
        console.log(`Removed ${appId} permission from user ${userId}`);
      } else {
        // Add permission
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

        // Update local state
        userAppPermissions[userId] = [...currentPerms, appId];
        console.log(`Added ${appId} permission to user ${userId}`);
      }
    } catch (err) {
      console.error('Error toggling app permission:', err);
      alert('Failed to update app permission: ' + err.message);
    }
  }

  // Toggle read-only status for user
  async function toggleReadOnly(user) {
    try {
      const newValue = !user.is_read_only;
      
      console.log('Toggling read-only for user:', {
        userId: user.id,
        email: user.email,
        currentValue: user.is_read_only,
        newValue: newValue
      });
      
      // Use api.update with returnRecord=false to avoid .single() which can cause errors
      const result = await api.update('profiles', user.id, { is_read_only: newValue }, false);
      
      console.log('Update result:', result);
      
      // Update local state
      users = users.map(u => 
        u.id === user.id ? { ...u, is_read_only: newValue } : u
      );
      
      console.log(`Set ${user.email} read-only: ${newValue}`);
    } catch (err) {
      console.error('Error toggling read-only:', err);
      console.error('Error details:', {
        message: err.message,
        details: err.details,
        hint: err.hint,
        code: err.code
      });
      alert('Failed to update user: ' + err.message);
    }
  }
</script>

<div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
  <!-- Header -->
  <div class="mb-6">
    <h2 class="text-3xl font-bold mb-2">User Management</h2>
    <p class="text-gray-400">View all registered users and manage their app access</p>
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
      {#if isAdmin}
        <Button
          variant="green"
          size="large"
          icon="plus"
          on:click={() => showCreateModal = true}
        >
          Create User
        </Button>
      {/if}
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
        <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600 hover:border-purple-500 transition-colors">
          <!-- User Avatar -->
          <div class="flex items-start space-x-3 mb-3">
            <div class="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span class="text-xl font-bold text-white">
                {user.full_name ? user.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-2">
                <h3 class="font-semibold text-white truncate">
                  {user.full_name || 'No name'}
                </h3>
                {#if user.is_admin}
                  <span class="px-2 py-0.5 bg-purple-600 text-white text-xs rounded flex-shrink-0">
                    Admin
                  </span>
                {/if}
              </div>
              <p class="text-sm text-gray-400 truncate">{user.email}</p>
            </div>
          </div>

          <!-- User Details -->
          <div class="space-y-2 text-sm">
            <div class="flex items-center space-x-2 text-gray-400">
              <Icon name="user" size={4} className="flex-shrink-0" />
              <span class="truncate">ID: {user.id.substring(0, 8)}...</span>
            </div>
            
            <div class="flex items-center space-x-2 text-gray-400">
              <Icon name="calendar" size={4} className="flex-shrink-0" />
              <span class="truncate">Joined: {formatDateTimeFull(user.created_at)}</span>
            </div>

            {#if user.updated_at && user.updated_at !== user.created_at}
              <div class="flex items-center space-x-2 text-gray-400">
                <Icon name="refresh" size={4} className="flex-shrink-0" />
                <span class="truncate">Updated: {formatDateTimeFull(user.updated_at)}</span>
              </div>
            {/if}
          </div>

          <!-- Admin Controls -->
          {#if isAdmin}
            <!-- Read-Only Toggle (only for non-admin users) -->
            {#if !user.is_admin}
              <div class="mt-3 pt-3 border-t border-slate-600">
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

            <div class="mt-3 pt-3 border-t border-slate-600 space-y-2">
              <Button
                variant="amber"
                size="small"
                icon="settings"
                fullWidth={true}
                on:click={() => openPasswordResetModal(user)}
              >
                Reset Password
              </Button>
              
              <Button
                variant="blue"
                size="small"
                icon="grid"
                fullWidth={true}
                on:click={() => openManageAppsModal(user)}
              >
                Manage Apps
              </Button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Stats Footer -->
  {#if !loading && users.length > 0}
    <div class="mt-6 pt-4 border-t border-slate-700">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-purple-400">{users.length}</div>
          <div class="text-sm text-gray-400">Total Users</div>
        </div>
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-blue-400">
            {users.filter(u => u.full_name).length}
          </div>
          <div class="text-sm text-gray-400">With Names</div>
        </div>
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-green-400">
            {users.filter(u => {
              const created = new Date(u.created_at);
              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 7);
              return created > weekAgo;
            }).length}
          </div>
          <div class="text-sm text-gray-400">New This Week</div>
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

<!-- Reset Password Modal (Admin Only) -->
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
          <strong>Warning:</strong> This will immediately change the user's password. They will need to use the new password to log in.
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

<!-- Manage Apps Modal (Admin Only) -->
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
                    <span class="font-medium">{app.name}</span>
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
