<script>
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';

  import UserListApp from '$lib/apps/users/UserListApp.svelte';
  import IssuesTrackerApp from '$lib/apps/issues/IssuesTrackerApp.svelte'; 
  import DemoApp from '$lib/apps/demo/DemoApp.svelte';

  let activeApp = 'home';
  let menuOpen = false;

  const apps = [
    { id: 'home', name: 'Home', icon: 'home' },
    { id: 'app1', name: 'Users', icon: 'users' },
    { id: 'app2', name: 'Issues Log', icon: 'clipboard' },
    { id: 'app3', name: 'Demo App', icon: 'grid' },
    { id: 'settings', name: 'Settings', icon: 'settings' }
  ];

  $: if (!$auth.loading && !$auth.user) {
    goto('/login');
  }

  function handleLogout() {
    auth.logout();
  }
</script>

{#if $auth.loading}
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
            {#each apps as app}
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
          {#each apps as app}
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
          <h1 class="text-4xl font-bold mb-4">Welcome to the LH Apps Portal</h1>
          <p class="text-gray-400 mb-8">Select an app from the menu to get started.</p>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each apps.slice(1, -1) as app}
              <button
                on:click={() => activeApp = app.id}
                aria-label={`Open ${app.name}`}
                class="bg-slate-800 hover:bg-slate-700 p-6 rounded-xl transition-all hover:scale-105 border border-slate-700"
              >
                <Icon name={app.icon} size={12} className="text-purple-400 mb-4" />
                <h3 class="text-xl font-semibold">{app.name}</h3>
                <p class="text-gray-400 mt-2">Click to open {app.name.toLowerCase()}</p>
              </button>
            {/each}
          </div>
        </div>
      {:else if activeApp === 'app1'}
        <UserListApp />
      {:else if activeApp === 'app2'}
        <IssuesTrackerApp />
      {:else if activeApp === 'app3'}
        <DemoApp />
      {:else if activeApp === 'settings'}
        <div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
          <h2 class="text-3xl font-bold mb-4">Settings</h2>
          <p class="text-gray-400">Configure your portal settings here.</p>
        </div>
      {/if}
    </main>
  </div>
{/if}
