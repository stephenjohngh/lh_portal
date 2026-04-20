<!-- src/lib/apps/inspection/components/InspectionComponentPlanViewer.svelte -->
<!-- Modal showing current component's location on the floor plan image.
     Only shown when currentComponent.plan_id is set (component is placed). -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';

  const dispatch = createEventDispatcher();

  export let component;   // Current component — needs plan_id, x_position, y_position, asset_id
  export let plan;        // Plan object with image_url
  export let floor;       // Floor object with short_name

  let canvas;
  let imageLoaded = false;
  let error       = null;

  onMount(() => { loadPlan(); });

  async function loadPlan() {
    if (!plan?.image_url) { error = 'No plan image available'; return; }
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const container = canvas.parentElement;
        const maxWidth  = container.clientWidth;
        const maxHeight = window.innerHeight * 0.6;

        const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        canvas.width  = img.width  * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        if (component.x_position != null && component.y_position != null) {
          drawMarker(ctx, component.x_position * canvas.width, component.y_position * canvas.height);
        }
        imageLoaded = true;
      };

      img.onerror = () => { error = 'Failed to load plan image'; };
      img.src = plan.image_url;
    } catch (err) {
      error = err.message;
    }
  }

  function drawMarker(ctx, x, y) {
    const r = 10;

    // Glow
    ctx.shadowColor = '#fb923c';
    ctx.shadowBlur  = 15;

    // Outer circle
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Inner circle
    ctx.fillStyle = '#0d0d14';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Crosshair
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.moveTo(x - r * 2, y); ctx.lineTo(x + r * 2, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - r * 2); ctx.lineTo(x, y + r * 2); ctx.stroke();
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click={() => dispatch('close')}>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true" tabindex="-1">

    <div class="mhdr">
      <div class="mhdr-info">
        <span class="floor-badge">{floor?.short_name ?? '?'}</span>
        <span class="comp-id">{component.asset_id ?? 'Component'}</span>
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
  .mhdr-info { display:flex; align-items:center; gap:0.75rem; }
  .floor-badge {
    font-size:0.7rem; letter-spacing:0.1em; padding:0.25rem 0.6rem;
    background:#2a1800; color:#fb923c; border-radius:4px; font-weight:700;
  }
  .comp-id { font-size:0.875rem; color:#f0f0f0; font-weight:600; }
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
