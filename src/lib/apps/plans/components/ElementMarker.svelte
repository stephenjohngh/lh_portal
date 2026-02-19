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
  
  $: typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === element.element_type) || ELEMENT_TYPE_OPTIONS[0];
  $: radius = (isHovered || isDragging) ? MARKER_HOVER_RADIUS : MARKER_RADIUS;
  $: opacity = element.status === 'active' ? 1 : 0.5;
  $: strokeWidth = (isHovered || isDragging) ? 3 : 2;
  
  // Dim non-filtered elements when filtering is active
  $: displayOpacity = isFiltered ? 0.2 : opacity;

  $: isDoor          = element.element_type === 'communal_door';
  $: isApartmentDoor = element.element_type === 'apartment_door';
  $: isFireControl   = element.element_type === 'fire_control';
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
    {#if isDoor || isApartmentDoor || isFireControl}
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
  
  <!-- Main shape per type -->
  {#if isDoor}
    <!-- Communal door: orange square -->
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
  {:else if isApartmentDoor}
    <!-- Apartment door: purple square with small inner square -->
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
    <rect
      x={position.x - radius * 0.45}
      y={position.y - radius * 0.45}
      width={radius * 0.9}
      height={radius * 0.9}
      rx="1"
      fill="white"
      opacity={displayOpacity}
      pointer-events="none"
    />
  {:else if isFireControl}
    <!-- Fire control: red square with white centre square -->
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
    <rect
      x={position.x - radius * 0.45}
      y={position.y - radius * 0.45}
      width={radius * 0.9}
      height={radius * 0.9}
      rx="1"
      fill="white"
      opacity={displayOpacity}
      pointer-events="none"
    />
  {:else}
    <!-- Light: yellow circle with emoji -->
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
  {/if}
  
  <!-- Status indicator (top-right corner, hidden when active) -->
  {#if element.status === 'failed'}
    <circle
      cx={position.x + radius - 3}
      cy={position.y - radius + 3}
      r="8"
      fill="#ef4444"
      stroke="white"
      stroke-width="2"
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
