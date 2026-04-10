<!-- src/routes/v2walk/+page.svelte -->
<!-- Direct URL entry point for the V2 Walk mobile inspection tool (/v2walk).
     Handles auth guard. V2WalkApp is self-contained; use browser back to return to portal. -->
<script>
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import V2WalkApp from '$lib/apps/v2walk/V2WalkApp.svelte';

  // Redirect to login (with return URL) if not authenticated
  $: if (!$auth.loading && !$auth.user) {
    goto('/login?redirect=/v2walk');
  }
</script>

{#if $auth.user}
  <V2WalkApp />
{/if}
