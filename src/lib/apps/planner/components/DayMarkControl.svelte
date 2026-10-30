<!-- src/lib/apps/planner/components/DayMarkControl.svelte -->
<!-- Shading one day — bank holidays, above all.

     It lives in the day panel rather than anywhere else because that is where
     somebody already looking at the 25th of December is standing. A separate
     "holidays" screen would be a second place to go and a list to maintain.

     A mark is NOT an event: nobody does a bank holiday, it is never ticked off
     and it cannot be overdue. It is a property of the day, so it colours the
     square rather than appearing in the list. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher } from 'svelte';
  import { PALETTE, markStyle } from '../utils/categories.js';

  export let date;
  /** The existing mark on this day, if any. */
  export let mark = null;
  export let canEdit = false;

  const dispatch = createEventDispatcher();

  /** Puts the cursor in the box when the form opens. */
  function focusOnMount(node) { node.focus(); }

  let open = false;
  let label = '';
  let colour = 'rose';

  // Guarded on the date, not the mark object: an object prop is dirty on every
  // parent update, which would reset what is being typed.
  let loadedFor = null;
  $: if (date !== loadedFor) {
    loadedFor = date;
    open = false;
    label = own?.label ?? '';
    colour = own?.colour ?? 'rose';
  }

  // A non-working day comes from Admin, not from this control: it is shown, and
  // shading the day by hand here puts a mark of your own over it.
  $: fromAdmin = mark?.source === 'non_working';
  $: own = fromAdmin ? null : mark;
  $: style = markStyle(mark);

  /** A shaded day needs a name; with none typed it is simply "Shaded", rather than Save doing nothing. */
  const DEFAULT_LABEL = 'Shaded';

  function save() {
    dispatch('set', { date, label: label.trim() || DEFAULT_LABEL, colour });
    open = false;
  }

  function remove() {
    dispatch('clear', { date });
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
      <Button variant="tertiary" size="xs" on:click={() => open = true}>{own ? 'Change shading' : 'Shade this day'}</Button>
    {:else}
      <div class="flex items-center gap-2 flex-wrap">
        <input
          bind:value={label}
          placeholder="e.g. Bank holiday"
          use:focusOnMount
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

        <Button variant="tertiary" size="xs"
                on:click={save}>Save</Button>
        <Button variant="tertiary" size="xs" on:click={() => open = false}>Cancel</Button>
        {#if own}
          <Button variant="danger" size="xs" on:click={remove}>Remove shading</Button>
        {/if}
      </div>
    {/if}
  {/if}
</div>
