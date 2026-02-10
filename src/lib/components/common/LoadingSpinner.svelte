<!-- src/lib/components/common/LoadingSpinner.svelte -->
<!-- Standardized loading spinner with consistent styling and sizes -->
<script>
  export let size = 'large'; // 'small' | 'medium' | 'large'
  export let text = '';
  export let className = '';
  export let centered = true; // Center in container
  
  const sizes = {
    small: {
      spinner: 'h-6 w-6',
      padding: 'py-4'
    },
    medium: {
      spinner: 'h-8 w-8',
      padding: 'py-8'
    },
    large: {
      spinner: 'h-12 w-12',
      padding: 'py-12'
    }
  };
  
  $: sizeConfig = sizes[size] || sizes.large;
</script>

<div 
  class="{centered ? 'flex flex-col items-center justify-center' : ''} {sizeConfig.padding} {className}"
  role="status"
  aria-live="polite"
  aria-label={text || 'Loading...'}
>
  <!-- Spinner -->
  <div 
    class="animate-spin rounded-full {sizeConfig.spinner} border-b-2 border-purple-500"
    aria-hidden="true"
  ></div>
  
  <!-- Optional Text -->
  {#if text}
    <p class="mt-3 text-gray-400 text-sm">
      {text}
    </p>
  {/if}
  
  <!-- Screen reader text -->
  <span class="sr-only">Loading...</span>
</div>

<style>
  /* Ensure sr-only is accessible */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
