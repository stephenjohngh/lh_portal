<!-- Test harness for AppGate.test.js: the gate with something inside it. -->
<script>
  import AppGate from './AppGate.svelte';
  export let appId = 'demo';
  export let name = 'Demo';
  export let load = null;
  export let requireGrant = false;
  export let alreadyLoaded = false;
  let ready = false;
</script>

<span data-testid="ready">{ready ? 'ready' : 'waiting'}</span>
<AppGate {appId} {name} {load} {requireGrant} {alreadyLoaded} bind:ready>
  <p data-testid="app-body">the app</p>
</AppGate>
