<!-- src/lib/components/common/Checkbox.svelte -->
<script>
  export let checked = false;
  export let label = '';
  export let disabled = false;
  export let color = 'blue'; // blue, green, purple
  export let size = 'md'; // sm, md, lg
  export let className = '';

  const colorStyles = {
    blue: 'text-blue-600 focus:ring-blue-500',
    green: 'text-green-600 focus:ring-green-500',
    purple: 'text-purple-600 focus:ring-purple-500'
  };

  const sizeStyles = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  $: checkboxClasses = [
    'rounded border-gray-600 bg-slate-700',
    colorStyles[color] || colorStyles.blue,
    sizeStyles[size] || sizeStyles.md,
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
  ].join(' ');

  $: labelClasses = [
    'flex items-center space-x-2 text-sm text-gray-300',
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    className
  ].filter(Boolean).join(' ');
</script>

<label class={labelClasses}>
  <input
    type="checkbox"
    bind:checked
    {disabled}
    class={checkboxClasses}
    on:change
    on:click
  />
  {#if label}
    <span>{label}</span>
  {:else}
    <slot />
  {/if}
</label>
