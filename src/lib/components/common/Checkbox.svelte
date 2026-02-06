<!-- src/lib/components/common/Checkbox.svelte -->
<script>
  export let checked = false;
  export let label = '';
  export let disabled = false;
  export let id = '';
  export let name = '';
  export let className = '';

  // Generate ID if not provided
  $: elementId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;
</script>

<div class="flex items-center {className}">
  <input
    type="checkbox"
    {id}
    {name}
    bind:checked
    {disabled}
    class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
    on:change
  />
  {#if label}
    <label 
      for={elementId}
      class="ml-2 text-sm text-gray-300 cursor-pointer {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
    >
      {label}
    </label>
  {/if}
</div>
