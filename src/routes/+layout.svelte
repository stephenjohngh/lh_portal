<script>
  import '../app.css';
  import { onMount } from 'svelte';
import { permissions } from '$lib/stores/permissions';
import { auth } from '$lib/stores/auth';

  onMount(() => {
    auth.initialize();
  });


$: if (!$auth.user) {
  permissions.clear();
}




</script>

<slot />
