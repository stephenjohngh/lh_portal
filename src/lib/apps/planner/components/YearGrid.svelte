<!-- src/lib/apps/planner/components/YearGrid.svelte -->
<!-- The wallplanner: twelve rows of months, thirty-one day columns.

     A real <table>, not a grid of divs. Three reasons, and the third is the one
     that decided it: it is tabular data; a screen reader can then say "March,
     14" instead of reading 372 anonymous cells; and print engines lay tables
     out properly across a page, which is what §0.5 of the analysis will need
     when the print output is designed.

     Layout logic is pure and tested — utils/yearGrid.js. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { buildYearGrid, cellMarks } from '../utils/yearGrid.js';
  import { categoryOf } from '../utils/categories.js';

  export let year;
  export let occurrences = [];
  export let today = null;
  /** The day whose contents are showing beside the grid. */
  export let selected = null;
  /** The building's categories, for resolving a slug to a colour. */
  export let categories = [];

  const dispatch = createEventDispatcher();

  $: grid = buildYearGrid(year, occurrences, today);

  const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
</script>

<div class="overflow-x-auto planner-year">
  <table class="w-full border-collapse text-[10px]">
    <caption class="sr-only">Planner for {year}</caption>

    <thead>
      <tr>
        <th class="sticky left-0 z-10 bg-slate-800 text-left px-1.5 py-1
                   text-slate-400 font-medium">{year}</th>
        {#each DAYS as day}
          <th class="px-0 py-1 text-slate-600 font-normal">{day}</th>
        {/each}
      </tr>
    </thead>

    <tbody>
      {#each grid as month}
        <tr class="border-t border-slate-700/40">
          <th scope="row"
              class="sticky left-0 z-10 bg-slate-800 text-left p-0
                     text-slate-400 font-medium whitespace-nowrap">
            <!-- The month name opens the month. A wallplanner is for seeing the
                 shape of a year; the question it prompts is nearly always
                 "what IS that in March", and the answer needs words. -->
            <button type="button"
                    class="w-full text-left px-1.5 py-0.5 hover:text-white
                           hover:bg-slate-700/60 transition-colors"
                    title="Open {month.label}"
                    on:click={() => dispatch('selectMonth', month.month)}>{month.short}</button>
          </th>

          {#each month.days as cell}
            {#if !cell}
              <!-- A day this month does not have. Kept as a cell so the columns
                   stay aligned — "the 15th" must be a straight line down the
                   year. -->
              <td class="bg-slate-900/40"></td>
            {:else}
              {@const marks = cellMarks(cell.items)}
              <td class="p-0 align-middle text-center relative
                         {cell.weekend ? 'bg-slate-800/40' : ''}
                         {cell.today ? 'planner-today' : ''}
                         {selected === cell.date ? 'bg-purple-500/25' : ''}">
                {#if cell.items.length}
                  <button
                    type="button"
                    class="w-full h-5 flex items-center justify-center gap-px
                           hover:bg-slate-700/60 transition-colors"
                    title="{cell.date} — {marks.count} item{marks.count === 1 ? '' : 's'}"
                    on:click={() => dispatch('selectDay', cell)}
                  >
                    {#each marks.categories as category}
                      <span class="w-1.5 h-1.5 rounded-full {categoryOf(category, categories).dot}
                                   {marks.outstanding ? '' : 'opacity-40'}"></span>
                    {/each}
                    {#if marks.overflow}
                      <span class="text-[8px] text-slate-500 leading-none">+</span>
                    {/if}
                  </button>
                {:else}
                  <!-- Empty days are still clickable: "what is happening on the
                       9th" is a fair question when the answer is nothing, and a
                       dead cell answers it less clearly than an empty panel. -->
                  <button type="button" class="w-full h-5 hover:bg-slate-700/40"
                          title={cell.date}
                          on:click={() => dispatch('selectDay', cell)}
                          aria-label={cell.date}></button>
                {/if}
              </td>
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  /* The grid must not squeeze below the point where a dot is a dot. Narrower
     than this it scrolls, which is what the wrapper is for. */
  .planner-year table {
    min-width: 44rem;
    table-layout: fixed;
  }

  /* The month column is sized HERE and the day columns are given no width at
     all, which is the whole fix for a bug worth remembering: under
     `table-layout: fixed` the browser hands leftover space to whatever is not
     pinned. Percentages on the 31 day columns came to 74.4%, and the month
     label quietly took the other quarter of the table. Pin one column, leave
     the rest, and they divide the remainder equally. */
  .planner-year th:first-child,
  .planner-year td:first-child {
    width: 3.5rem;
  }

  /* Today. An inset ring rendered as a solid pale block at this size, which
     read as an event rather than as a marker; a bottom rule under the day says
     "you are here" without competing with the dots. */
  .planner-year :global(.planner-today) {
    box-shadow: inset 0 -2px 0 0 rgb(var(--lh-accent-rgb) / 0.9);
  }

  /* Provisional print rules. The layout proper is its own piece of work (see
     the analysis §0.5); this is only enough that printing produces a legible
     wallplanner rather than a dark smear. */
  @media print {
    .planner-year {
      overflow: visible !important;
    }
    .planner-year table {
      min-width: 0;
      color: #000;
    }
    .planner-year :global(th),
    .planner-year :global(td) {
      border: 1px solid #999 !important;
      background: transparent !important;
      color: #000 !important;
    }
    /* Backgrounds are dropped from a print unless the reader ticks a box
       nobody ticks, so the category dots are asked for explicitly — without
       them the whole chart is empty. */
    .planner-year :global(span) {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
