<!-- src/lib/apps/inspection/components/InspectionComponentPlanViewer.svelte -->
<!-- Modal showing current component's location on the floor plan image.
     Only shown when currentComponent.plan_id is set (component is placed). -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { drawComponentOnPlan } from '$lib/utils/planMarker.js';

  const dispatch = createEventDispatcher();

  export let component;   // Current component — needs plan_id, x_position, y_position, asset_id
  export let plan;        // Plan object with image_url
  export let componentRef = '';   // canonical ref "7/L/02" (same as the card/inspect)
  export let type         = null; // component_types row — for the type name

  let canvas;
  let imageLoaded = false;
  let error       = null;

  // The drawing lives in $lib/utils/planMarker.js, shared with Building Assets'
  // works schedules. Only the picture is shared — this app's chrome stays its
  // own, which is why the accent and the marker centre are passed in.
  onMount(async () => {
    try {
      await drawComponentOnPlan(canvas, {
        imageUrl: plan?.image_url,
        x: component.x_position,
        y: component.y_position,
        accent: '#fb923c',
        markerFill: '#0d0d14',
      });
      imageLoaded = true;
    } catch (err) {
      error = err.message;
    }
  });

</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click={() => dispatch('close')}>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true" tabindex="-1">

    <div class="mhdr">
      <div class="mhdr-info">
        <div class="mhdr-ref">{componentRef || component.asset_id || 'Component'}</div>
        <div class="mhdr-meta">
          {#if type}<span class="mhdr-type">{type.name}</span>{/if}
          {#if component.label}<span class="mhdr-label">{component.label}</span>{/if}
        </div>
      </div>
      <button class="close-btn" on:click={() => dispatch('close')}>✕</button>
    </div>

    <div class="mbody">
      {#if error}
        <div class="msg-box err">⚠ {error}</div>
      {:else if !imageLoaded}
        <div class="msg-box loading">Loading plan…</div>
      {/if}

      <div class="canvas-wrap">
        <canvas bind:this={canvas}></canvas>
      </div>

      {#if component.x_position == null || component.y_position == null}
        <div class="msg-box warn">
          <strong>Position not set</strong><br>
          Use the Plans app to place this component on the floor plan.
        </div>
      {/if}
    </div>

    <div class="mftr">
      <button class="done-btn" on:click={() => dispatch('close')}>CLOSE</button>
    </div>

  </div>
</div>

<style>
  .backdrop {
    position:fixed; inset:0; z-index:200;
    background:rgba(0,0,0,0.85);
    display:flex; align-items:center; justify-content:center; padding:1rem;
    animation:fadeIn 0.15s ease-out;
  }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }

  .modal {
    background:#0d0d14; border:2px solid #2e2e42; border-radius:12px;
    max-width:600px; width:100%; display:flex; flex-direction:column;
    max-height:90vh; font-family:'DM Mono','Courier New',monospace;
    animation:slideUp 0.2s ease-out;
  }
  @keyframes slideUp { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }

  .mhdr {
    display:flex; align-items:center; justify-content:space-between;
    padding:1rem 1.25rem; border-bottom:1px solid #2e2e42;
  }
  .mhdr-info  { min-width:0; }
  .mhdr-ref   { font-size:1rem; font-weight:700; color:#f0f0f0; font-variant-numeric:tabular-nums; letter-spacing:0.02em; }
  .mhdr-meta  { display:flex; align-items:baseline; gap:0.5rem; margin-top:0.1rem; min-width:0; }
  .mhdr-type  { font-size:0.68rem; color:#888; flex-shrink:0; }
  .mhdr-label { font-size:0.68rem; color:#fb923c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .close-btn {
    background:none; border:none; color:#aaa; font-size:1rem;
    cursor:pointer; padding:0.25rem; line-height:1; transition:color 0.15s;
  }
  .close-btn:hover { color:#f0f0f0; }

  .mbody {
    padding:1rem; flex:1; overflow:auto;
    display:flex; flex-direction:column; gap:0.75rem;
  }

  .canvas-wrap {
    display:flex; justify-content:center; align-items:center; min-height:160px;
  }
  canvas {
    display:block; max-width:100%;
    border:1px solid #2e2e42; border-radius:8px; background:#1a1a2e;
  }

  .msg-box {
    padding:0.75rem 1rem; border-radius:6px; font-size:0.75rem; line-height:1.5;
  }
  .loading { color:#888; text-align:center; }
  .err  { background:#1f0707; border:1px solid #7f1d1d; color:#f87171; }
  .warn { background:#2a1800; border:1px solid #fb923c; color:#fdba74; }

  .mftr {
    padding:1rem 1.25rem; border-top:1px solid #2e2e42;
    display:flex; justify-content:flex-end;
  }
  .done-btn {
    padding:0.875rem 1.5rem; background:#fb923c; border:none;
    border-radius:8px; color:#0d0d14; font-family:inherit;
    font-size:0.8rem; font-weight:800; letter-spacing:0.15em;
    cursor:pointer; transition:background 0.15s;
  }
  .done-btn:hover { background:#f97316; }
</style>
