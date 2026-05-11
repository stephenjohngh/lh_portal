<!-- src/routes/+page.svelte -->
<!-- Updated to use apps.js config from $lib/apps/apps -->
<script>
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { isAdmin as checkIsAdmin } from '$lib/utils/auth';
  import { getLogger } from '$lib/utils/logger';
  import { AVAILABLE_APPS, getAppsForUser } from '$lib/apps/apps';
  import { portalSettings } from '$lib/stores/portalSettings.js';
  import { DB_OVERRIDE_KEY, isDbOverride, activeDbUrl } from '$lib/supabaseClient';
  // Optional var — import.meta.env returns undefined (not an error) when unset.
  // $env/static/public would throw if the variable isn't defined in .env.
  const PUBLIC_ENV_LABEL = import.meta.env.PUBLIC_ENV_LABEL ?? '';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import lhLogo from '$lib/assets/LH_services_logo.png';

  const logger = getLogger('MainApp');

  import AdminApp from '$lib/apps/admin/AdminApp.svelte';
  import ManagementApp from '$lib/apps/management/ManagementApp.svelte';
  import DemoApp from '$lib/apps/demo/DemoApp.svelte';
  import Demo from '$lib/apps/demo/Demo.svelte';
  import SettingsApp from '$lib/apps/settings/SettingsApp.svelte';
  import BuildingAssetsApp from '$lib/apps/building_assets/BuildingAssetsApp.svelte';
  import InspectionApp from '$lib/apps/inspection/InspectionApp.svelte';
  import MobilePlanApp from '$lib/apps/mobileplan/MobilePlanApp.svelte';
  import MaintenanceApp from '$lib/apps/maintenance/MaintenanceApp.svelte';

  let activeApp = 'home';
  let menuOpen = false;
  let userApps = [];
  let isAdmin = false;
  let loading = true;

  const allApps = AVAILABLE_APPS;

  // All apps the user can access (home page grid)
  $: displayedApps = userApps;

  // Subset of displayedApps shown in the top bar, controlled by portal_settings
  $: topbarApps = (() => {
    const { loaded, ids } = $portalSettings;
    if (!loaded || ids === null) return displayedApps;   // no config = show all
    // Preserve displayedApps order while filtering to pinned IDs
    return displayedApps.filter(a => ids.includes(a.id));
  })();

  $: if (!$auth.loading && !$auth.user) {
    goto('/login');
  }

  // Load permissions once per distinct user ID.
  // Using a tracked ID guard prevents re-running on token refresh or other
  // auth events that update the store object without changing the user.
  let lastPermissionsUserId = null;

  $: if ($auth.user && $auth.user.id !== lastPermissionsUserId) {
    lastPermissionsUserId = $auth.user.id;
    loadUserPermissions();
  }

  $: if (!$auth.user) {
    lastPermissionsUserId = null;
  }

  async function loadUserPermissions() {
    loading = true;
    
    try {
      isAdmin = await checkIsAdmin($auth.user.id);

      const { data: permissions, error } = await supabase
        .from('app_permissions')
        .select('app_id')
        .eq('user_id', $auth.user.id);

      if (error) {
        logger('Error loading permissions:', error);
        throw error;
      }

      const permittedAppIds = (permissions || []).map(p => p.app_id);
      userApps = getAppsForUser(permittedAppIds);

      // Load top-bar config (non-blocking — store defaults to "show all" on error)
      portalSettings.load();

      logger('User permissions loaded');
      logger('Is admin:', isAdmin);
      logger('Permitted app IDs:', permittedAppIds);
      logger('Displayed apps:', userApps.map(a => a.id));

    } catch (err) {
      logger('Error loading user permissions:', err);
      userApps = getAppsForUser([]);
    } finally {
      loading = false;
    }
  }

  function handleLogout() {
    auth.logout();
  }

  function getAppComponent(appId) {
    const components = {
      'admin': AdminApp,
      'management': ManagementApp,
      'demo': DemoApp,
      'demo2': Demo,
      'settings': SettingsApp,
      'building_assets': BuildingAssetsApp,
      'inspection': InspectionApp,
      'mobileplan':  MobilePlanApp,
      'maintenance': MaintenanceApp
    };
    return components[appId];
  }

  $: if (!loading && activeApp !== 'home' && !displayedApps.find(a => a.id === activeApp)) {
    activeApp = 'home';
  }
</script>

{#if $auth.loading || loading}
  <div class="min-h-screen bg-slate-900 flex items-center justify-center">
    <div class="text-white text-xl">Loading...</div>
  </div>
{:else if $auth.user}
  <div class="min-h-screen bg-slate-900 text-white">
    <nav class="bg-purple-900 backdrop-blur-lg border-b border-purple-800/60 sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center space-x-4">
            <button
              on:click={() => menuOpen = !menuOpen}
              aria-label="Toggle menu"
              class="p-2 hover:bg-purple-800/70 rounded-lg transition-colors lg:hidden"
            >
              <Icon name="menu" size={6} />
            </button>

            <button
              on:click={() => activeApp = 'home'}
              class="flex items-center space-x-2 hover:opacity-80 transition-opacity"
              aria-label="Go to home"
            >
              <img src={lhLogo} alt="LH Services" class="h-12 w-auto" />
                          </button>
          </div>

          <div class="hidden lg:flex items-center space-x-1">
            {#each topbarApps as app}
              <button
                on:click={() => activeApp = app.id}
                aria-label={app.name}
                class={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  activeApp === app.id
                    ? 'bg-purple-700 text-white'
                    : 'hover:bg-purple-800/70 text-purple-200'
                }`}
              >
                <Icon name={app.icon} size={5} />
                <span>{app.name}</span>
              </button>
            {/each}
          </div>

          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2">
              <Icon name="user" size={5} className="text-purple-300" />
              <span class="text-sm text-purple-200 hidden sm:block">{$auth.user.email}</span>
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

      {#if menuOpen}
        <div class="lg:hidden border-t border-purple-800/60 bg-purple-950">
          {#each topbarApps as app}
            <button
              on:click={() => {
                activeApp = app.id;
                menuOpen = false;
              }}
              aria-label={app.name}
              class={`flex items-center space-x-3 w-full px-4 py-3 transition-colors ${
                activeApp === app.id
                  ? 'bg-purple-700 text-white'
                  : 'hover:bg-purple-800/70 text-purple-200'
              }`}
            >
              <Icon name={app.icon} size={8} />
              <span>{app.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </nav>

    <!-- DB override banner — only shown when localStorage override is active -->
    {#if isDbOverride}
      <div class="bg-amber-500/15 border-b border-amber-500/40 px-4 py-2">
        <div class="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div class="flex items-center gap-2 text-amber-300 text-sm">
            <span class="text-base">⚠</span>
            <span>
              <strong>Override database active</strong> — connected to
              <code class="text-xs bg-amber-900/40 px-1.5 py-0.5 rounded font-mono">{activeDbUrl}</code>
              instead of the production config.
            </span>
          </div>
          <button
            class="text-xs text-amber-300 hover:text-white border border-amber-500/50 hover:border-amber-400 px-3 py-1 rounded transition-colors whitespace-nowrap"
            on:click={() => {
              localStorage.removeItem(DB_OVERRIDE_KEY);
              window.location.href = '/';
            }}
          >
            Reset to Default
          </button>
        </div>
      </div>
    {/if}

    <!-- Test environment banner — baked at build time via PUBLIC_ENV_LABEL -->
    {#if PUBLIC_ENV_LABEL && PUBLIC_ENV_LABEL !== 'production'}
      <div class="bg-teal-500/10 border-b border-teal-500/30 px-4 py-1.5">
        <div class="max-w-7xl mx-auto text-center text-xs text-teal-300">
          🧪 <strong>{PUBLIC_ENV_LABEL.toUpperCase()}</strong> environment — {activeDbUrl}
        </div>
      </div>
    {/if}

    <main class="max-w-7xl mx-auto px-4 py-8">
      {#if activeApp === 'home'}
        <div>
          <h1 class="text-4xl font-bold mb-4">LH Services Portal</h1>
          <p class="text-gray-400 mb-8">
            {#if isAdmin}
              You're logged in as an administrator. Select an app from the menu to get started.
            {:else}
              Select an app from the menu to get started.
            {/if}
          </p>
          
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
                    {app.description || 'Click to open'}
                  </p>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        {#if getAppComponent(activeApp)}
          <svelte:component this={getAppComponent(activeApp)} on:navigate={e => activeApp = e.detail} />
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
