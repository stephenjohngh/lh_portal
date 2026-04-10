<script>
  // src/lib/apps/mobileplan/components/ActionSheet.svelte
  // Long-press context menu for a component marker.
  // Shows: View details | Copy reference | Centre on plan | Cancel

  import { createEventDispatcher } from 'svelte';

  export let component = null;  // component row
  export let types     = [];

  const dispatch = createEventDispatcher();

  function getType(typeCode) {
    return types.find(t => t.code === typeCode) ?? null;
  }

  $: type = component ? getType(component?.type_code) : null;

  $: title = component
    ? `${component.asset_id ?? '—'}${type ? ' — ' + type.name : ''}`
    : '';

  function viewDetails() {
    dispatch('viewDetails', component);
    dispatch('close');
  }

  function copyReference() {
    const ref = component?.linked_component_ref ?? component?.asset_id ?? '';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(ref).catch(() => {});
    }
    dispatch('close');
  }

  function centreOnPlan() {
    dispatch('centreOnPlan', component);
    dispatch('close');
  }

  function cancel() {
    dispatch('close');
  }
</script>

{#if component}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={cancel}></div>

  <div class="action-sheet" role="dialog" aria-modal="true" aria-label="Component actions">
    <div class="action-title">{title}</div>

    <button class="action-row" on:click={viewDetails}>
      <span class="action-icon">👁</span>
      <span class="action-label">View details</span>
    </button>

    <button class="action-row" on:click={copyReference}>
      <span class="action-icon">⎘</span>
      <span class="action-label">Copy reference</span>
    </button>

    {#if component.plan_id != null}
      <button class="action-row" on:click={centreOnPlan}>
        <span class="action-icon">⌖</span>
        <span class="action-label">Centre on plan</span>
      </button>
    {/if}

    <div class="action-separator"></div>

    <button class="action-row cancel-row" on:click={cancel}>
      <span class="action-label">Cancel</span>
    </button>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 60;
  }

  .action-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: #1a1a2e;
    border-radius: 16px 16px 0 0;
    z-index: 70;
    max-width: 480px;
    margin: 0 auto;
    padding-bottom: env(safe-area-inset-bottom, 0);
    overflow: hidden;
  }

  .action-title {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    text-align: center;
    padding: 14px 16px 10px;
    border-bottom: 1px solid #252540;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .action-row {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-height: 52px;
    padding: 0 20px;
    background: transparent;
    border: none;
    border-bottom: 1px solid #252540;
    color: #e2e8f0;
    font-family: 'DM Mono', monospace;
    font-size: 15px;
    cursor: pointer;
    touch-action: manipulation;
    text-align: left;
    transition: background 0.1s;
  }

  .action-row:last-child {
    border-bottom: none;
  }

  @media (hover: hover) {
    .action-row:hover {
      background: #252540;
    }
  }

  .action-icon {
    font-size: 18px;
    width: 24px;
    text-align: center;
    color: #2dd4bf;
  }

  .action-label {
    flex: 1;
  }

  .action-separator {
    height: 8px;
    background: #0d0d14;
  }

  .cancel-row {
    justify-content: center;
    color: #64748b;
  }

  .cancel-row .action-label {
    flex: none;
  }
</style>
