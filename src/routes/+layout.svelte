<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';

  onMount(() => {
    auth.initialize();
  });
</script>

<slot />
