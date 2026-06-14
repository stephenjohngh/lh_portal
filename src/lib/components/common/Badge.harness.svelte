<!-- Test-only wrapper for Badge.test.js (see Button.harness.svelte for why). -->
<script>
  import Badge from './Badge.svelte';
  export let text = 'Badge';
</script>

<Badge {...$$restProps}>{text}</Badge>
