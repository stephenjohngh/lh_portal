<!-- src/lib/components/common/Badge.svelte -->
<script>
  export let variant = 'default'; 
  // default, primary, success, warning, danger, info
  export let size = 'sm'; // xs, sm, md
  export let icon = ''; 
  export let outline = false;
  export let className = '';

  const variantStyles = {
    default: outline 
      ? 'bg-gray-100 text-gray-700 border-gray-200' 
      : 'bg-gray-600 text-white',
    primary: outline 
      ? 'bg-purple-100 text-purple-700 border-purple-200' 
      : 'bg-purple-600 text-white',
    success: outline 
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
      : 'bg-emerald-600 text-white',
    warning: outline 
      ? 'bg-amber-100 text-amber-700 border-amber-200' 
      : 'bg-amber-600 text-white',
    danger: outline 
      ? 'bg-red-100 text-red-700 border-red-300' 
      : 'bg-red-600 text-white',
    info: outline 
      ? 'bg-blue-100 text-blue-700 border-blue-200' 
      : 'bg-blue-600 text-white'
  };

  const sizeStyles = {
    xs: 'text-xs px-1.5 py-0.5',
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5'
  };

  $: badgeClasses = [
    'inline-flex items-center rounded font-semibold',
    outline ? 'border' : '',
    variantStyles[variant] || variantStyles.default,
    sizeStyles[size] || sizeStyles.sm,
    className
  ].filter(Boolean).join(' ');
</script>

<span class={badgeClasses}>
  {#if icon}
    <span class="mr-1">{icon}</span>
  {/if}
  <slot />
</span>
