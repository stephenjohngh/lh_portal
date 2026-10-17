<!-- src/routes/parking/check/+page.svelte -->
<!-- Direct URL entry point for Car check (/parking/check, 2026-10-17): the
     caretaker's bookmark — scan a plate, see whether the car may be here.
     Handles the sign-in guard; PlateCheck checks the Parking grant. -->
<script>
  import { onMount } from 'svelte';
  import { auth } from '#lib/stores/auth.js';
  import { goto } from '$app/navigation';
  import PlateCheck from '#lib/apps/parking/components/PlateCheck.svelte';

  $: if (!$auth.loading && !$auth.user) {
    goto('/login?redirect=/parking/check');
  }

  // "Add to Home Screen" from here opens Car check, not the portal's home:
  // the site's manifest starts at "/", so this page points at its own.
  onMount(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    const was = link.getAttribute('href');
    link.setAttribute('href', '/car-check.webmanifest');
    return () => { if (was) link.setAttribute('href', was); };
  });
</script>

<svelte:head>
  <title>Car check</title>
  <meta name="apple-mobile-web-app-title" content="Car check" />
</svelte:head>

{#if $auth.user}
  <PlateCheck />
{/if}
