<!-- src/lib/components/common/FormTextarea.svelte -->
<script>
  export let label = '';
  export let value = '';
  export let placeholder = '';
  export let required = false;
  export let disabled = false;
  export let error = '';
  export let helpText = '';
  export let id = '';
  export let name = '';
  export let rows = 4;
  export let maxlength = null;
  export let textareaClass = '';

  // Generate ID if not provided
  $: elementId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
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
  
  <textarea
    id={elementId}
    {name}
    bind:value
    {placeholder}
    {required}
    {disabled}
    {rows}
    {maxlength}
    class="w-full px-3 py-2 bg-slate-700 border rounded-lg text-white placeholder-gray-400 
           focus:outline-none focus:ring-2 transition-all resize-y
           {error ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 focus:ring-purple-500'}
           {disabled ? 'opacity-50 cursor-not-allowed' : ''}
           {textareaClass}"
    on:input
    on:change
    on:focus
    on:blur
    on:keydown
    on:keyup
    on:keypress
  ></textarea>
  
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
  
  {#if maxlength}
    <p class="mt-1 text-sm text-gray-400 text-right">
      {value.length}/{maxlength}
    </p>
  {/if}
</div>
