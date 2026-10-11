<!-- src/lib/components/common/Button.svelte -->
<script>
  import Icon from '#lib/components/icons/Icon.svelte';

  // Props
  export let variant = 'primary'; // 'primary', 'amber', 'blue', 'green', 'secondary', 'tertiary', 'danger'
  export let size = 'medium'; // 'xs', 'small', 'medium', 'large'
  export let icon = ''; // Icon name from Icon.svelte
  export let iconPosition = 'left'; // 'left', 'right', 'only'
  export let disabled = false;
  export let loading = false;
  export let type = 'button';
  export let fullWidth = false;
  export let className = ''; // Additional custom classes
  export let title = '';

  // Color variant styles. `purple-*` IS the portal accent (teal, via
  // tailwind.config.js and theme.js). Every variant carries a border so an
  // outlined button and a solid one are the same size side by side.
  //
  // ⭐ `secondary` follows the colour scheme (user, 2026-10-10: "a lot of the
  // buttons don't seem to be using our colour scheme"): a teal OUTLINE — teal
  // border and text on the dark background — where it used to be solid grey.
  // Main actions stay solid teal (`primary`), so the two still read apart.
  // `danger` is the same shape in red.
  const variantStyles = {
    primary: 'border-transparent bg-purple-500 hover:bg-purple-600 disabled:bg-purple-700',
    amber: 'border-transparent bg-amber-600 hover:bg-amber-500 disabled:bg-amber-700', // Actions accent — matches amber-400/500 border colours
    blue: 'border-transparent bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800',
    green: 'border-transparent bg-green-600 hover:bg-green-700 disabled:bg-green-800',
    secondary: 'border-purple-500/70 bg-transparent text-purple-300 hover:bg-purple-500/15 hover:text-purple-200 '
      + 'disabled:border-slate-600 disabled:text-slate-500 disabled:hover:bg-transparent',
    // ⭐ `tertiary` — the small in-line actions ("Clear", "Set all", "Use default",
    // "+ Add event"), which used to be teal text written by hand in each screen
    // and so never followed a change of look (user, 2026-10-11). A fainter teal
    // outline than secondary, so the two still read apart. Change it HERE and
    // every one follows. Usually with size="xs".
    tertiary: 'border-purple-500/40 bg-transparent text-purple-300 hover:border-purple-500/70 hover:bg-purple-500/10 '
      + 'hover:text-purple-200 disabled:border-slate-700 disabled:text-slate-500 disabled:hover:bg-transparent',
    // Red outline, matching secondary's teal outline (user, 2026-10-10:
    // "can the terminate button also have an outline in red").
    danger: 'border-red-500/70 bg-transparent text-red-400 hover:bg-red-600/20 hover:text-red-300 disabled:opacity-50'
  };

  // Size styles
  const sizeStyles = {
    xs: 'px-2 py-0.5 text-xs',
    small: 'px-3 py-1 text-sm',
    medium: 'px-3 py-1.5 text-sm',
    large: 'px-4 py-2 text-base'
  };

  // Icon sizes
  const iconSizes = {
    xs: 3,
    small: 4,
    medium: 4,
    large: 5
  };

  // Computed classes
  $: buttonClasses = [
    'inline-flex items-center justify-center border',
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
