<!-- src/lib/apps/walk/components/common/WalkConfirm.svelte -->
<!-- Mobile bottom-sheet confirmation overlay for the walk app. -->
<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let show        = false;
  export let title       = '';
  export let message     = '';
  export let confirmText = 'CONFIRM';
  export let cancelText  = 'CANCEL';
  export let danger      = false;

  function handleKeydown(e) {
    if (e.key === 'Escape') dispatch('cancel');
  }
</script>

{#if show}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="wc-backdrop" on:click={() => dispatch('cancel')} on:keydown={handleKeydown}>
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="wc-sheet"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={handleKeydown}
    >
      {#if title}
        <div class="wc-title">{title}</div>
      {/if}
      {#if message}
        <div class="wc-msg">{message}</div>
      {/if}
      <div class="wc-actions">
        <button
          class="wc-btn wc-confirm"
          class:wc-danger={danger}
          on:click={() => dispatch('confirm')}
        >
          {confirmText}
        </button>
        <button class="wc-btn wc-cancel" on:click={() => dispatch('cancel')}>
          {cancelText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .wc-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 50;
    display: flex; align-items: flex-end;
  }
  .wc-sheet {
    width: 100%; max-width: 480px; margin: 0 auto;
    background: #111122; border-top: 2px solid #2e2e42;
    border-radius: 16px 16px 0 0; padding: 1.5rem;
    display: flex; flex-direction: column; gap: 1rem;
    font-family: 'DM Mono', 'Courier New', monospace;
  }
  .wc-title {
    font-size: 0.78rem; font-weight: 700; letter-spacing: 0.15em; color: #f0f0f0;
  }
  .wc-msg {
    font-size: 0.875rem; color: #ccc; line-height: 1.5;
  }
  .wc-actions { display: flex; flex-direction: column; gap: 0.625rem; }
  .wc-btn {
    width: 100%; height: 52px; border-radius: 8px;
    font-family: inherit; font-size: 0.875rem; font-weight: 800;
    letter-spacing: 0.12em; cursor: pointer; transition: all 0.15s;
    border: 2px solid transparent;
  }
  .wc-confirm         { background: #fb923c; color: #0d0d14; border-color: #fb923c; }
  .wc-confirm:hover   { background: #f97316; border-color: #f97316; }
  .wc-confirm.wc-danger         { background: #7f1d1d; color: #f87171; border-color: #dc2626; }
  .wc-confirm.wc-danger:hover   { background: #991b1b; }
  .wc-cancel          { background: transparent; color: #ccc; border-color: #3e3e58; }
  .wc-cancel:hover    { color: #f0f0f0; border-color: #6e6e88; }
</style>
