<!-- src/lib/apps/walk/components/common/WalkCheckbox.svelte -->
<!-- Large-touch-target checkbox for the walk app's dark mono theme. -->
<script>
  export let checked  = false;
  export let label    = '';
  export let disabled = false;
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<label class="wc-row" class:wc-disabled={disabled} on:click|preventDefault={() => { if (!disabled) checked = !checked; }}>
  <div class="wc-box" class:wc-checked={checked} aria-hidden="true">
    {#if checked}<span class="wc-tick">✓</span>{/if}
  </div>
  {#if label}
    <span class="wc-label">{label}</span>
  {/if}
  <input type="checkbox" bind:checked {disabled} class="wc-hidden" on:change />
</label>

<style>
  .wc-row {
    display: flex; align-items: center; gap: 0.75rem;
    min-height: 44px; cursor: pointer;
    font-family: 'DM Mono', 'Courier New', monospace;
  }
  .wc-disabled { opacity: 0.5; cursor: not-allowed; }
  .wc-box {
    width: 24px; height: 24px; flex-shrink: 0;
    border: 2px solid #2e2e42; border-radius: 4px;
    background: #111122; display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, border-color 0.15s;
  }
  .wc-checked { background: #22c55e; border-color: #22c55e; }
  .wc-tick    { color: #0d0d14; font-size: 1rem; font-weight: 800; line-height: 1; }
  .wc-label   { font-size: 0.95rem; color: #f0f0f0; font-weight: 600; }
  .wc-hidden  {
    position: absolute; opacity: 0; width: 0; height: 0;
    pointer-events: none;
  }
</style>
