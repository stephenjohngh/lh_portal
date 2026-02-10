<!-- src/lib/components/common/ErrorDisplay.svelte -->
<!-- Standardized error display component with consistent styling -->
<script>
  import Icon from '$lib/components/icons/Icon.svelte';
  
  export let message = '';
  export let onDismiss = null;
  export let variant = 'error'; // 'error' | 'warning' | 'info'
  export let className = '';
  
  $: variantStyles = {
    error: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/50',
      text: 'text-red-400',
      icon: 'alert'
    },
    warning: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/50',
      text: 'text-amber-400',
      icon: 'alert'
    },
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/50',
      text: 'text-blue-400',
      icon: 'info'
    }
  };
  
  $: styles = variantStyles[variant] || variantStyles.error;
</script>

{#if message}
  <div 
    class="mb-4 p-4 {styles.bg} border {styles.border} rounded-lg flex items-start justify-between gap-3 {className}"
    role="alert"
  >
    <!-- Icon and Message -->
    <div class="flex items-start gap-3 flex-1 min-w-0">
      <Icon 
        name={styles.icon} 
        size={5} 
        className="{styles.text} flex-shrink-0 mt-0.5" 
      />
      <p class="{styles.text} text-sm flex-1">
        {message}
      </p>
    </div>
    
    <!-- Dismiss Button -->
    {#if onDismiss}
      <button
        on:click={onDismiss}
        class="{styles.text} hover:opacity-80 transition-opacity flex-shrink-0"
        aria-label="Dismiss"
        type="button"
      >
        <Icon name="close" size={5} />
      </button>
    {/if}
  </div>
{/if}
