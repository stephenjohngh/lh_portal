<!-- src/lib/apps/inspection/components/common/WalkInput.svelte -->
<!-- Text input for the walk app's dark mono theme. -->
<script>
  export let value       = '';
  export let label       = '';
  export let placeholder = '';
  export let type        = 'text';
  export let disabled    = false;
  export let error       = '';
  export let helpText    = '';
  export let maxlength   = null;

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  let uid = `wi-${Math.random().toString(36).slice(2, 7)}`;
</script>

<div class="wi-wrap">
  {#if label}
    <label class="wi-label" for={uid}>{label}</label>
  {/if}
  <input
    id={uid}
    {type}
    bind:value
    {placeholder}
    {disabled}
    {maxlength}
    class="wi-input"
    class:wi-error={!!error}
    on:input
    on:change
    on:keydown
    on:blur
  />
  {#if error}
    <p class="wi-help wi-help-error">{error}</p>
  {:else if helpText}
    <p class="wi-help">{helpText}</p>
  {/if}
</div>

<style>
  .wi-wrap  { display: flex; flex-direction: column; gap: 0.375rem; }
  .wi-label { font-size: 0.65rem; letter-spacing: 0.12em; color: #ccc; font-family: 'DM Mono', 'Courier New', monospace; }
  .wi-input {
    width: 100%; box-sizing: border-box;
    min-height: 44px; padding: 0.75rem 1rem;
    background: #111122; border: 1.5px solid #2e2e42; border-radius: 8px;
    color: #f0f0f0; font-family: 'DM Mono', 'Courier New', monospace;
    font-size: 0.875rem; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .wi-input::placeholder { color: #555; }
  .wi-input:focus {
    outline: none; border-color: #fb923c;
    box-shadow: 0 0 0 2px rgba(251,146,60,0.2);
  }
  .wi-input:disabled { opacity: 0.5; cursor: not-allowed; }
  .wi-input.wi-error { border-color: #ef4444; }
  .wi-input.wi-error:focus { box-shadow: 0 0 0 2px rgba(239,68,68,0.2); }
  .wi-help            { margin: 0; font-size: 0.72rem; color: #888; font-family: 'DM Mono', 'Courier New', monospace; }
  .wi-help-error      { color: #f87171; }
</style>
