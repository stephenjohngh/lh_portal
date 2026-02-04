<!-- src/lib/components/common/FormSelect.svelte -->
<script>
  export let label = '';
  export let value = '';
  export let options = []; // Array of {value, label} or simple strings
  export let placeholder = '-- Select an option --';
  export let required = false;
  export let disabled = false;
  export let error = '';
  export let helpText = '';
  export let id = '';
  export let name = '';
  export let selectClass = '';

  // Generate ID if not provided
  $: elementId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

  // Normalize options to {value, label} format
  $: normalizedOptions = options.map(opt => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });
</script>

<div class="mb-4">
  {#if label}
    <label 
      for={elementId} 
      class="block text-sm font-medium mb-2 text-gray-200"
    >
      {label}
      {#if required}
        <span class="text-red-400">*</span>
      {/if}
    </label>
  {/if}
  
  <select
    id={elementId}
    {name}
    bind:value
    {required}
    {disabled}
    class="w-full px-3 py-2 bg-slate-700 border rounded-lg text-white 
           focus:outline-none focus:ring-2 transition-all
           {error ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 focus:ring-purple-500'}
           {disabled ? 'opacity-50 cursor-not-allowed' : ''}
           {selectClass}"
    on:change
    on:focus
    on:blur
  >
    {#if placeholder}
      <option value="" disabled selected={!value}>
        {placeholder}
      </option>
    {/if}
    
    {#each normalizedOptions as option}
      <option value={option.value}>
        {option.label}
      </option>
    {/each}
  </select>
  
  {#if helpText && !error}
    <p class="mt-1 text-sm text-gray-400">
      {helpText}
    </p>
  {/if}
  
  {#if error}
    <p class="mt-1 text-sm text-red-400">
      {error}
    </p>
  {/if}
</div>
