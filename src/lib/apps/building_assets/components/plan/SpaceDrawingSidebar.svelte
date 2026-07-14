<!-- plan/SpaceDrawingSidebar.svelte -->
<!-- Sidebar panel shown while the user is drawing a space polygon.
     Name / type / colour state is owned by PlanViewTab via bind: so that the
     parent can also call finish when the user closes the polygon on the canvas. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { SPACE_TYPES, SPACE_COLOURS } from './planMeasure.js';
  import { inp } from '../../ui.js';
  import { ACCENT } from '$lib/theme.js';
  import { deriveSpaceName } from '$lib/utils/spaceRef.js';

  export let vertices    = [];
  export let saving      = false;
  // Two-way bound from PlanViewTab so it shares the same state.
  // label = multi-line plan-view display; name = single-line report name.
  export let spaceLabel  = '';
  export let spaceName   = '';
  export let spaceType   = '';
  export let colourHex   = ACCENT;
  export let showLabel   = true;
  export let types       = [];   // configured type values; falls back to SPACE_TYPES

  const dispatch = createEventDispatcher();

  $: typeOptions = types.length ? types : SPACE_TYPES;
  // Report name defaults to the label stripped to alphanumerics (shown as a hint).
  $: derivedName = deriveSpaceName(spaceLabel);
  $: canFinish   = vertices.length >= 3 && spaceLabel.trim().length > 0;
</script>

<div class="bg-slate-800 rounded-xl border border-purple-700/50 p-4">

  <div class="flex items-center justify-between mb-3">
    <div>
      <p class="font-semibold text-white text-sm">Drawing Space</p>
      <p class="text-xs text-slate-500 mt-0.5">
        {vertices.length} {vertices.length === 1 ? 'vertex' : 'vertices'} added
      </p>
    </div>
    <button
      on:click={() => dispatch('cancel')}
      class="text-slate-500 hover:text-white transition-colors"
      title="Cancel drawing"
    >✕</button>
  </div>

  <!-- Label (multi-line — shown on the plan) -->
  <div class="flex flex-col gap-1 mb-2">
    <p class="text-xs text-slate-400">
      Label <span class="text-red-400">*</span>
      <span class="text-slate-600 font-normal ml-1">— shown on the plan; Enter for line breaks</span>
    </p>
    <textarea
      rows="2"
      bind:value={spaceLabel}
      placeholder="e.g. Plant&#10;Room 2"
      class="{inp} resize-none"
    ></textarea>
  </div>

  <!-- Name (single-line — used in reports) -->
  <div class="flex flex-col gap-1 mb-2">
    <p class="text-xs text-slate-400">
      Name <span class="text-slate-600 font-normal ml-1">— single line, for reports</span>
    </p>
    <input
      type="text"
      bind:value={spaceName}
      placeholder={derivedName || 'e.g. PlantRoom2'}
      class={inp}
    />
    {#if !spaceName.trim() && derivedName}
      <p class="text-[11px] text-slate-600">Defaults to <span class="font-mono text-slate-500">{derivedName}</span></p>
    {/if}
  </div>

  <!-- Type -->
  <div class="flex flex-col gap-1 mb-2">
    <p class="text-xs text-slate-400">Type</p>
    <select bind:value={spaceType} class={inp}>
      <option value="">— select —</option>
      {#each typeOptions as st}
        <option value={st}>{st}</option>
      {/each}
    </select>
  </div>

  <!-- Colour swatches -->
  <div class="mb-3">
    <p class="text-xs text-slate-400 mb-1.5">Colour</p>
    <div class="flex gap-1.5 flex-wrap">
      {#each SPACE_COLOURS as sc (sc.hex)}
        <button
          on:click={() => colourHex = sc.hex}
          title={sc.label}
          class="w-6 h-6 rounded-full border-2 transition-all
                 {colourHex === sc.hex
                   ? 'border-white scale-110'
                   : 'border-transparent hover:border-slate-400'}
                 {sc.hex === 'none' ? 'bg-slate-700' : ''}"
          style={sc.hex !== 'none' ? `background-color:${sc.hex}` : ''}
        >{#if sc.hex === 'none'}<span class="text-slate-500 text-[9px] leading-none">∅</span>{/if}</button>
      {/each}
    </div>
  </div>

  <!-- Show label -->
  <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none mb-3">
    <input type="checkbox" bind:checked={showLabel} class="rounded accent-purple-500" />
    Show label on plan
  </label>

  <!-- Hint -->
  <p class="text-xs text-slate-500 mb-3">
    {#if vertices.length < 3}
      Add {3 - vertices.length} more {3 - vertices.length === 1 ? 'vertex' : 'vertices'} to enable Finish.
    {:else}
      Click the first <strong class="text-purple-400">●</strong> vertex to close, or press Finish.
    {/if}
  </p>

  <!-- Vertex list (scrollable) -->
  {#if vertices.length > 0}
    <div class="mb-3 flex flex-col gap-0.5 max-h-20 overflow-y-auto">
      {#each vertices as v, i}
        <p class="text-xs font-mono text-slate-600">
          #{i + 1} ({(v.x * 100).toFixed(1)}%, {(v.y * 100).toFixed(1)}%)
        </p>
      {/each}
    </div>
  {/if}

  <!-- Actions -->
  <div class="flex gap-2">
    <button
      on:click={() => dispatch('undo')}
      disabled={vertices.length === 0}
      class="px-3 py-1.5 text-xs rounded-lg bg-slate-700 hover:bg-slate-600
             text-slate-300 disabled:opacity-40 transition-colors"
      title="Remove last vertex"
    >↩ Undo</button>
    <button
      on:click={() => dispatch('cancel')}
      class="flex-1 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600
             text-slate-300 transition-colors"
    >Cancel</button>
    <button
      on:click={() => dispatch('finish')}
      disabled={!canFinish || saving}
      class="flex-1 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500
             disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium
             transition-colors"
    >{saving ? 'Saving…' : 'Finish'}</button>
  </div>

</div>
