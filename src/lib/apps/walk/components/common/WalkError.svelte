<!-- src/lib/apps/walk/components/common/WalkError.svelte -->
<!-- Standardised error display for the walk app's dark mono theme. -->
<!-- Hidden automatically when message is empty. -->
<script>
  export let message   = '';
  export let onDismiss = null;
</script>

{#if message}
  <div class="walk-error" role="alert">
    <span class="walk-error-icon">⚠</span>
    <p class="walk-error-msg">{message}</p>
    {#if onDismiss}
      <button class="walk-error-dismiss" on:click={onDismiss} type="button" aria-label="Dismiss">✕</button>
    {/if}
  </div>
{/if}

<style>
  .walk-error {
    display: flex; align-items: flex-start; gap: 0.625rem;
    padding: 0.875rem 1rem;
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid rgba(248, 113, 113, 0.4);
    border-radius: 8px;
    font-family: 'DM Mono', 'Courier New', monospace;
    font-size: 0.875rem;
    color: #f87171;
  }
  .walk-error-icon  { flex-shrink: 0; margin-top: 0.05rem; }
  .walk-error-msg   { flex: 1; margin: 0; line-height: 1.5; }
  .walk-error-dismiss {
    flex-shrink: 0; background: none; border: none;
    color: #f87171; cursor: pointer; font-size: 0.875rem;
    padding: 0; opacity: 0.7; transition: opacity 0.15s;
  }
  .walk-error-dismiss:hover { opacity: 1; }
</style>
