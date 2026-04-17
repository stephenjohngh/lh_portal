<script>
  // src/lib/apps/mobileplan/components/PlanView.svelte
  // Pan/zoom plan image container with gesture handling.
  // Hosts MarkerOverlay and FAB buttons.

  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { createGestureHandlers } from '../utils/gestures.js';
  import MarkerOverlay from './MarkerOverlay.svelte';

  export let plan          = null;   // { image_url, image_aspect_ratio } | null
  export let components    = [];
  export let spaces        = [];
  export let annotations   = [];
  export let types         = [];
  export let hiddenTypes   = new Set();
  export let hiddenStatuses = new Set();
  export let showSpaces    = true;
  export let loadingFloor  = false;
  export let selectedId    = null;

  const dispatch = createEventDispatcher();

  // -- Transform state ---------------------------------------------------------

  let tx = 0, ty = 0, scale = 1;
  const MIN_SCALE = 0.4;
  const MAX_SCALE = 8;

  let container;        // outer clipping div
  let planEl;           // the transformed div
  let imgEl;            // the plan image element
  let imgLoaded = false;
  let longPressId = null;

  // Fit scale: fills viewport width
  let fitScale = 1;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function computeFitScale() {
    if (!container || !imgEl) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = imgEl.naturalWidth  || imgEl.clientWidth;
    const ih = imgEl.naturalHeight || imgEl.clientHeight;
    if (!iw || !ih) return;

    const sw = cw / iw;
    const sh = ch / ih;
    fitScale = Math.min(sw, sh, 1);  // never scale up beyond 1:1 on initial fit
    scale = fitScale;
    tx = (cw - iw * fitScale) / 2;
    ty = 0;
  }

  function zoomToPoint(newScale, cx, cy) {
    newScale = clamp(newScale, MIN_SCALE, MAX_SCALE);
    const ratio = newScale / scale;
    tx = cx - ratio * (cx - tx);
    ty = cy - ratio * (cy - ty);
    scale = newScale;
  }

  function applyPanBounds() {
    if (!container || !imgEl) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = imgEl.naturalWidth  * scale;
    const ih = imgEl.naturalHeight * scale;

    const margin = 0.25; // 25% of viewport must remain visible
    tx = clamp(tx, -iw * (1 - margin), cw * (1 - margin));
    ty = clamp(ty, -ih * (1 - margin), ch * (1 - margin));
  }

  // -- Gesture callbacks --------------------------------------------------------

  function onPan(dx, dy) {
    tx += dx;
    ty += dy;
    applyPanBounds();
  }

  function onZoom(factor, cx, cy) {
    zoomToPoint(scale * factor, cx, cy);
  }

  function onTap(x, y, target) {
    // Check if a marker was tapped
    const markerEl = target?.closest?.('[data-component-id]');
    if (markerEl) {
      const cid = markerEl.dataset.componentId;
      const c   = components.find(c => c.id === cid);
      if (c) {
        dispatch('markerTap', c);
        return;
      }
    }
    // Tap on blank plan — dismiss any open sheet
    dispatch('planTap');
  }

  function onDoubleTap(x, y) {
    if (scale < 2) {
      zoomToPoint(3, x, y);
    } else {
      // Reset to fit
      scale = fitScale;
      if (container && imgEl) {
        tx = (container.clientWidth - imgEl.naturalWidth * fitScale) / 2;
      } else {
        tx = 0;
      }
      ty = 0;
    }
  }

  function onLongPress(x, y, target) {
    const markerEl = target?.closest?.('[data-component-id]');
    if (markerEl) {
      const cid = markerEl.dataset.componentId;
      const c   = components.find(c => c.id === cid);
      if (c) {
        longPressId = cid;
        dispatch('markerLongPress', c);
        setTimeout(() => { longPressId = null; }, 600);
        return;
      }
    }
  }

  const gestures = createGestureHandlers({ onPan, onZoom, onTap, onDoubleTap, onLongPress });

  // -- Centre on a specific component ------------------------------------------

  export function centreOnComponent(component) {
    if (!container || !imgEl) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = imgEl.naturalWidth;

    // Zoom to 3× if currently near fit; clamp at current if already zoomed
    const targetScale = Math.max(scale < fitScale * 1.5 ? 3 : scale, 2);

    // Position component in upper third of viewport
    tx = cw / 2 - component.x_position * iw * targetScale;
    ty = ch * 0.35 - component.y_position * (imgEl.naturalHeight) * targetScale;
    scale = targetScale;
    applyPanBounds();
  }

  // -- Lifecycle ----------------------------------------------------------------

  let resizeObserver;

  onMount(() => {
    resizeObserver = new ResizeObserver(() => computeFitScale());
    if (container) resizeObserver.observe(container);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
  });

  function handleImgLoad() {
    imgLoaded = true;
    computeFitScale();
  }

  // Prevent native scroll/zoom on the plan container
  function handleWheel(e) {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const cx   = e.clientX - rect.left;
    const cy   = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    zoomToPoint(scale * factor, cx, cy);
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="plan-container"
  bind:this={container}
  on:touchstart|nonpassive={gestures.handleTouchStart}
  on:touchmove|nonpassive={gestures.handleTouchMove}
  on:touchend={gestures.handleTouchEnd}
  on:wheel|nonpassive={handleWheel}
>
  {#if loadingFloor}
    <div class="plan-placeholder">
      <div class="spinner"></div>
      <p>Loading floor…</p>
    </div>

  {:else if !plan}
    <div class="plan-placeholder">
      <p class="no-plan-msg">No plan for this floor</p>
      <p class="no-plan-sub">Use the list (☰) to browse components</p>
    </div>

  {:else}
    <!-- Transformed plan content -->
    <div
      class="plan-transformed"
      bind:this={planEl}
      style="transform: translate({tx}px, {ty}px) scale({scale}); transform-origin: 0 0;"
    >
      <img
        src={plan.image_url}
        alt="Floor plan"
        bind:this={imgEl}
        on:load={handleImgLoad}
        class:hidden={!imgLoaded}
        draggable="false"
      />

      {#if imgLoaded}
        <MarkerOverlay
          {components}
          {spaces}
          {annotations}
          {types}
          {hiddenTypes}
          {hiddenStatuses}
          {showSpaces}
          {selectedId}
          {longPressId}
          on:markerTap={e => dispatch('markerTap', e.detail)}
          on:markerLongPress={e => dispatch('markerLongPress', e.detail)}
        />
      {/if}
    </div>
  {/if}

  <!-- FAB: Unplaced / All components list -->
  <button class="fab" on:click={() => dispatch('openList')} aria-label="View all components">
    ☰
  </button>
</div>

<style>
  .plan-container {
    position: relative;
    flex: 1;
    overflow: hidden;
    background: #0d0d14;
    touch-action: none;
    user-select: none;
  }

  .plan-transformed {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
  }

  .plan-transformed img {
    display: block;
    max-width: none;  /* allow natural size */
    pointer-events: none;
  }

  .plan-transformed img.hidden {
    visibility: hidden;
  }

  .plan-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #64748b;
    font-family: 'DM Mono', monospace;
  }

  .no-plan-msg {
    font-size: 16px;
    color: #e2e8f0;
    margin: 0;
  }

  .no-plan-sub {
    font-size: 13px;
    margin: 0;
  }

  .spinner {
    width: 36px;
    height: 36px;
    border: 3px solid #252540;
    border-top-color: #2dd4bf;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* FAB */
  .fab {
    position: absolute;
    bottom: 20px;
    right: 16px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #1a1a2e;
    border: 1px solid #252540;
    color: #e2e8f0;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    z-index: 20;
    transition: background 0.15s;
    touch-action: manipulation;
  }

  @media (hover: hover) {
    .fab:hover {
      background: #252540;
    }
  }
</style>
