<script>
  import '../app.css';
  import { onMount } from 'svelte';
import { permissions } from '#lib/stores/permissions.js';
import { auth } from '#lib/stores/auth.js';

  onMount(() => {
    auth.initialize();
  });


$: if (!$auth.user) {
  permissions.clear();
}




</script>

<slot />
