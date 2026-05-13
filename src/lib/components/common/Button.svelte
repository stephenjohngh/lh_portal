<!-- src/lib/components/common/Button.svelte -->
<script>
  import Icon from '$lib/components/icons/Icon.svelte';

  // Props
  export let variant = 'primary'; // 'primary', 'amber', 'blue', 'green', 'secondary', 'danger'
  export let size = 'medium'; // 'small', 'medium', 'large'
  export let icon = ''; // Icon name from Icon.svelte
  export let iconPosition = 'left'; // 'left', 'right', 'only'
  export let disabled = false;
  export let loading = false;
  export let type = 'button';
  export let fullWidth = false;
  export let className = ''; // Additional custom classes
  export let title = '';

  // Color variant styles
  const variantStyles = {
    primary: 'bg-purple-500 hover:bg-purple-600 disabled:bg-purple-700',
    amber: 'bg-amber-600 hover:bg-amber-500 disabled:bg-amber-700', // Actions accent — matches amber-400/500 border colours
    blue: 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800',
    green: 'bg-green-600 hover:bg-green-700 disabled:bg-green-800',
    secondary: 'bg-slate-600 hover:bg-slate-700 disabled:bg-slate-800',
    danger: 'text-red-400 hover:bg-red-600/20 disabled:opacity-50'
  };

  // Size styles
  const sizeStyles = {
    small: 'px-3 py-1 text-sm',
    medium: 'px-3 py-1.5 text-sm',
    large: 'px-4 py-2 text-base'
  };

  // Icon sizes
  const iconSizes = {
    small: 4,
    medium: 4,
    large: 5
  };

  // Computed classes
  $: buttonClasses = [
    'inline-flex items-center justify-center',
    'font-medium rounded-lg',
    'transition-colors duration-200',
    'focus:outline-none',
    'disabled:cursor-not-allowed',
    fullWidth ? 'w-full' : '',
    variantStyles[variant] || variantStyles.primary,
    sizeStyles[size] || sizeStyles.medium,
    className
  ].filter(Boolean).join(' ');

  $: iconSize = iconSizes[size] || iconSizes.medium;

  $: showText = iconPosition !== 'only' && $$slots.default;
  $: showIcon = icon || loading;
</script>

<button
  {type}
  {disabled}
  {title}
  class={buttonClasses}
  on:click
  on:mousedown
  on:mouseup
  on:mouseenter
  on:mouseleave
  on:focus
  on:blur
>
  {#if showIcon && (iconPosition === 'left' || iconPosition === 'only')}
    <span class={showText ? 'mr-2' : ''}>
      {#if loading}
        <Icon name="refresh" size={iconSize} className="animate-spin" />
      {:else if icon}
        <Icon name={icon} size={iconSize} />
      {/if}
    </span>
  {/if}

  {#if showText}
    <slot />
  {/if}

  {#if showIcon && iconPosition === 'right'}
    <span class="ml-2">
      {#if loading}
        <Icon name="refresh" size={iconSize} className="animate-spin" />
      {:else if icon}
        <Icon name={icon} size={iconSize} />
      {/if}
    </span>
  {/if}
</button>
