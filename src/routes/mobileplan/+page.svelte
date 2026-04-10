<!-- src/routes/mobileplan/+page.svelte -->
<!-- Direct URL entry point for the Mobile Plan viewer (/mobileplan).
     Handles auth guard and redirects back to portal home on back navigation. -->
<script>
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import MobilePlanApp from '$lib/apps/mobileplan/MobilePlanApp.svelte';

  // Redirect to login (with return URL) if not authenticated
  $: if (!$auth.loading && !$auth.user) {
    goto('/login?redirect=/mobileplan');
  }
</script>

{#if $auth.user}
  <MobilePlanApp on:navigate={() => goto('/')} />
{/if}
