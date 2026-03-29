<!-- plan/UnplacedSidebar.svelte -->
<!-- Default sidebar panel: lists components that belong to this floor but have
     no plan position, plus a summary of what is on the plan. -->
<script>
  import { createEventDispatcher } from 'svelte';

  export let unplacedComponents = [];
  export let planComponents     = [];
  export let planSpaces         = [];
  export let selectedFloor      = null;
  export let types              = [];
  // drawingMode: 'off' | 'component' | 'space' | 'scale'
  export let drawingMode        = 'off';

  const dispatch = createEventDispatcher();
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 p-4">

  <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
    Unplaced on this floor
  </p>

  {#if !selectedFloor}
    <p class="text-xs text-slate-600 italic">Select a floor first.</p>

  {:else if unplacedComponents.length === 0}
    <p class="text-xs text-slate-600 italic">
      All components on {selectedFloor.name} are placed. ✓
    </p>

  {:else}
    <p class="text-xs text-slate-500 mb-3">
      These components have a floor but no plan position.
      {#if drawingMode === 'component'}
        Click a component below to open its detail and assign a plan position.
      {:else}
        Switch to <strong>Components</strong> mode to place new ones.
      {/if}
    </p>

    <div class="flex flex-col gap-2">
      {#each unplacedComponents as c (c.id)}
        {@const t = types.find(tt => tt.code === c.type_code)}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
          class="flex items-center gap-2 p-2 rounded-lg bg-slate-700/50 border
                 border-slate-600 hover:border-slate-500 cursor-pointer transition-colors"
          on:click={() => dispatch('selectcomponent', { component: c })}
          title="Click to view / edit"
        >
          {#if t}
            <div
              class="w-6 h-6 flex items-center justify-center text-white text-xs
                     font-bold shrink-0
                     {t.marker_shape === 'circle' ? 'rounded-full' : 'rounded'}"
              style:background-color="#{t.colour}"
            >{t.initial}</div>
          {:else}
            <div class="w-6 h-6 rounded bg-slate-600 shrink-0"></div>
          {/if}
          <div class="flex-1 min-w-0">
            <p class="text-sm text-white truncate">
              {c.label || c.asset_id || t?.name || c.type_code}
            </p>
            <p class="text-xs text-slate-500 truncate">{t?.name ?? c.type_code}</p>
          </div>
          <span class="text-slate-600 text-xs shrink-0">→</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- On-plan summary -->
  {#if planComponents.length > 0 || planSpaces.length > 0}
    <div class="mt-4 pt-3 border-t border-slate-700 flex flex-col gap-1">
      {#if planComponents.length > 0}
        <p class="text-xs text-slate-500">
          <span class="text-white font-medium">{planComponents.length}</span>
          component{planComponents.length !== 1 ? 's' : ''} on this plan.
          Click any marker to inspect or edit.
        </p>
      {/if}
      {#if planSpaces.length > 0}
        <p class="text-xs text-slate-500">
          <span class="text-purple-400 font-medium">{planSpaces.length}</span>
          space{planSpaces.length !== 1 ? 's' : ''} defined.
          Switch to <strong>Spaces</strong> mode to add more.
        </p>
      {/if}
    </div>
  {/if}

</div>
