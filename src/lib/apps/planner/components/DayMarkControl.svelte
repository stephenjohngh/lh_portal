<!-- src/lib/apps/planner/components/DayMarkControl.svelte -->
<!-- Shading one day — bank holidays, above all.

     It lives in the day panel rather than anywhere else because that is where
     somebody already looking at the 25th of December is standing. A separate
     "holidays" screen would be a second place to go and a list to maintain.

     A mark is NOT an event: nobody does a bank holiday, it is never ticked off
     and it cannot be overdue. It is a property of the day, so it colours the
     square rather than appearing in the list. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { PALETTE, markStyle } from '../utils/categories.js';

  export let date;
  /** The existing mark on this day, if any. */
  export let mark = null;
  export let canEdit = false;

  const dispatch = createEventDispatcher();

  let open = false;
  let label = '';
  let colour = 'rose';

  // Guarded on the date, not the mark object: an object prop is dirty on every
  // parent update, which would reset what is being typed.
  let loadedFor = null;
  $: if (date !== loadedFor) {
    loadedFor = date;
    open = false;
    label = mark?.label ?? '';
    colour = mark?.colour ?? 'rose';
  }

  $: style = markStyle(mark);

  function save() {
    if (!label.trim()) return;
    dispatch('set', { date, label: label.trim(), colour });
    open = false;
  }
</script>

<div class="flex items-center gap-2 flex-wrap">
  {#if style}
    <span class="text-[11px] px-1.5 py-0.5 rounded {style.wash} text-slate-200">
      {style.label}
    </span>
  {/if}

  {#if canEdit}
    {#if !open}
      <button type="button" class="text-[11px] text-slate-500 hover:text-slate-300"
              on:click={() => open = true}>
        {mark ? 'Change shading' : 'Shade this day'}
      </button>
      {#if mark}
        <button type="button" class="text-[11px] text-slate-600 hover:text-red-400"
                on:click={() => dispatch('clear', { date })}>Remove</button>
      {/if}
    {:else}
      <div class="flex items-center gap-2 flex-wrap">
        <input
          bind:value={label}
          placeholder="e.g. Bank holiday"
          on:keydown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') open = false; }}
          class="px-2 py-0.5 text-xs bg-slate-900 border border-slate-600 rounded
                 text-white placeholder-slate-500 focus:outline-none
                 focus:ring-1 focus:ring-purple-500 w-40"
        />

        <!-- Swatches rather than a dropdown: the choice IS the colour, and
             reading its name to pick it is a step nobody needs. -->
        <div class="flex items-center gap-1">
          {#each PALETTE as swatch}
            <button
              type="button"
              title={swatch.label}
              aria-label={swatch.label}
              class="w-3.5 h-3.5 rounded {swatch.dot} transition-transform
                     {colour === swatch.key
                       ? 'ring-2 ring-offset-1 ring-offset-slate-800 ring-white/60 scale-110'
                       : 'opacity-50 hover:opacity-100'}"
              on:click={() => colour = swatch.key}
            ></button>
          {/each}
        </div>

        <button type="button" class="text-[11px] text-purple-300 hover:text-purple-200"
                on:click={save}>Save</button>
        <button type="button" class="text-[11px] text-slate-500 hover:text-slate-300"
                on:click={() => open = false}>Cancel</button>
      </div>
    {/if}
  {/if}
</div>
