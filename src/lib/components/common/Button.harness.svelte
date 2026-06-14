<!-- Test-only wrapper for Button.test.js.
     @testing-library/svelte v5 dropped the `slots` render option, so slot
     content is provided here; all other props pass through via $$restProps. -->
<script>
  import Button from './Button.svelte';
  export let text = 'Button';
</script>

<Button {...$$restProps} on:click>{text}</Button>
