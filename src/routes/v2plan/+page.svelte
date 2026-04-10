<!-- src/routes/v2plan/+page.svelte -->
<!-- Direct URL entry point for the V2 Plan mobile viewer (/v2plan).
     Handles auth guard and redirects back to portal home on back navigation. -->
<script>
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import V2PlanApp from '$lib/apps/v2plan/V2PlanApp.svelte';

  // Redirect to login (with return URL) if not authenticated
  $: if (!$auth.loading && !$auth.user) {
    goto('/login?redirect=/v2plan');
  }
</script>

{#if $auth.user}
  <V2PlanApp on:navigate={() => goto('/')} />
{/if}
