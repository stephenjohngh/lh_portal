<!-- src/lib/components/common/FormInput.svelte -->
<script>
  export let label = '';
  export let value = '';
  export let type = 'text';
  export let placeholder = '';
  export let required = false;
  export let disabled = false;
  export let error = '';
  export let helpText = '';
  export let id = '';
  export let name = '';
  export let autocomplete = '';
  export let maxlength = null;
  export let pattern = null;
  export let inputClass = '';

  // Generate ID if not provided
  $: elementId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
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
  
  <input
    {type}
    id={elementId}
    {name}
    bind:value
    {placeholder}
    {required}
    {disabled}
    {autocomplete}
    {maxlength}
    {pattern}
    class="w-full px-3 py-2 bg-slate-700 border rounded-lg text-white placeholder-gray-400 
           focus:outline-none focus:ring-2 transition-all
           {error ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 focus:ring-purple-500'}
           {disabled ? 'opacity-50 cursor-not-allowed' : ''}
           {inputClass}"
    on:input
    on:change
    on:focus
    on:blur
    on:keydown
    on:keyup
    on:keypress
  />
  
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
