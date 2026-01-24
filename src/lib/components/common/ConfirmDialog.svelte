<!-- src/lib/components/common/ConfirmDialog.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  
  export let show = false;
  export let title = 'Confirm Action';
  export let message = 'Are you sure?';
  export let confirmText = 'Confirm';
  export let cancelText = 'Cancel';
  export let danger = false;
  export let processing = false;
  
  const dispatch = createEventDispatcher();
  
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      dispatch('cancel');
    }
  }
</script>

{#if show}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div 
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    on:click={() => dispatch('cancel')}
    on:keydown={handleKeydown}
  >
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div 
      class="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-slate-700 shadow-2xl"
      on:click|stopPropagation
      role="dialog"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-description"
    >
      <!-- Header -->
      <div class="flex items-start justify-between mb-4">
        <h3 id="dialog-title" class="text-xl font-bold text-white flex items-center gap-2">
          {#if danger}
            <Icon name="delete" size={6} className="text-red-400" />
          {/if}
          {title}
        </h3>
        <button
          on:click={() => dispatch('cancel')}
          class="p-1 hover:bg-slate-700 rounded transition-colors"
          aria-label="Close"
        >
          <Icon name="close" size={5} className="text-gray-400" />
        </button>
      </div>
      
      <!-- Message -->
      <p id="dialog-description" class="text-gray-300 mb-6">
        {message}
      </p>
      
      <!-- Actions -->
      <div class="flex space-x-3 justify-end">
        <button
          on:click={() => dispatch('cancel')}
          disabled={processing}
          class="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded transition-colors"
        >
          {cancelText}
        </button>
        <button
          on:click={() => dispatch('confirm')}
          disabled={processing}
          class="px-4 py-2 rounded transition-colors disabled:cursor-not-allowed {
            danger 
              ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-800' 
              : 'bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800'
          }"
        >
          {processing ? 'Processing...' : confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
