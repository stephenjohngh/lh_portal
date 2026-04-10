<!-- src/lib/apps/inspection/components/common/WalkButton.svelte -->
<!-- Primary interactive button for the walk app's dark mono theme. -->
<script>
  // variant: 'primary'|'secondary'|'danger'|'ghost'|'success'
  export let variant  = 'primary';
  // size: 'sm'|'md'|'lg'|'full'
  export let size     = 'md';
  export let disabled = false;
  export let loading  = false;
  export let type     = 'button';
</script>

<button
  {type}
  disabled={disabled || loading}
  class="wb wb-{variant} wb-{size}"
  on:click
  on:mousedown
>
  {#if loading}
    <span class="wb-spinner"></span>
  {/if}
  <slot />
</button>

<style>
  .wb {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
    border-radius: 8px; font-family: 'DM Mono', 'Courier New', monospace;
    font-weight: 700; letter-spacing: 0.1em; cursor: pointer;
    transition: all 0.15s; border: 2px solid transparent;
    white-space: nowrap;
  }
  .wb:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Variants */
  .wb-primary   { background: #fb923c; color: #0d0d14; border-color: #fb923c; }
  .wb-primary:hover:not(:disabled)   { background: #f97316; border-color: #f97316; }

  .wb-secondary { background: #1a1a2e; color: #f0f0f0; border-color: #3e3e58; }
  .wb-secondary:hover:not(:disabled) { border-color: #6e6e88; }

  .wb-danger    { background: #7f1d1d; color: #f87171; border-color: #dc2626; }
  .wb-danger:hover:not(:disabled)    { background: #991b1b; }

  .wb-ghost     { background: transparent; color: #ccc; border-color: #3e3e58; }
  .wb-ghost:hover:not(:disabled)     { color: #f0f0f0; border-color: #6e6e88; }

  .wb-success   { background: #14532d; color: #22c55e; border-color: #22c55e; }
  .wb-success:hover:not(:disabled)   { background: #166534; }

  /* Sizes */
  .wb-sm   { height: 36px; padding: 0 1rem;    font-size: 0.75rem; }
  .wb-md   { height: 44px; padding: 0 1.25rem; font-size: 0.875rem; }
  .wb-lg   { height: 52px; padding: 0 1.5rem;  font-size: 1rem; }
  .wb-full { height: 52px; padding: 0 1.5rem;  font-size: 1rem; width: 100%; }

  /* Loading spinner */
  .wb-spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: wb-spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes wb-spin { to { transform: rotate(360deg); } }
</style>
