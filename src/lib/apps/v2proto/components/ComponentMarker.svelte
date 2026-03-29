<!-- src/lib/apps/v2proto/components/ComponentMarker.svelte -->
<!-- A single component marker pinned on a floor plan.
     Position is expressed as fractions 0–1 and converted to CSS percentages.
     The parent container must be position:relative and exactly overlay the plan image. -->
<script>
  import { createEventDispatcher } from 'svelte';

  export let component;           // components row (x_position, y_position, status)
  export let type     = null;     // component_types row (colour, initial, marker_shape)
  export let selected = false;    // shows ring + scale-up
  export let editMode = false;    // enables drag cursor + fires dragstart

  const dispatch = createEventDispatcher();

  let hovered = false;

  $: colour   = type?.colour   ?? '888888';
  $: initial  = type?.initial  ?? '?';
  $: isCircle = !type || type.marker_shape === 'circle';
  $: isInactive = component.status === 'inactive';
  $: label = component.asset_id || component.label || '';

  $: sizeClass = {
    sm: 'w-5  h-5  text-[9px]',
    md: 'w-7  h-7  text-xs',
    lg: 'w-9  h-9  text-sm',
    xl: 'w-11 h-11 text-base',
  }[type?.marker_size ?? 'md'] ?? 'w-7 h-7 text-xs';

  // Tooltip text
  $: tipText = [
    type?.name ?? component.type_code,
    component.asset_id,
    component.label,
    component.status !== 'OK' ? component.status.toUpperCase() : null
  ].filter(Boolean).join(' · ');
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
    title={tipText}
    class="relative {sizeClass} flex items-center justify-center text-white font-bold
           shadow-lg transition-transform duration-75
           {isCircle ? 'rounded-full' : 'rounded'}
           {isInactive ? 'opacity-40' : ''}
           {selected    ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-transparent'
                        : hovered ? 'scale-110' : ''}
           {editMode    ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}"
    style:background-color="#{colour}"
    on:click|stopPropagation={() => dispatch('click', { component })}
    on:mousedown|stopPropagation={e => { if (editMode) dispatch('dragstart', { e, component }); }}
    on:keydown={e => e.key === 'Enter' && dispatch('click', { component })}
  >
    {initial}

    <!-- Inner-square overlay (for marker_shape = 'square_inner') -->
    {#if type?.marker_shape === 'square_inner'}
      <span class="absolute inset-[5px] border-2 border-white/60 rounded-sm pointer-events-none"></span>
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

  <!-- Hover / selected label -->
  {#if (hovered || selected) && label}
    <div class="absolute top-full left-1/2 -translate-x-1/2 mt-1
                px-1.5 py-0.5 rounded text-xs font-mono whitespace-nowrap
                bg-black/80 text-white shadow pointer-events-none"
         style="z-index:30">
      {label}
    </div>
  {/if}
</div>
