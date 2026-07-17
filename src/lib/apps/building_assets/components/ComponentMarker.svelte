<!-- src/lib/apps/building_assets/components/ComponentMarker.svelte -->
<!-- A single component marker pinned on a floor plan.
     Position is expressed as fractions 0–1 and converted to CSS percentages.
     The parent container must be position:relative and exactly overlay the plan image. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { statusTextCls } from '$lib/utils/resultConstants.js';
  import { buildComponentRef } from '$lib/utils/componentRef.js';

  export let component;           // components row (x_position, y_position, status)
  export let type     = null;     // component_types row (colour, initial, marker_shape)
  export let floor    = null;     // floors row (short_name) — for the hover popup reference
  export let selected = false;    // shows ring + scale-up
  export let editMode = false;    // enables drag cursor + fires dragstart

  const dispatch = createEventDispatcher();

  let hovered = false;

  $: colour        = type?.colour   ?? '888888';
  $: initial       = type?.initial  ?? '?';
  $: shape         = type?.marker_shape ?? 'circle';
  $: isCircle      = shape === 'circle' || shape === 'circle_inner' || !type;
  $: isDiamond     = shape === 'diamond';
  $: isSquareInner = shape === 'square_inner';
  $: isCircleInner = shape === 'circle_inner';
  $: isInactive    = component.status === 'inactive';

  // Return true when the hex colour (without #) is light enough to need black text
  function isLightColour(hex) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.179; // WCAG relative luminance threshold
  }

  $: lightBg    = isLightColour(colour);
  $: label      = component.label || '';
  $: haloColour = component._haloColour ?? null;

  // Hover popup content.
  // The marker takes its floor/type as single objects (the parent already
  // resolved them for this component), so they're wrapped for the shared
  // builder, which looks them up by component.floor_id / type_code.
  $: refStr     = buildComponentRef(component, floor ? [floor] : [], type ? [type] : []);
  $: typeName   = type?.name ?? component.type_code;
  $: statusText = { ok: 'OK', problem: 'Problem', failed: 'Failed', inactive: 'Inactive' }[component.status] ?? component.status;
  $: statusClass = statusTextCls(component.status);

  // Show popup above the marker when it is in the lower quarter of the plan
  $: popupAbove = component.y_position > 0.75;

  $: sizeClass = {
    sm: 'w-4  h-4  text-[9px]',
    md: 'w-6  h-6  text-xs',
    lg: 'w-8  h-8  text-sm',
    xl: 'w-11 h-11 text-base',
  }[type?.marker_size ?? 'md'] ?? 'w-6 h-6 text-xs';
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div
  class="absolute select-none pointer-events-auto"
  style="left:{component.x_position * 100}%; top:{component.y_position * 100}%;
         transform:translate(-50%,-50%); z-index:{selected ? 20 : hovered ? 15 : 10}"
  on:mouseenter={() => hovered = true}
  on:mouseleave={() => hovered = false}
>
  <!-- Main marker body -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    role="button"
    tabindex="0"
    class="relative {sizeClass} flex items-center justify-center {lightBg ? 'text-black' : 'text-white'} font-bold
           shadow-lg transition-transform duration-75
           {isCircle ? 'rounded-full' : 'rounded'}
           {isDiamond ? 'rotate-45' : ''}
           {isInactive ? 'opacity-40' : ''}
           {selected    ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-transparent'
                        : hovered ? 'scale-110' : ''}
           {editMode    ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}"
    style:background-color="#{colour}"
    style:outline={haloColour ? `3px solid #${haloColour}` : null}
    style:outline-offset={haloColour ? '0px' : null}
    on:click|stopPropagation={() => dispatch('click', { component })}
    on:mousedown|stopPropagation={e => { if (editMode) dispatch('dragstart', { e, component }); }}
    on:keydown={e => e.key === 'Enter' && dispatch('click', { component })}
  >
    <!-- Counter-rotate the initial letter on diamonds so it reads upright -->
    <span class={isDiamond ? '-rotate-45 inline-flex items-center justify-center' : ''}>{initial}</span>

    <!-- Inner square ring (square / diamond shapes) -->
    {#if isSquareInner}
      <span class="absolute inset-[5px] border-2 {lightBg ? 'border-black/40' : 'border-white/60'} rounded-sm pointer-events-none"></span>
    {/if}

    <!-- Inner circle ring (circle_inner shape) -->
    {#if isCircleInner}
      <span class="absolute inset-[5px] border-2 {lightBg ? 'border-black/40' : 'border-white/60'} rounded-full pointer-events-none"></span>
    {/if}
  </div>

  <!-- Status badge — top-right corner -->
  {#if component.status === 'problem'}
    <span class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-yellow-400
                 ring-1 ring-white pointer-events-none"></span>
  {:else if component.status === 'failed'}
    <span class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500
                 ring-1 ring-white pointer-events-none"></span>
  {/if}

  <!-- Hover popup -->
  {#if hovered}
    <div
      class="absolute left-1/2 -translate-x-1/2 w-max max-w-[180px]
             px-2 py-1.5 rounded-lg bg-black/90 text-white shadow-xl pointer-events-none
             flex flex-col gap-0.5"
      style="{popupAbove ? 'bottom:calc(100% + 6px)' : 'top:calc(100% + 6px)'}; z-index:30"
    >
      <p class="text-xs font-semibold leading-tight truncate">{typeName}</p>
      <p class="text-[10px] font-mono text-slate-300 leading-tight">{refStr}</p>
      {#if label}
        <p class="text-[10px] text-slate-300 leading-tight truncate">{label}</p>
      {/if}
      <p class="text-[10px] font-medium leading-tight {statusClass}">{statusText}</p>
    </div>
  {/if}
</div>
