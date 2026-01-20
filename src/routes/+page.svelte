<script>
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';

  let activeApp = 'home';
  let menuOpen = false;

  const apps = [
    { id: 'home', name: 'Home', icon: 'home' },
    { id: 'app1', name: 'App One', icon: 'grid' },
    { id: 'app2', name: 'App Two', icon: 'grid' },
    { id: 'app3', name: 'App Three', icon: 'grid' },
    { id: 'settings', name: 'Settings', icon: 'settings' }
  ];

  $: if (!$auth.loading && !$auth.user) {
    goto('/login');
  }

  function handleLogout() {
    auth.logout();
  }

  function getIcon(icon) {
    const icons = {
      home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
      grid: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z',
      settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
      logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
      menu: 'M4 6h16M4 12h16M4 18h16',
      user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
    };
    return icons[icon] || icons.grid;
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
            <button
              on:click={() => menuOpen = !menuOpen}
              class="p-2 hover:bg-slate-700 rounded-lg transition-colors lg:hidden"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon('menu')} />
              </svg>
            </button>
            <div class="flex items-center space-x-2">
              <svg class="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon('grid')} />
              </svg>
              <span class="font-bold text-xl">Portal</span>
            </div>
          </div>

          <!-- Desktop Navigation -->
          <div class="hidden lg:flex items-center space-x-1">
            {#each apps as app}
              <button
                on:click={() => activeApp = app.id}
                class={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  activeApp === app.id
                    ? 'bg-purple-600 text-white'
                    : 'hover:bg-slate-700 text-gray-300'
                }`}
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(app.icon)} />
                </svg>
                <span>{app.name}</span>
              </button>
            {/each}
          </div>

          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2">
              <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon('user')} />
              </svg>
              <span class="text-sm text-gray-300 hidden sm:block">{$auth.user.email}</span>
            </div>
            <button
              on:click={handleLogout}
              class="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon('logout')} />
              </svg>
              <span class="hidden sm:block">Logout</span>
            </button>
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
              class={`flex items-center space-x-3 w-full px-4 py-3 transition-colors ${
                activeApp === app.id
                  ? 'bg-purple-600 text-white'
                  : 'hover:bg-slate-700 text-gray-300'
              }`}
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(app.icon)} />
              </svg>
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
          <h1 class="text-4xl font-bold mb-4">Welcome to Your Portal</h1>
          <p class="text-gray-400 mb-8">Select an app from the menu to get started.</p>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each apps.slice(1, -1) as app}
              <button
                on:click={() => activeApp = app.id}
                class="bg-slate-800 hover:bg-slate-700 p-6 rounded-xl transition-all hover:scale-105 border border-slate-700"
              >
                <svg class="w-12 h-12 text-purple-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getIcon(app.icon)} />
                </svg>
                <h3 class="text-xl font-semibold">{app.name}</h3>
                <p class="text-gray-400 mt-2">Click to open {app.name.toLowerCase()}</p>
              </button>
            {/each}
          </div>
        </div>
      {:else if activeApp === 'app1'}
        <div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
          <h2 class="text-3xl font-bold mb-4">App One</h2>
          <p class="text-gray-400">This is the content area for App One. Replace with your actual app component.</p>
        </div>
      {:else if activeApp === 'app2'}
        <div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
          <h2 class="text-3xl font-bold mb-4">App Two</h2>
          <p class="text-gray-400">This is the content area for App Two. Replace with your actual app component.</p>
        </div>
      {:else if activeApp === 'app3'}
        <div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
          <h2 class="text-3xl font-bold mb-4">App Three</h2>
          <p class="text-gray-400">This is the content area for App Three. Replace with your actual app component.</p>
        </div>
      {:else if activeApp === 'settings'}
        <div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
          <h2 class="text-3xl font-bold mb-4">Settings</h2>
          <p class="text-gray-400">Configure your portal settings here.</p>
        </div>
      {/if}
    </main>
  </div>
{/if}
