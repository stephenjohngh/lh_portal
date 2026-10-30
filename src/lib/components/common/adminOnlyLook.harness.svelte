<script>
  import Button from './Button.svelte';
  import ProtectedButton from './ProtectedButton.svelte';
  export let kind = 'plain';
  export let admin = false;
  export let variant = 'primary';
  export let requireAdmin = false;
</script>

{#if kind === 'plain'}
  <Button {admin} {variant}>Go</Button>
{:else}
  <ProtectedButton {requireAdmin} {variant}>Go</ProtectedButton>
{/if}
