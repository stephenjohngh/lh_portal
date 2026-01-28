<script>
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';

  let email = '';
  let password = '';
  let error = '';
  let loading = false;

  async function handleLogin() {
    loading = true;
    error = '';
    
    const result = await auth.login(email, password);
    
    if (result.success) {
      goto('/');
    } else {
      error = result.error;
    }
    
    loading = false;
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
  <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 w-full max-w-md border border-white/20 shadow-2xl">
    <div class="text-center mb-8">
      <div class="inline-block p-3 bg-purple-500/20 rounded-full mb-4">
        <svg class="w-8 h-8 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z"/>
        </svg>
      </div>
      <h1 class="text-3xl font-bold text-white mb-2">LH Portal</h1>
      <p class="text-gray-300">Sign in to access your apps</p>
    </div>

    <div class="space-y-4">
      <div>
        <label for="email" class="block text-sm font-medium text-gray-200 mb-2">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="your@email.com"
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium text-gray-200 mb-2">Password</label>
        <input

          id="password"
          type="password"
          bind:value={password}
          class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="••••••••"
        />
      </div>

      {#if error}
        <p class="text-red-400 text-sm">{error}</p>
      {/if}

      <button
        on:click={handleLogin}
        disabled={loading}
        class="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white font-semibold py-3 rounded-lg transition-colors"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </div>
  </div>
</div>
