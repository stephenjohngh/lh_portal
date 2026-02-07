<script>
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { isAdmin as checkIsAdmin } from '$lib/utils/auth';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';

  import UserListApp from '$lib/apps/users/UserListApp.svelte';
  import IssuesTrackerApp from '$lib/apps/issues/IssuesTrackerApp.svelte'; 
  import DemoApp from '$lib/apps/demo/DemoApp.svelte';
  import SettingsApp from '$lib/apps/settings/SettingsApp.svelte';

  let activeApp = 'home';
  let menuOpen = false;
  let userApps = [];
  let isAdmin = false;
  let loading = true;

  // Define all available apps
  const allApps = [
    { id: 'home', name: 'Home', icon: 'home', alwaysVisible: true },
    { id: 'users', name: 'Users', icon: 'users', requiresPermission: true },
    { id: 'issues', name: 'Issues', icon: 'clipboard', requiresPermission: true },
    { id: 'demo', name: 'Demo', icon: 'grid', requiresPermission: true },
    { id: 'settings', name: 'Settings', icon: 'settings', alwaysVisible: true }
  ];

  // Apps to display in menu
  $: displayedApps = userApps;

  // Redirect if not authenticated
  $: if (!$auth.loading && !$auth.user) {
    goto('/login');
  }

  onMount(async () => {
    if ($auth.user) {
      await loadUserPermissions();
    }
  });

  // Reload permissions when user changes
  $: if ($auth.user) {
    loadUserPermissions();
  }

  async function loadUserPermissions() {
    loading = true;
    
    try {
      // Check if user is admin
      isAdmin = await checkIsAdmin($auth.user.id);

      // Get user's app permissions
      const { data: permissions, error } = await supabase
        .from('app_permissions')
        .select('app_id')
        .eq('user_id', $auth.user.id);

      if (error) {
        console.error('Error loading permissions:', error);
        throw error;
      }

      const permittedAppIds = (permissions || []).map(p => p.app_id);

      // Build list of apps user can access
      const apps = allApps.filter(app => {
        // Always show apps marked as alwaysVisible
        if (app.alwaysVisible) return true;
        
        // Show apps user has permission for
        if (app.requiresPermission && permittedAppIds.includes(app.id)) {
          return true;
        }
        
        return false;
      });

      userApps = apps;

      console.log('User permissions loaded');
      console.log('Is admin:', isAdmin);
      console.log('Permitted app IDs:', permittedAppIds);
      console.log('Displayed apps:', userApps.map(a => a.id));

    } catch (err) {
      console.error('Error loading user permissions:', err);
      // Show at least home and settings on error
      userApps = allApps.filter(app => app.alwaysVisible);
    } finally {
      loading = false;
    }
  }

  function handleLogout() {
    auth.logout();
  }

  // Get the component for the active app
  function getAppComponent(appId) {
    const components = {
      'users': UserListApp,
      'issues': IssuesTrackerApp,
      'demo': DemoApp,
      'settings': SettingsApp
    };
    return components[appId];
  }

  // Check if user has access to current app
  $: if (!loading && activeApp !== 'home' && !displayedApps.find(a => a.id === activeApp)) {
    // User doesn't have access to this app, redirect to home
    activeApp = 'home';
  }
</script>

{#if $auth.loading || loading}
  <div class="min-h-screen bg-slate-900 flex items-center justify-center">
    <div class="text-white text-xl">Loading...</div>
  </div>
{:else if $auth.user}
  <div class="min-h-screen bg-slate-900 text-white">
    <!-- Top Navigation Bar -->
    <nav class="bg-slate-800/50 backdrop-blur-lg border-b border-slate-700 sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center space-x-4">
            <!-- Mobile Menu Toggle -->
            <button
              on:click={() => menuOpen = !menuOpen}
              aria-label="Toggle menu"
              class="p-2 hover:bg-slate-700 rounded-lg transition-colors lg:hidden"
            >
              <Icon name="menu" size={6} />
            </button>
            
            <!-- Logo -->
            <div class="flex items-center space-x-2">
              <Icon name="grid" size={6} className="text-purple-400" />
              <span class="font-bold text-xl">LH Apps</span>
            </div>
          </div>

          <!-- Desktop Navigation -->
          <div class="hidden lg:flex items-center space-x-1">
            {#each displayedApps as app}
              <button
                on:click={() => activeApp = app.id}
                aria-label={app.name}
                class={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  activeApp === app.id
                    ? 'bg-purple-600 text-white'
                    : 'hover:bg-slate-700 text-gray-300'
                }`}
              >
                <Icon name={app.icon} size={5} />
                <span>{app.name}</span>
              </button>
            {/each}
          </div>

          <!-- User Info & Logout -->
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2">
              <Icon name="user" size={5} className="text-gray-400" />
              <span class="text-sm text-gray-300 hidden sm:block">{$auth.user.email}</span>
            </div>
            <Button
              variant="danger"
              size="medium"
              icon="logout"
              on:click={handleLogout}
            >
              <span class="hidden sm:block">Logout</span>
            </Button>
          </div>
        </div>
      </div>

      <!-- Mobile Menu -->
      {#if menuOpen}
        <div class="lg:hidden border-t border-slate-700 bg-slate-800">
          {#each displayedApps as app}
            <button
              on:click={() => {
                activeApp = app.id;
                menuOpen = false;
              }}
              aria-label={app.name}
              class={`flex items-center space-x-3 w-full px-4 py-3 transition-colors ${
                activeApp === app.id
                  ? 'bg-purple-600 text-white'
                  : 'hover:bg-slate-700 text-gray-300'
              }`}
            >
              <Icon name={app.icon} size={5} />
              <span>{app.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </nav>

    <!-- Main Content Area -->
    <main class="max-w-7xl mx-auto px-4 py-8">
      {#if activeApp === 'home'}
        <div>
          <h1 class="text-4xl font-bold mb-4">Welcome to LH Apps Portal</h1>
          <p class="text-gray-400 mb-8">
            {#if isAdmin}
              You're logged in as an administrator. Select an app from the menu to get started.
            {:else}
              Select an app from the menu to get started.
            {/if}
          </p>
          
          <!-- App Grid -->
          {#if displayedApps.filter(a => a.id !== 'home').length === 0}
            <div class="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
              <Icon name="grid" size={16} className="text-gray-600 mx-auto mb-4" />
              <h3 class="text-xl font-semibold mb-2">No Apps Available</h3>
              <p class="text-gray-400">
                You don't have access to any apps yet. Contact your administrator to request access.
              </p>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {#each displayedApps.filter(a => a.id !== 'home') as app}
                <button
                  on:click={() => activeApp = app.id}
                  aria-label={`Open ${app.name}`}
                  class="bg-slate-800 hover:bg-slate-700 p-6 rounded-xl transition-all hover:scale-105 border border-slate-700 hover:border-purple-500"
                >
                  <Icon name={app.icon} size={12} className="text-purple-400 mb-4" />
                  <h3 class="text-xl font-semibold">{app.name}</h3>
                  <p class="text-gray-400 mt-2 text-sm">
                    {#if app.id === 'users'}
                      Manage users and app permissions
                    {:else if app.id === 'issues'}
                      Track and manage issues
                    {:else if app.id === 'demo'}
                      Explore app components
                    {:else if app.id === 'settings'}
                      Update your account settings
                    {:else}
                      Click to open
                    {/if}
                  </p>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <!-- Dynamic App Component Loading -->
        {#if getAppComponent(activeApp)}
          <svelte:component this={getAppComponent(activeApp)} />
        {:else}
          <div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
            <h2 class="text-3xl font-bold mb-4">
              {displayedApps.find(a => a.id === activeApp)?.name || 'App'}
            </h2>
            <p class="text-gray-400">This app is not yet implemented.</p>
          </div>
        {/if}
      {/if}
    </main>
  </div>
{/if}
