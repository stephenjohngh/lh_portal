<!-- src/lib/apps/plans/components/ElementMarker.svelte -->
<!-- SVG marker for floor plan elements -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { ELEMENT_TYPE_OPTIONS, MARKER_RADIUS, MARKER_HOVER_RADIUS, getElementDisplayName, getElementDescription } from '$lib/utils/planConstants';
  
  const dispatch = createEventDispatcher();

  export const floorLevel = 0; // passed from parent plan — read-only reference
  
  export let element;
  export let position; // { x, y } in pixels
  export let isHovered = false;
  export let isDragging = false;
  export let isFiltered = false;
  
  $: typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === element.element_type) || ELEMENT_TYPE_OPTIONS[4];
  $: radius = (isHovered || isDragging) ? MARKER_HOVER_RADIUS : MARKER_RADIUS;
  $: opacity = element.status === 'active' ? 1 : 0.5;
  $: strokeWidth = (isHovered || isDragging) ? 3 : 2;
  
  // Dim non-filtered elements when filtering is active
  $: displayOpacity = isFiltered ? 0.2 : opacity;

  $: isDoor = element.element_type === 'door';
</script>

<!-- class element-marker-group is used by PlanViewer to detect marker clicks vs empty area clicks -->
<g
  class="element-marker-group"
  role="button"
  tabindex="0"
  on:click
  on:mousedown
  on:mouseenter
  on:mouseleave
  on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') dispatch('click', e); }}
  style="cursor: {isDragging ? 'grabbing' : 'grab'}; pointer-events: all;"
>
  <!-- Outer glow on hover or drag -->
  {#if isHovered || isDragging}
    {#if isDoor}
      <rect
        x={position.x - radius - 4}
        y={position.y - radius - 4}
        width={(radius + 4) * 2}
        height={(radius + 4) * 2}
        rx="3"
        fill={typeConfig.color}
        opacity="0.3"
        class="transition-all"
      />
    {:else}
      <circle
        cx={position.x}
        cy={position.y}
        r={radius + 4}
        fill={typeConfig.color}
        opacity="0.3"
        class="transition-all"
      />
    {/if}
  {/if}
  
  <!-- Main shape: square for doors, circle for everything else -->
  {#if isDoor}
    <rect
      x={position.x - radius}
      y={position.y - radius}
      width={radius * 2}
      height={radius * 2}
      rx="3"
      fill={typeConfig.color}
      opacity={displayOpacity}
      stroke="white"
      stroke-width={strokeWidth}
      class="transition-all"
    />
  {:else}
    <circle
      cx={position.x}
      cy={position.y}
      r={radius}
      fill={typeConfig.color}
      opacity={displayOpacity}
      stroke="white"
      stroke-width={strokeWidth}
      class="transition-all"
    />
  {/if}
  
  <!-- Element type icon (using text as emoji) -->
  <text
    x={position.x}
    y={position.y}
    text-anchor="middle"
    dominant-baseline="central"
    font-size={radius * 1.2}
    fill="white"
    pointer-events="none"
    class="transition-all"
  >
    {typeConfig.icon}
  </text>
  
  <!-- Status indicator (small circle in top-right, hidden when active) -->
  {#if element.status === 'failed'}
    <circle
      cx={position.x + radius - 3}
      cy={position.y - radius + 3}
      r="4"
      fill="#ef4444"
      stroke="white"
      stroke-width="1.5"
      pointer-events="none"
    />
  {:else if element.status === 'inactive'}
    <circle
      cx={position.x + radius - 3}
      cy={position.y - radius + 3}
      r="4"
      fill="#64748b"
      stroke="white"
      stroke-width="1.5"
      pointer-events="none"
    />
  {/if}
</g>

<style>
  .element-marker-group {
    transition: all 0.2s ease;
  }
</style>
