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
  /** Only an administrator sees this field: amber on brown. */
  export let admin = false;
  /** For an in-line field with no label above it: no bottom margin, smaller. */
  export let compact = false;
  /**
   * id of a <datalist> to offer as suggestions — a native combobox: the field
   * stays free text, but values already used are one keystroke away. The
   * caller owns the <datalist> element.
   * @type {string|null}
   */
  export let list = null;
  /**
   * Number and date bounds. Callers passed min="1" for weeks and the input
   * never received it: a prop the component does not declare is dropped
   * silently, so the Planner's "every N" accepted 0 and negatives (2026-10-02).
   */
  /** @type {string|number|null} */
  export let min = null;
  /** @type {string|number|null} */
  export let max = null;
  /** @type {string|number|null} */
  export let step = null;

  // Generate ID if not provided
  $: elementId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
</script>

<div class={compact ? '' : 'mb-4'}>
  {#if label}
    <label 
      for={elementId} 
      class="block text-sm font-medium mb-2 {admin ? 'admin-only-label' : 'text-gray-200'}"
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
    {list}
    {min}
    {max}
    {step}
    class="w-full {compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-2'} rounded-lg placeholder-gray-400
           focus:outline-none focus:ring-2 transition-all
           {admin ? 'admin-only' : 'bg-slate-700 border text-white'}
           {error ? 'border-red-500 focus:ring-red-500' : admin ? '' : 'border-slate-600 focus:ring-purple-500'}
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
