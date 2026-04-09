<script>
  // src/lib/apps/v2plan/components/MarkerOverlay.svelte
  // Absolutely-positioned markers + read-only SVG space overlays.
  // All positioned within the transformed plan container (inherits pan/zoom).

  export let components   = [];   // placed components only (x_position + y_position set)
  export let spaces       = [];   // space overlay polygons
  export let types        = [];   // for colour / shape / initial lookup
  export let inspections  = {};   // { [componentId]: inspection row }
  export let hiddenTypes  = new Set();
  export let hiddenStatuses = new Set();
  export let showSpaces   = true;
  export let selectedId   = null;
  export let longPressId  = null;  // shows ripple

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  // Look up type config for a component
  function getType(typeCode) {
    return types.find(t => t.code === typeCode) ?? null;
  }

  function markerColor(type) {
    if (!type?.colour) return '#64748b';
    const c = type.colour.startsWith('#') ? type.colour : `#${type.colour}`;
    return c;
  }

  // WCAG luminance — decide if text on marker should be black or white
  function textColor(hex) {
    try {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0,2),16)/255;
      const g = parseInt(h.slice(2,4),16)/255;
      const b = parseInt(h.slice(4,6),16)/255;
      const lum = 0.299*r + 0.587*g + 0.114*b;
      return lum > 0.5 ? '#0d0d14' : '#ffffff';
    } catch { return '#ffffff'; }
  }

  function statusBadgeColor(status) {
    switch (status) {
      case 'failed':   return '#dc2626';
      case 'problem':  return '#d97706';
      default:         return null; // no badge for ok/inactive
    }
  }

  function isFiltered(c) {
    if (hiddenTypes.has(c.type_code))    return true;
    if (hiddenStatuses.size > 0 && hiddenStatuses.has(c.status)) return true;
    return false;
  }

  // Only render markers with a plan position
  $: placedComponents = components.filter(c =>
    c.x_position != null && c.y_position != null
  );

  // Compute centroid for space labels
  function centroid(polygon) {
    if (!polygon || polygon.length === 0) return { x: 0.5, y: 0.5 };
    const n = polygon.length;
    const x = polygon.reduce((a, p) => a + p.x, 0) / n;
    const y = polygon.reduce((a, p) => a + p.y, 0) / n;
    return { x, y };
  }

  function svgPoints(polygon) {
    if (!polygon) return '';
    // SVG viewBox is 0 0 1 1 so normalised coords are used directly
    return polygon.map(p => `${p.x},${p.y}`).join(' ');
  }

  function handleMarkerTap(e, c) {
    e.stopPropagation();
    dispatch('markerTap', c);
  }

  function handleMarkerLongPress(e, c) {
    e.stopPropagation();
    dispatch('markerLongPress', c);
  }
</script>

<!-- Space SVG overlay (behind markers) -->
{#if showSpaces && spaces.length > 0}
  <svg
    class="spaces-svg"
    viewBox="0 0 1 1"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    {#each spaces as space (space.id)}
      {#if space.polygon && space.polygon.length >= 3}
        {@const col = space.colour && space.colour !== 'none' ? `#${space.colour.replace('#','')}` : null}
        <polygon
          points={svgPoints(space.polygon)}
          fill={col ? `${col}33` : 'none'}
          stroke={col ?? '#64748b'}
          stroke-width="0.003"
          stroke-dasharray={col ? 'none' : '0.008 0.008'}
        />
        {#if space.show_label}
          {@const c = centroid(space.polygon)}
          <text
            x={c.x}
            y={c.y}
            font-size="0.025"
            text-anchor="middle"
            dominant-baseline="middle"
            fill={col ?? '#64748b'}
            opacity="0.8"
          >{space.name}</text>
        {/if}
      {/if}
    {/each}
  </svg>
{/if}

<!-- Component markers -->
{#each placedComponents as c (c.id)}
  {@const type     = getType(c.type_code)}
  {@const bg       = markerColor(type)}
  {@const fg       = textColor(bg)}
  {@const badge    = statusBadgeColor(c.status)}
  {@const filtered = isFiltered(c)}
  {@const selected = c.id === selectedId}
  {@const ripple   = c.id === longPressId}

  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="marker-wrapper"
    class:filtered
    class:selected
    style="left: {c.x_position * 100}%; top: {c.y_position * 100}%"
    data-component-id={c.id}
    on:click={e => handleMarkerTap(e, c)}
  >
    {#if ripple}
      <div class="ripple" aria-hidden="true"></div>
    {/if}

    <div
      class="marker"
      class:inactive={c.status === 'inactive'}
      style="background: {bg}; color: {fg};"
      title="{c.asset_id} — {c.label ?? ''}"
    >
      {type?.initial ?? '?'}
    </div>

    {#if badge}
      <div class="status-badge" style="background: {badge};" aria-hidden="true"></div>
    {/if}
  </div>
{/each}

<style>
  .spaces-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .marker-wrapper {
    position: absolute;
    transform: translate(-50%, -50%);
    /* 44px touch target via pseudo-element — the visual marker is 32px */
    cursor: pointer;
    z-index: 10;
    transition: opacity 0.2s;
  }

  /* Invisible 44×44 touch target */
  .marker-wrapper::before {
    content: '';
    position: absolute;
    inset: -6px;
    min-width: 44px;
    min-height: 44px;
    transform: translate(-50%, -50%) translate(50%, 50%);
  }

  .marker-wrapper.filtered {
    opacity: 0.1;
    pointer-events: none;
  }

  .marker {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    user-select: none;
    position: relative;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    border: 2px solid rgba(255,255,255,0.15);
    transition: box-shadow 0.15s;
  }

  .marker.inactive {
    opacity: 0.35;
  }

  .marker-wrapper.selected .marker {
    outline: 2px solid #2dd4bf;
    outline-offset: 2px;
    animation: pulse-ring 1.2s ease infinite;
  }

  .status-badge {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid #0d0d14;
  }

  .ripple {
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    border: 2px solid #2dd4bf;
    animation: ripple-out 0.5s ease forwards;
    pointer-events: none;
  }

  @keyframes ripple-out {
    from { transform: scale(0.6); opacity: 1; }
    to   { transform: scale(2.2); opacity: 0; }
  }

  @keyframes pulse-ring {
    0%   { outline-color: #2dd4bf; }
    50%  { outline-color: #14b8a6; }
    100% { outline-color: #2dd4bf; }
  }
</style>
