<!-- plan/PlanCanvas.svelte -->
<!-- The plan image with SVG polygon overlay, scale reference line, and component markers.
     Coordinate conversions (mouse → fraction) happen here; the parent receives fractions. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { centroid } from './planMeasure.js';
  import ComponentMarker from '../ComponentMarker.svelte';
  import { ACCENT, ACCENT_LIGHT } from '$lib/theme.js';

  export let plan;                       // selected plan object
  export let floor;                      // selected floor object
  export let planSpaces           = [];  // spaces for this plan (may have polygon swapped for editing)
  export let planAnnotations      = [];  // text annotations for this plan
  export let positionedComponents = [];  // components with drag overrides applied
  export let types                = [];
  export let selectedComponent    = null;
  export let selectedSpace        = null;
  export let selectedAnnotation   = null;
  export let showSpaces           = true;   // filter toggle
  export let vertexEditingActive  = false;  // true while editing a space's polygon vertices
  // drawingMode: 'off' | 'component' | 'space' | 'scale' | 'annotation'
  export let drawingMode          = 'off';
  export let drawingVertices    = [];
  export let scalePoint1        = null;  // { x, y }
  export let scalePoint2        = null;  // { x, y }
  export let newPos             = null;  // { x, y } — pending component placement
  export let showNewPosDot      = false; // true while quick-add form is open

  // Expose the container element so the parent can compute drag coordinates.
  // Parent uses: bind:containerEl={canvasEl}
  export let containerEl = null;

  const dispatch = createEventDispatcher();

  function getXY(e) {
    const rect = containerEl.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height)),
    };
  }

  function handleClick(e) {
    if (!containerEl) return;
    dispatch('planclick', getXY(e));
  }

  const FONT_SIZE_CLASS = {
    xs: 'text-[10px]',
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg',
  };

  function handleImgLoad(e) {
    const img = e.target;
    if (img.naturalWidth && img.naturalHeight) {
      dispatch('imgload', { aspectRatio: img.naturalWidth / img.naturalHeight });
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div
  class="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shadow-lg
         {drawingMode === 'annotation' ? 'cursor-cell'
          : drawingMode !== 'off'     ? 'cursor-crosshair'
          :                             'cursor-default'}"
  bind:this={containerEl}
  on:click={handleClick}
>

  <!-- Floor plan image -->
  <img
    src={plan.image_url}
    alt="{plan.name ?? plan.building} floor plan"
    class="w-full h-auto block select-none"
    draggable="false"
    on:load={handleImgLoad}
  />

  <!-- -- SVG overlay: spaces, scale lines, drawing vertices -------- -->
  <!-- pointer-events:none on the SVG; individual elements opt in -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <svg
    class="absolute inset-0 w-full h-full"
    viewBox="0 0 1 1"
    preserveAspectRatio="none"
    style="z-index:5; pointer-events:none"
  >

    <!-- Saved space polygons -->
    {#if showSpaces}
      {#each planSpaces as space (space.id)}
        {#if space.polygon?.length >= 3}
          {@const isNone = space.colour === 'none'}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <polygon
            points={space.polygon.map(v => `${v.x},${v.y}`).join(' ')}
            fill={isNone ? 'none' : `#${space.colour}`}
            fill-opacity={isNone ? 0 : (selectedSpace?.id === space.id ? 0.4 : 0.2)}
            stroke={isNone ? '#94a3b8' : `#${space.colour}`}
            stroke-width="0.003"
            stroke-opacity={isNone ? 0.5 : 0.8}
            stroke-dasharray={isNone ? '0.015,0.008' : null}
            style="pointer-events:{drawingMode === 'space' || drawingMode === 'off' ? 'all' : 'none'};
                   cursor:{selectedSpace?.id === space.id && !vertexEditingActive ? 'grab' : 'pointer'}"
            on:click|stopPropagation={() => dispatch('spaceclick', { space })}
            on:mousedown|stopPropagation={e => {
              if (selectedSpace?.id === space.id && !vertexEditingActive) {
                const { x, y } = getXY(e);
                dispatch('spacemovedragstart', { space, x, y });
              }
            }}
          />
        {/if}
      {/each}

      <!-- Vertex handles when editing a space's polygon corners -->
      {#if vertexEditingActive && selectedSpace}
        {@const editSp = planSpaces.find(s => s.id === selectedSpace.id)}
        {#if editSp}
          {#each editSp.polygon as v, i (i)}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <circle
              cx={v.x} cy={v.y} r="0.016"
              fill={ACCENT} stroke="white" stroke-width="0.003"
              style="pointer-events:auto; cursor:grab"
              on:mousedown|stopPropagation={() => dispatch('spacevertexdragstart', { index: i })}
              on:click|stopPropagation
            />
          {/each}
        {/if}
      {/if}
    {/if}

    <!-- Saved scale reference line (hidden while re-calibrating) -->
    {#if plan.scale_ref && drawingMode !== 'scale'}
      {@const sr = plan.scale_ref}
      <line
        x1={sr.x1} y1={sr.y1} x2={sr.x2} y2={sr.y2}
        stroke="#2dd4bf" stroke-width="0.004" stroke-opacity="0.7"
        stroke-dasharray="0.012,0.006"
      />
      <circle cx={sr.x1} cy={sr.y1} r="0.008" fill="#2dd4bf" stroke="white" stroke-width="0.002"/>
      <circle cx={sr.x2} cy={sr.y2} r="0.008" fill="#2dd4bf" stroke="white" stroke-width="0.002"/>
    {/if}

    <!-- Scale drawing: point A, preview line, point B -->
    {#if drawingMode === 'scale'}
      {#if scalePoint1}
        <circle cx={scalePoint1.x} cy={scalePoint1.y} r="0.012"
          fill="#2dd4bf" stroke="white" stroke-width="0.002"/>
      {/if}
      {#if scalePoint1 && scalePoint2}
        <line
          x1={scalePoint1.x} y1={scalePoint1.y}
          x2={scalePoint2.x} y2={scalePoint2.y}
          stroke="#2dd4bf" stroke-width="0.004"
          stroke-dasharray="0.012,0.006" stroke-opacity="0.9"
        />
        <circle cx={scalePoint2.x} cy={scalePoint2.y} r="0.012"
          fill="#2dd4bf" stroke="white" stroke-width="0.002"/>
      {/if}
    {/if}

    <!-- Space drawing: polyline connecting vertices so far -->
    {#if drawingVertices.length >= 2}
      <polyline
        points={drawingVertices.map(v => `${v.x},${v.y}`).join(' ')}
        fill="none" stroke={ACCENT} stroke-width="0.003"
        stroke-dasharray="0.015,0.01" stroke-opacity="0.9"
      />
    {/if}

    <!-- Closing preview line (last → first, faded) when 3+ vertices -->
    {#if drawingVertices.length >= 3}
      <line
        x1={drawingVertices[drawingVertices.length - 1].x}
        y1={drawingVertices[drawingVertices.length - 1].y}
        x2={drawingVertices[0].x}
        y2={drawingVertices[0].y}
        stroke={ACCENT} stroke-width="0.002"
        stroke-dasharray="0.008,0.008" stroke-opacity="0.4"
      />
    {/if}

    <!-- Vertex dots; first vertex is larger and clickable to close the polygon -->
    {#each drawingVertices as v, i}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <circle
        cx={v.x} cy={v.y}
        r={i === 0 && drawingVertices.length >= 3 ? 0.016 : 0.01}
        fill={i === 0 ? ACCENT : ACCENT_LIGHT}
        stroke="white" stroke-width="0.002"
        style={i === 0 && drawingVertices.length >= 3
          ? 'pointer-events:auto; cursor:crosshair'
          : 'pointer-events:none'}
        on:click|stopPropagation={i === 0 && drawingVertices.length >= 3
          ? () => dispatch('closepoly')
          : undefined}
      />
    {/each}

  </svg>

  <!-- -- Space labels (above SVG) -------------------------------- -->
  {#if showSpaces}
    {#each planSpaces as space (space.id)}
      {#if space.polygon?.length >= 3 && space.show_label !== false}
        {@const c = centroid(space.polygon)}
        {@const isNone = space.colour === 'none'}
        <div
          class="absolute pointer-events-none select-none"
          style="left:{c.x * 100}%; top:{c.y * 100}%; transform:translate(-50%,-50%); z-index:8"
        >
          <div
            class="px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap shadow-sm"
            style="background-color:{isNone ? '#1e293b' : `#${space.colour}33`};
                   color:{isNone ? '#94a3b8' : `#${space.colour}`};
                   border:1px solid {isNone ? '#475569' : `#${space.colour}88`}"
          >{space.name}</div>
        </div>
      {/if}
    {/each}
  {/if}

  <!-- -- Component markers --------------------------------------- -->
  {#each positionedComponents as c (c.id)}
    <ComponentMarker
      component={c}
      type={types.find(t => t.code === c.type_code)}
      {floor}
      selected={selectedComponent?.id === c.id}
      editMode={drawingMode === 'component'}
      on:click={e => dispatch('markerclick', e.detail)}
      on:dragstart={e => dispatch('markerdragstart', e.detail)}
    />
  {/each}

  <!-- Pulsing dot at pending component placement position -->
  {#if showNewPosDot && newPos}
    <div
      class="absolute w-4 h-4 rounded-full bg-purple-500 ring-2 ring-white/40
             pointer-events-none animate-pulse"
      style="left:{newPos.x * 100}%; top:{newPos.y * 100}%;
             transform:translate(-50%,-50%); z-index:25"
    ></div>
  {/if}

  <!-- -- Text annotations ---------------------------------------- -->
  {#each planAnnotations as ann (ann.id)}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div
      class="absolute select-none max-w-[180px]
           {drawingMode === 'annotation' ? 'pointer-events-auto' : 'pointer-events-none'}"
      style="left:{ann.x_position * 100}%; top:{ann.y_position * 100}%;
             transform:translate(-50%,-50%); z-index:{selectedAnnotation?.id === ann.id ? 22 : 12}"
      on:click|stopPropagation={() => dispatch('annotationclick', { annotation: ann })}
      on:mousedown|stopPropagation={e => {
        if (drawingMode === 'annotation')
          dispatch('annotationdragstart', { e, annotation: ann });
      }}
    >
      <div
        class="px-2 py-1 rounded shadow-lg border whitespace-pre-wrap break-words leading-tight
               {FONT_SIZE_CLASS[ann.font_size ?? 'sm'] ?? 'text-xs'}
               {ann.bold ? 'font-bold' : 'font-medium'}
               {selectedAnnotation?.id === ann.id
                 ? 'ring-2 ring-white/60'
                 : 'hover:ring-1 hover:ring-white/30'}
               {drawingMode === 'annotation' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}"
        style="background-color:#{ann.colour ?? 'fbbf24'}33;
               color:#{ann.colour ?? 'fbbf24'};
               border-color:#{ann.colour ?? 'fbbf24'}66"
      >{ann.text}</div>
    </div>
  {/each}

  <!-- Plan label (bottom-left corner) -->
  <div
    class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60
           text-xs text-white/70 pointer-events-none"
    style="z-index:30"
  >
    {floor?.short_name} · {plan.name ?? plan.building}
  </div>

</div>
