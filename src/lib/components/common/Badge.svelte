<!-- src/lib/components/common/Badge.svelte -->
<script>
  export let color = 'bg-gray-600'; // Tailwind background color class
  export let size = 'medium'; // 'small', 'medium', 'large'
  export let className = '';

  const sizeClasses = {
    small: 'px-2 py-0.5 text-xs',
    medium: 'px-2 py-1 text-xs',
    large: 'px-3 py-1 text-sm'
  };

  $: badgeClasses = [
    'inline-flex items-center',
    'font-semibold rounded',
    'text-white',
    color,
    sizeClasses[size] || sizeClasses.medium,
    className
  ].filter(Boolean).join(' ');
</script>

<span class={badgeClasses}>
  <slot />
</span>
