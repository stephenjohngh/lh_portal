<!-- src/routes/inspection/+page.svelte -->
<!-- Direct URL entry point for the Inspection mobile tool (/inspection).
     Handles auth guard. InspectionApp is self-contained; use browser back to return to portal. -->
<script>
  import { auth } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { portalSettings } from '$lib/stores/portalSettings.js';
  import InspectionApp from '$lib/apps/inspection/InspectionApp.svelte';

  // The "due soon" windows an admin set (Admin → Due windows). Read in the
  // background, NOT waited for: this app works offline and on a weak signal,
  // and a walk must not wait on a setting. The start list reads the windows
  // from the store, so it recalculates when they arrive.
  let settingsFor = null;
  $: if ($auth.user?.id && $auth.user.id !== settingsFor) {
    settingsFor = $auth.user.id;
    portalSettings.load();
  }

  // Redirect to login (with return URL) if not authenticated
  $: if (!$auth.loading && !$auth.user) {
    goto('/login?redirect=/inspection');
  }
</script>

{#if $auth.user}
  <InspectionApp />
{/if}
