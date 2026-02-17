<!-- src/routes/plans/+page.svelte -->
<script>
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { isAdmin as checkIsAdmin } from '$lib/utils/auth';
  import PlansApp from '$lib/apps/plans/PlansApp.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';

  // null = not yet loaded, then 'admin' | 'editor' | 'readonly'
  let permissionLevel = null;
  let loading = false; // tracks whether loadPermissions is in flight

  // Fires whenever auth resolves. The `loading` guard prevents double-runs.
  $: if ($auth.user && !$auth.loading && permissionLevel === null && !loading) {
    loadPermissions($auth.user.id);
  }

  $: if (!$auth.loading && !$auth.user) {
    goto('/login');
  }

  async function loadPermissions(userId) {
    loading = true;
    try {
      const admin = await checkIsAdmin(userId);
      if (admin) {
        permissionLevel = 'admin';
        console.log('[PlansRoute] permissionLevel set to: admin');
        return;
      }

      const { data, error } = await supabase
        .from('app_permissions')
        .select('read_only')
        .eq('user_id', userId)
        .eq('app_id', 'plans')
        .single();

      if (error || !data) {
        goto('/');
        return;
      }

      permissionLevel = data.read_only ? 'readonly' : 'editor';
      console.log('[PlansRoute] permissionLevel set to:', permissionLevel, '(read_only was:', data.read_only, ')');
    } catch (err) {
      goto('/');
    } finally {
      loading = false;
    }
  }
</script>

{#if $auth.loading || permissionLevel === null}
  <div class="min-h-screen bg-slate-900 flex items-center justify-center">
    <div class="text-center">
      <Icon name="loading" size={12} className="animate-spin mx-auto mb-4 text-purple-400" />
      <p class="text-gray-400">Loading...</p>
    </div>
  </div>
{:else}
  <PlansApp {permissionLevel} />
{/if}
