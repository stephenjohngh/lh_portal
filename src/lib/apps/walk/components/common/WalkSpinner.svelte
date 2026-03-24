<!-- src/lib/apps/walk/components/common/WalkSpinner.svelte -->
<!-- Loading spinner for the walk app's dark mono theme. -->
<script>
  export let size = 'md';  // 'sm'|'md'|'lg'
  export let text = '';

  const px = { sm: '20px', md: '32px', lg: '48px' };
  $: spinSize = px[size] ?? px.md;
</script>

<div class="walk-spinner-wrap" role="status" aria-label={text || 'Loading…'}>
  <div class="walk-spinner" style="width: {spinSize}; height: {spinSize}"></div>
  {#if text}
    <p class="walk-spinner-text">{text}</p>
  {/if}
  <span class="sr-only">Loading…</span>
</div>

<style>
  .walk-spinner-wrap {
    display: flex; flex-direction: column; align-items: center;
    gap: 0.625rem;
    font-family: 'DM Mono', 'Courier New', monospace;
  }
  .walk-spinner {
    border: 2px solid #2e2e42;
    border-top-color: #fb923c;
    border-radius: 50%;
    animation: walk-spin 0.7s linear infinite;
  }
  @keyframes walk-spin { to { transform: rotate(360deg); } }
  .walk-spinner-text {
    font-size: 0.8rem; color: #888; letter-spacing: 0.06em; margin: 0;
  }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0;
    margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
    white-space: nowrap; border-width: 0;
  }
</style>
