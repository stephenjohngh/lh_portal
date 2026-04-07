<!-- src/lib/apps/v2walk/components/common/WalkSelect.svelte -->
<!-- Select dropdown for the walk app's dark mono theme. -->
<script>
  export let value       = '';
  export let label       = '';
  export let options     = [];  // [{ value, label }] or string[]
  export let placeholder = '— Select —';
  export let disabled    = false;
  export let error       = '';

  $: normalised = options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  let uid = `ws-${Math.random().toString(36).slice(2, 7)}`;
</script>

<div class="ws-wrap">
  {#if label}
    <label class="ws-label" for={uid}>{label}</label>
  {/if}
  <div class="ws-select-wrap">
    <select
      id={uid}
      bind:value
      {disabled}
      class="ws-select"
      class:ws-error={!!error}
      on:change
    >
      {#if placeholder}
        <option value="" disabled selected={!value}>{placeholder}</option>
      {/if}
      {#each normalised as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
    <span class="ws-chevron" aria-hidden="true">▾</span>
  </div>
  {#if error}
    <p class="ws-help ws-help-error">{error}</p>
  {/if}
</div>

<style>
  .ws-wrap        { display: flex; flex-direction: column; gap: 0.375rem; }
  .ws-label       { font-size: 0.65rem; letter-spacing: 0.12em; color: #ccc; font-family: 'DM Mono', 'Courier New', monospace; }
  .ws-select-wrap { position: relative; }
  .ws-select {
    width: 100%; box-sizing: border-box;
    min-height: 44px; padding: 0.75rem 2.25rem 0.75rem 1rem;
    background: #111122; border: 1.5px solid #2e2e42; border-radius: 8px;
    color: #f0f0f0; font-family: 'DM Mono', 'Courier New', monospace;
    font-size: 0.875rem; appearance: none; cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .ws-select:focus {
    outline: none; border-color: #fb923c;
    box-shadow: 0 0 0 2px rgba(251,146,60,0.2);
  }
  .ws-select:disabled { opacity: 0.5; cursor: not-allowed; }
  .ws-select.ws-error { border-color: #ef4444; }
  .ws-chevron {
    position: absolute; right: 0.875rem; top: 50%; transform: translateY(-50%);
    color: #fb923c; font-size: 0.75rem; pointer-events: none;
  }
  .ws-help            { margin: 0; font-size: 0.72rem; color: #888; font-family: 'DM Mono', 'Courier New', monospace; }
  .ws-help-error      { color: #f87171; }
</style>
