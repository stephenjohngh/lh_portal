<script>
  // src/lib/apps/v2plan/components/FloorBar.svelte
  // Horizontally scrollable floor pill selector.
  // Speculatively prefetches adjacent floors after 1s of hovering.

  import { onMount, tick } from 'svelte';
  import { v2planStore }   from '../stores/v2planStore.js';

  export let floors         = [];
  export let currentFloor   = null;
  export let loadingFloor   = false;

  let bar;
  let prefetchTimer = null;

  function selectFloor(floor) {
    if (loadingFloor) return;
    v2planStore.selectFloor(floor.id);
  }

  function startPrefetch(floor) {
    prefetchTimer = setTimeout(() => {
      v2planStore.prefetchFloor(floor.id);
    }, 1000);
  }

  function cancelPrefetch() {
    if (prefetchTimer) {
      clearTimeout(prefetchTimer);
      prefetchTimer = null;
    }
  }

  // Auto-scroll the active pill into view whenever currentFloor changes
  $: if (currentFloor && bar) {
    tick().then(() => {
      const active = bar.querySelector('[data-active="true"]');
      if (active) {
        active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });
  }
</script>

<div class="floor-bar" bind:this={bar} role="tablist" aria-label="Floor selector">
  {#each floors as floor (floor.id)}
    <button
      role="tab"
      data-active={currentFloor?.id === floor.id ? 'true' : 'false'}
      aria-selected={currentFloor?.id === floor.id}
      class="floor-pill"
      class:active={currentFloor?.id === floor.id}
      disabled={loadingFloor}
      on:click={() => selectFloor(floor)}
      on:mouseenter={() => startPrefetch(floor)}
      on:mouseleave={cancelPrefetch}
      on:touchstart|passive={() => startPrefetch(floor)}
      on:touchend={cancelPrefetch}
    >
      {floor.short_name}
    </button>
  {/each}
</div>

<style>
  .floor-bar {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    height: 48px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    background: #1a1a2e;
    border-bottom: 1px solid #252540;
    flex-shrink: 0;
  }

  .floor-bar::-webkit-scrollbar {
    display: none;
  }

  .floor-pill {
    flex-shrink: 0;
    min-width: 44px;
    min-height: 36px;
    padding: 0 14px;
    border-radius: 18px;
    border: 1px solid #252540;
    background: transparent;
    color: #64748b;
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    white-space: nowrap;
    touch-action: manipulation;
  }

  .floor-pill.active {
    background: #2dd4bf;
    border-color: #2dd4bf;
    color: #0d0d14;
    font-weight: 700;
  }

  .floor-pill:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (hover: hover) {
    .floor-pill:not(.active):not(:disabled):hover {
      background: #252540;
      color: #e2e8f0;
      border-color: #2dd4bf;
    }
  }
</style>
