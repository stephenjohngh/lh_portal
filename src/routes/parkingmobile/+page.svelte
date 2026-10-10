<!-- src/routes/parkingmobile/+page.svelte -->
<!-- Direct URL entry point for Parking (M) (/parkingmobile) — open it once with a
     signal and add it to the home screen; it then works in the basement without
     one. Handles the auth guard and goes back to the portal home. -->
<script>
  import { auth } from '#lib/stores/auth.js';
  import { goto } from '$app/navigation';
  import ParkingMobileApp from '#lib/apps/parkingmobile/ParkingMobileApp.svelte';

  $: if (!$auth.loading && !$auth.user) {
    goto('/login?redirect=/parkingmobile');
  }
</script>

{#if $auth.user}
  <ParkingMobileApp on:navigate={() => goto('/')} />
{/if}
