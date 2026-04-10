<!-- src/routes/inspection/+page.svelte -->
<!-- Direct URL entry point for the Inspection mobile tool (/inspection).
     Handles auth guard. InspectionApp is self-contained; use browser back to return to portal. -->
<script>
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import InspectionApp from '$lib/apps/inspection/InspectionApp.svelte';

  // Redirect to login (with return URL) if not authenticated
  $: if (!$auth.loading && !$auth.user) {
    goto('/login?redirect=/inspection');
  }
</script>

{#if $auth.user}
  <InspectionApp />
{/if}
