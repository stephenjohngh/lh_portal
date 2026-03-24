<!-- src/lib/apps/walk/components/common/WalkTextarea.svelte -->
<!-- Textarea for the walk app's dark mono theme. -->
<script>
  export let value       = '';
  export let label       = '';
  export let placeholder = '';
  export let rows        = 4;
  export let disabled    = false;
  export let maxlength   = null;
  export let helpText    = '';

  let uid = `wt-${Math.random().toString(36).slice(2, 7)}`;
</script>

<div class="wt-wrap">
  {#if label}
    <label class="wt-label" for={uid}>{label}</label>
  {/if}
  <textarea
    id={uid}
    bind:value
    {rows}
    {placeholder}
    {disabled}
    {maxlength}
    class="wt-ta"
    on:input
    on:change
    on:keydown
    on:blur
  ></textarea>
  {#if maxlength}
    <p class="wt-count">{value?.length ?? 0}/{maxlength}</p>
  {:else if helpText}
    <p class="wt-help">{helpText}</p>
  {/if}
</div>

<style>
  .wt-wrap  { display: flex; flex-direction: column; gap: 0.375rem; }
  .wt-label { font-size: 0.65rem; letter-spacing: 0.12em; color: #ccc; font-family: 'DM Mono', 'Courier New', monospace; }
  .wt-ta {
    width: 100%; box-sizing: border-box;
    padding: 0.875rem 1rem;
    background: #111122; border: 1.5px solid #2e2e42; border-radius: 8px;
    color: #f0f0f0; font-family: 'DM Mono', 'Courier New', monospace;
    font-size: 0.875rem; resize: vertical;
    transition: border-color 0.15s, box-shadow 0.15s;
    line-height: 1.5;
  }
  .wt-ta::placeholder { color: #555; }
  .wt-ta:focus {
    outline: none; border-color: #fb923c;
    box-shadow: 0 0 0 2px rgba(251,146,60,0.2);
  }
  .wt-ta:disabled { opacity: 0.5; cursor: not-allowed; }
  .wt-count { margin: 0; font-size: 0.7rem; color: #666; font-family: 'DM Mono', 'Courier New', monospace; text-align: right; }
  .wt-help  { margin: 0; font-size: 0.72rem; color: #888; font-family: 'DM Mono', 'Courier New', monospace; }
</style>
