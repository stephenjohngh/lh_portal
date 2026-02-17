<!-- src/routes/plans/+page.svelte -->
<script>
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { isAdmin as checkIsAdmin } from '$lib/utils/auth';
  import PlansApp from '$lib/apps/plans/PlansApp.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';

  // 'admin' | 'editor' | 'readonly' | null (still loading)
  let permissionLevel = null;
  let permissionLoaded = false;

  // React to auth changes - handles both initial load and session restore
  // This is the correct pattern: watch $auth.user reactively, not just onMount
  $: if ($auth.user && !permissionLoaded) {
    loadPermissions($auth.user.id);
  }

  // Redirect if auth has finished loading and there is no user
  $: if (!$auth.loading && !$auth.user) {
    goto('/login');
  }

  async function loadPermissions(userId) {
    // Guard against running twice
    permissionLoaded = true;

    try {
      // Admin check first
      const admin = await checkIsAdmin(userId);
      if (admin) {
        permissionLevel = 'admin';
        return;
      }

      // Check app_permissions for 'plans'
      const { data, error } = await supabase
        .from('app_permissions')
        .select('read_only')
        .eq('user_id', userId)
        .eq('app_id', 'plans')
        .single();

      if (error || !data) {
        // No permission entry - redirect home
        goto('/');
        return;
      }

      permissionLevel = data.read_only ? 'readonly' : 'editor';

    } catch (err) {
      goto('/');
    }
  }
</script>

{#if $auth.loading || !permissionLevel}
  <!-- Still resolving auth or permissions -->
  <div class="min-h-screen bg-slate-900 flex items-center justify-center">
    <div class="text-center">
      <Icon name="loading" size={12} className="animate-spin mx-auto mb-4 text-purple-400" />
      <p class="text-gray-400">Loading...</p>
    </div>
  </div>
{:else}
  <PlansApp {permissionLevel} />
{/if}
