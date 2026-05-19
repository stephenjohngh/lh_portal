<script>
  // src/lib/apps/mobileplan/components/MarkerOverlay.svelte
  // Absolutely-positioned markers + read-only SVG space overlays.
  // All positioned within the transformed plan container (inherits pan/zoom).

  export let components    = [];
  export let spaces        = [];
  export let annotations   = [];
  export let types         = [];
  export let hiddenTypes   = new Set();
  export let hiddenStatuses = new Set();
  export let showSpaces    = true;
  export let selectedId    = null;
  export let longPressId   = null;

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function getType(typeCode) {
    return types.find(t => t.code === typeCode) ?? null;
  }

  function markerColor(type) {
    if (!type?.colour) return '64748b';
    return type.colour.replace('#', '');
  }

  // WCAG relative luminance — true if background is light (needs dark text)
  function isLight(hex) {
    try {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0,2),16)/255;
      const g = parseInt(h.slice(2,4),16)/255;
      const b = parseInt(h.slice(4,6),16)/255;
      const lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      const L = 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
      return L > 0.179;
    } catch { return false; }
  }

  // marker_size enum (sm | md | lg | xl) → pixel size for the SVG marker
  function markerPx(size) {
    switch (size) {
      case 'sm': return 22;
      case 'lg': return 36;
      case 'xl': return 44;
      default:   return 28;  // md
    }
  }

  function statusBadgeColor(status) {
    switch (status) {
      case 'failed':  return '#dc2626';
      case 'problem': return '#d97706';
      default:        return null;
    }
  }

  function isFiltered(c) {
    if (hiddenTypes.has(c.type_code)) return true;
    if (hiddenStatuses.size > 0 && hiddenStatuses.has(c.status)) return true;
    return false;
  }

  // Placed = has a plan assignment
  $: placedComponents = components.filter(c => c.plan_id != null);

  // Space helpers
  function centroid(polygon) {
    if (!polygon || polygon.length === 0) return { x: 0.5, y: 0.5 };
    const n = polygon.length;
    return {
      x: polygon.reduce((a, p) => a + p.x, 0) / n,
      y: polygon.reduce((a, p) => a + p.y, 0) / n,
    };
  }

  function svgPoints(polygon) {
    if (!polygon) return '';
    return polygon.map(p => `${p.x},${p.y}`).join(' ');
  }

  function handleMarkerTap(e, c) {
    e.stopPropagation();
    dispatch('markerTap', c);
  }
</script>

<!-- Space SVG overlay — fills/borders only (no SVG text; labels rendered as HTML below) -->
{#if showSpaces && spaces.length > 0}
  <svg class="spaces-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
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
      {/if}
    {/each}
  </svg>

  <!-- Space name labels as HTML so font-size is in px, not SVG units -->
  {#each spaces as space (space.id)}
    {#if space.show_label && space.polygon && space.polygon.length >= 3}
      {@const ctr = centroid(space.polygon)}
      {@const col = space.colour && space.colour !== 'none' ? `#${space.colour.replace('#','')}` : '#64748b'}
      <div
        class="space-label"
        style="left:{ctr.x * 100}%; top:{ctr.y * 100}%; color:{col};"
        aria-hidden="true"
      >{space.name}</div>
    {/if}
  {/each}
{/if}

<!-- Plan annotations (read-only text labels) -->
{#each annotations as ann (ann.id)}
  <div
    class="annotation-label"
    class:ann-bold={ann.bold}
    style="
      left:{ann.x_position * 100}%;
      top:{ann.y_position * 100}%;
      color:#{ann.colour ?? 'fbbf24'};
      background-color:#{ann.colour ?? 'fbbf24'}33;
      border-color:#{ann.colour ?? 'fbbf24'}66;
      font-size:{ann.font_size === 'xs' ? '10px' : ann.font_size === 'sm' ? '12px' : ann.font_size === 'md' ? '14px' : ann.font_size === 'lg' ? '16px' : '18px'};
    "
    aria-hidden="true"
  >{ann.text}</div>
{/each}

<!-- Component markers -->
{#each placedComponents as c (c.id)}
  {@const type      = getType(c.type_code)}
  {@const hex       = markerColor(type)}
  {@const bg        = `#${hex}`}
  {@const fg        = isLight(hex) ? '#0d0d14' : '#ffffff'}
  {@const badge     = statusBadgeColor(c.status)}
  {@const filtered  = isFiltered(c)}
  {@const selected  = c.id === selectedId}
  {@const ripple    = c.id === longPressId}
  {@const shape     = type?.marker_shape ?? 'circle'}
  {@const isCircle  = shape === 'circle' || shape === 'circle_inner'}
  {@const isDiamond = shape === 'diamond'}
  {@const hasInner  = shape === 'square_inner' || shape === 'circle_inner'}
  {@const innerRound = shape === 'circle_inner'}
  {@const px        = markerPx(type?.marker_size)}
  {@const fontSize  = px <= 22 ? '9px' : px <= 28 ? '11px' : '13px'}

  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="marker-wrapper"
    class:filtered
    class:selected
    style="left:{c.x_position * 100}%; top:{c.y_position * 100}%"
    data-component-id={c.id}
    on:click={e => handleMarkerTap(e, c)}
  >
    {#if ripple}
      <div class="ripple" aria-hidden="true"></div>
    {/if}

    <div
      class="marker"
      class:inactive={c.status === 'inactive'}
      style="
        width:{px}px; height:{px}px;
        background:{bg}; color:{fg};
        border-radius:{isCircle ? '50%' : '4px'};
        transform:{isDiamond ? 'rotate(45deg)' : 'none'};
        font-size:{fontSize};
      "
      title="{c.asset_id ?? ''}{c.label ? ' — ' + c.label : ''}"
    >
      <!-- Counter-rotate text on diamonds so it reads upright -->
      <span style="display:inline-flex; align-items:center; justify-content:center; transform:{isDiamond ? 'rotate(-45deg)' : 'none'}">
        {type?.initial ?? '?'}
      </span>

      <!-- Inner ring for square_inner / circle_inner -->
      {#if hasInner}
        <span
          class="inner-ring"
          style="border-radius:{innerRound ? '50%' : '2px'}; border-color:{isLight(hex) ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.55)'};"
          aria-hidden="true"
        ></span>
      {/if}
    </div>

    {#if badge}
      <div class="status-badge" style="background:{badge};" aria-hidden="true"></div>
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

  .space-label {
    position: absolute;
    transform: translate(-50%, -50%);
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    opacity: 0.75;
    pointer-events: none;
    white-space: nowrap;
    z-index: 5;
  }

  .annotation-label {
    position: absolute;
    transform: translate(-50%, -50%);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid;
    font-family: 'DM Mono', monospace;
    font-weight: 500;
    white-space: pre-wrap;
    max-width: 160px;
    word-break: break-word;
    line-height: 1.3;
    pointer-events: none;
    z-index: 8;
  }

  .annotation-label.ann-bold {
    font-weight: 700;
  }

  .marker-wrapper {
    position: absolute;
    transform: translate(-50%, -50%);
    cursor: pointer;
    z-index: 10;
    transition: opacity 0.2s;
  }

  /* Invisible 44×44 minimum touch target */
  .marker-wrapper::before {
    content: '';
    position: absolute;
    inset: 50%;
    transform: translate(-50%, -50%);
    min-width: 44px;
    min-height: 44px;
  }

  .marker-wrapper.filtered {
    opacity: 0.1;
    pointer-events: none;
  }

  .marker {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Mono', monospace;
    font-weight: 700;
    user-select: none;
    position: relative;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    border: 2px solid rgba(255,255,255,0.15);
  }

  .marker.inactive {
    opacity: 0.35;
  }

  .marker-wrapper.selected .marker {
    outline: 2px solid #2dd4bf;
    outline-offset: 2px;
    animation: pulse-ring 1.2s ease infinite;
  }

  .inner-ring {
    position: absolute;
    inset: 5px;
    border: 2px solid;
    pointer-events: none;
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
