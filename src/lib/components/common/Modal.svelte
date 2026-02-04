<!-- src/lib/components/common/Modal.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Icon from '$lib/components/icons/Icon.svelte';

  export let show = false;
  export let title = '';
  export let size = 'medium'; // 'small', 'medium', 'large', 'xlarge'
  export let showClose = true;

  const dispatch = createEventDispatcher();

  function close() {
    show = false;
    dispatch('close');
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && show) {
      close();
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      close();
    }
  }

  const sizeClasses = {
    small: 'max-w-md',
    medium: 'max-w-2xl',
    large: 'max-w-4xl',
    xlarge: 'max-w-6xl'
  };
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
  <div
    class="fixed inset-0 z-50 overflow-y-auto"
    on:click={handleBackdropClick}
    on:keydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-black bg-opacity-50 transition-opacity"></div>

    <!-- Modal Container -->
    <div class="flex min-h-full items-center justify-center p-4">
      <!-- Modal Content -->
      <div 
        class="relative w-full {sizeClasses[size]} bg-slate-800 rounded-xl shadow-2xl border border-slate-700 transform transition-all"
      >
        <!-- Header -->
        {#if title || showClose}
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-700">
            <h2 id="modal-title" class="text-xl font-bold text-white">
              {title}
            </h2>
            {#if showClose}
              <button
                on:click={close}
                class="text-gray-400 hover:text-white transition-colors rounded-lg p-1 hover:bg-slate-700"
                aria-label="Close modal"
              >
                <Icon name="x" class="w-6 h-6" />
              </button>
            {/if}
          </div>
        {/if}

        <!-- Body -->
        <div class="px-6 py-4">
          <slot />
        </div>

        <!-- Footer (optional) -->
        {#if $$slots.footer}
          <div class="px-6 py-4 border-t border-slate-700 bg-slate-800/50">
            <slot name="footer" />
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Ensure modal appears above everything */
  :global(body:has(.fixed.z-50)) {
    overflow: hidden;
  }
</style>
