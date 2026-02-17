<!-- src/lib/apps/plans/components/ElementMarker.svelte -->
<!-- SVG marker for floor plan elements -->
<script>
  import { ELEMENT_TYPE_OPTIONS, MARKER_RADIUS, MARKER_HOVER_RADIUS } from '$lib/utils/planConstants';
  
  export let element;
  export let position; // { x, y } in pixels
  export let isHovered = false;
  export let isFiltered = false;
  
  $: typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === element.element_type) || ELEMENT_TYPE_OPTIONS[4];
  $: radius = isHovered ? MARKER_HOVER_RADIUS : MARKER_RADIUS;
  $: opacity = element.status === 'active' ? 1 : 0.5;
  $: strokeWidth = isHovered ? 3 : 2;
  
  // Dim non-filtered elements when filtering is active
  $: displayOpacity = isFiltered ? 0.2 : opacity;
</script>

<g
  class="element-marker"
  on:click
  on:mouseenter
  on:mouseleave
  style="cursor: pointer; pointer-events: all;"
>
  <!-- Outer circle (glow effect on hover) -->
  {#if isHovered}
    <circle
      cx={position.x}
      cy={position.y}
      r={radius + 4}
      fill={typeConfig.color}
      opacity="0.3"
      class="transition-all"
    />
  {/if}
  
  <!-- Main circle -->
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
  
  <!-- Status indicator (small circle in top-right) -->
  {#if element.status === 'maintenance'}
    <circle
      cx={position.x + radius - 3}
      cy={position.y - radius + 3}
      r="4"
      fill="#f59e0b"
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
  {:else if element.status === 'removed'}
    <circle
      cx={position.x + radius - 3}
      cy={position.y - radius + 3}
      r="4"
      fill="#ef4444"
      stroke="white"
      stroke-width="1.5"
      pointer-events="none"
    />
  {/if}
</g>

<style>
  .element-marker {
    transition: all 0.2s ease;
  }
</style>
