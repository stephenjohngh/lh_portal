<!-- src/lib/apps/walk/components/WalkPlanViewer.svelte -->
<!-- Compact modal showing current element's location on floor plan -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { onMount } from 'svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  
  const dispatch = createEventDispatcher();
  
  export let element;      // Current element to show
  export let plan;         // Plan object with image_url, image_width, image_height
  export let floorLevel;   // Current floor
  
  let canvas;
  let ctx;
  let imageLoaded = false;
  let error = null;
  
  onMount(() => {
    loadPlan();
  });
  
  async function loadPlan() {
    if (!plan?.image_url) {
      error = 'No plan image available';
      return;
    }
    
    console.log('WalkPlanViewer - Element:', element);
    console.log('WalkPlanViewer - X Position:', element.x_position);
    console.log('WalkPlanViewer - Y Position:', element.y_position);
    
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        // Set canvas to container size
        const container = canvas.parentElement;
        const maxWidth = container.clientWidth;
        const maxHeight = window.innerHeight * 0.6; // Max 60% of screen height
        
        // Calculate scale to fit
        const scaleX = maxWidth / img.width;
        const scaleY = maxHeight / img.height;
        const scale = Math.min(scaleX, scaleY, 1); // Don't scale up
        
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx = canvas.getContext('2d');
        
        // Draw the plan image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Draw the element marker if position is set (using correct field names)
        if (element.x_position != null && element.y_position != null) {
          // Positions are stored as 0-1, not 0-100
          const x = element.x_position * canvas.width;
          const y = element.y_position * canvas.height;
          console.log('Drawing marker at:', x, y, 'on canvas:', canvas.width, canvas.height);
          console.log('Position values:', element.x_position, element.y_position);
          drawMarker(x, y);
        } else {
          console.warn('Element has no position set:', element.asset_id);
        }
        
        imageLoaded = true;
      };
      
      img.onerror = () => {
        error = 'Failed to load plan image';
      };
      
      img.src = plan.image_url;
      
    } catch (err) {
      error = err.message;
    }
  }
  
  function drawMarker(x, y) {
    // Draw pulsing marker at element location
    const markerSize = 20;
    
    // Outer glow
    ctx.shadowColor = '#fb923c';
    ctx.shadowBlur = 15;
    
    // Main marker circle
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(x, y, markerSize / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner circle
    ctx.fillStyle = '#0d0d14';
    ctx.beginPath();
    ctx.arc(x, y, markerSize / 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Reset shadow
    ctx.shadowBlur = 0;
    
    // Add crosshair lines
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 2;
    
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(x - markerSize * 1.5, y);
    ctx.lineTo(x + markerSize * 1.5, y);
    ctx.stroke();
    
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(x, y - markerSize * 1.5);
    ctx.lineTo(x, y + markerSize * 1.5);
    ctx.stroke();
  }
</script>

<div class="modal-backdrop" 
     on:click={() => dispatch('close')} 
     on:keydown={(e) => e.key === 'Escape' && dispatch('close')}
     role="button"
     tabindex="-1"
     aria-label="Close modal">
  <div class="modal-content" 
       on:click|stopPropagation
       on:keydown|stopPropagation
       role="dialog"
       aria-labelledby="modal-title"
       aria-modal="true">
    
    <div class="modal-header">
      <div class="modal-title" id="modal-title">
        <span class="floor-badge">Floor {floorLevel}</span>
        <span class="element-id">{element.asset_id || 'Element Location'}</span>
      </div>
      <button class="close-btn" on:click={() => dispatch('close')} aria-label="Close modal">
        <Icon name="x" size={5} />
      </button>
    </div>
    
    <div class="modal-body">
      {#if error}
        <div class="error-msg">
          <Icon name="alert-circle" size={10} className="text-red-400" />
          <p>{error}</p>
        </div>
      {:else if !imageLoaded}
        <div class="loading">
          <Icon name="loading" size={10} className="animate-spin text-purple-400" />
          <p>Loading plan...</p>
        </div>
      {/if}
      
      <div class="canvas-container">
        <canvas bind:this={canvas}></canvas>
      </div>
      
      {#if element.x_position == null || element.y_position == null}
        <div class="warning-msg">
          <Icon name="alert-triangle" size={5} className="text-amber-400" />
          <div class="warning-text">
            <div class="warning-title">Element location not set on plan</div>
            <div class="warning-hint">Use the Plans app to position this element on the floor plan</div>
          </div>
        </div>
      {/if}
    </div>
    
    <div class="modal-footer">
      <button class="done-btn" on:click={() => dispatch('close')}>
        CLOSE
      </button>
    </div>
    
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 100;
    background: rgba(0, 0, 0, 0.85);
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
    animation: fadeIn 0.15s ease-out;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  .modal-content {
    background: #0d0d14; border: 2px solid #2e2e42;
    border-radius: 12px; max-width: 600px; width: 100%;
    display: flex; flex-direction: column;
    max-height: 90vh;
    animation: slideUp 0.2s ease-out;
    font-family: 'DM Mono', 'Courier New', monospace;
  }
  
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem 1.25rem; border-bottom: 1px solid #2e2e42;
  }
  
  .modal-title {
    display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
  }
  
  .floor-badge {
    font-size: 0.7rem; letter-spacing: 0.1em; padding: 0.25rem 0.6rem;
    background: #2a1800; color: #fb923c; border-radius: 4px; font-weight: 700;
  }
  
  .element-id {
    font-size: 0.875rem; color: #f0f0f0; font-weight: 600;
  }
  
  .close-btn {
    background: none; border: none; color: #ccc;
    cursor: pointer; padding: 0.25rem; display: flex;
    transition: color 0.15s;
  }
  .close-btn:hover { color: #f0f0f0; }
  
  .modal-body {
    padding: 1rem; flex: 1; overflow: auto;
    display: flex; flex-direction: column; gap: 1rem;
  }
  
  .canvas-container {
    display: flex; justify-content: center; align-items: center;
    min-height: 200px;
  }
  
  canvas {
    display: block; max-width: 100%;
    border: 1px solid #2e2e42; border-radius: 8px;
    background: #1a1a2e;
  }
  
  .loading, .error-msg {
    display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
    padding: 2rem; color: #ccc; font-size: 0.875rem;
  }
  
  .warning-msg {
    display: flex; align-items: flex-start; gap: 0.75rem;
    padding: 1rem 1.25rem; background: #2a1800;
    border: 1px solid #fb923c; border-radius: 6px;
    font-size: 0.8rem; color: #fdba74;
  }
  
  .warning-text {
    display: flex; flex-direction: column; gap: 0.25rem;
  }
  
  .warning-title {
    font-weight: 700; color: #fb923c;
  }
  
  .warning-hint {
    font-size: 0.75rem; color: #fdba74; opacity: 0.85;
  }
  
  .modal-footer {
    padding: 1rem 1.25rem; border-top: 1px solid #2e2e42;
    display: flex; justify-content: flex-end;
  }
  
  .done-btn {
    padding: 0.875rem 1.5rem; background: #fb923c; border: none;
    border-radius: 8px; color: #0d0d14; font-family: inherit;
    font-size: 0.8rem; font-weight: 800; letter-spacing: 0.15em;
    cursor: pointer; transition: background 0.15s;
  }
  .done-btn:hover { background: #f97316; }
</style>
