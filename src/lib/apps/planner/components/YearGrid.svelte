<!-- src/lib/apps/planner/components/YearGrid.svelte -->
<!-- The wallplanner, in the shape a printed one has always had: twelve rows of
     months, and columns that are WEEKDAYS rather than day numbers.

     Every day sits under its own weekday, so each month starts at its own
     offset and the left edge is ragged — that raggedness is the layout working.
     What it buys is that Saturdays and Sundays line up as stripes down the whole
     year, which is what makes twelve rows readable at a glance, and every cell
     carries its date so the chart can be read rather than decoded.

     A real <table>: it is tabular data, a screen reader can say "March, 14"
     rather than reading 444 anonymous cells, and print engines lay tables out
     across a page properly — which the print work will need.

     Layout logic is pure and tested — utils/yearGrid.js. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { buildYearGrid, cellMarks, columnWeekdays, WEEKDAY_SHORT } from '../utils/yearGrid.js';
  import { categoryOf, markStyle } from '../utils/categories.js';

  export let year;
  export let occurrences = [];
  export let today = null;
  /** The day whose contents are showing beneath the grid. */
  export let selected = null;
  export let categories = [];
  /** Days shaded on the chart, keyed by date — bank holidays and the like. */
  export let marks = new Map();

  const dispatch = createEventDispatcher();

  $: grid = buildYearGrid(year, occurrences, today);

  const COLUMNS = columnWeekdays();
</script>

<div class="overflow-x-auto planner-year">
  <table class="border-collapse">
    <caption class="sr-only">Planner for {year}</caption>

    <thead>
      <tr>
        <th class="sticky left-0 z-20 bg-slate-700 text-left px-2 py-1
                   text-[11px] text-slate-100 font-semibold border border-slate-600">
          {year}
        </th>
        {#each COLUMNS as weekday}
          <th class="px-0 py-1 text-[9px] font-semibold uppercase border border-slate-700
                     {weekday >= 5 ? 'bg-sky-500/20 text-sky-200' : 'bg-slate-700/70 text-slate-300'}"
          >{WEEKDAY_SHORT[weekday].slice(0, 1)}</th>
        {/each}
      </tr>
    </thead>

    <tbody>
      {#each grid as month}
        <tr>
          <th scope="row"
              class="sticky left-0 z-20 bg-slate-700 text-left p-0 whitespace-nowrap
                     border border-slate-600">
            <!-- The month name opens the month. A wallplanner shows the shape of
                 a year; the question it prompts is "what IS that in March", and
                 the answer needs words. -->
            <button type="button"
                    class="w-full text-left px-2 py-1 text-[11px] font-semibold
                           text-slate-100 hover:bg-slate-600 transition-colors"
                    title="Open {month.label}"
                    on:click={() => dispatch('selectMonth', month.month)}>{month.short}</button>
          </th>

          {#each month.slots as cell, column}
            {#if !cell}
              <!-- Before the 1st or after the last. Empty, and visibly outside
                   the month rather than merely dark. -->
              <td class="border border-slate-800 h-12 bg-slate-950/80
                         {COLUMNS[column] >= 5 ? 'bg-sky-950/40' : ''}"></td>
            {:else}
              {@const dots = cellMarks(cell.items, 6)}
              {@const mark = markStyle(marks.get(cell.date))}
              <!-- A marked day is shaded, and the shading wins over the weekend
                   tint: a bank holiday IS the fact worth seeing about that
                   square. -->
              <td class="p-0 align-top border border-slate-700
                         {mark ? mark.wash
                           : cell.weekend ? 'bg-sky-500/10' : 'bg-slate-800/80'}
                         {cell.today ? 'ring-2 ring-inset ring-purple-400 z-10 relative' : ''}
                         {selected === cell.date ? 'bg-purple-500/40' : ''}">
                <button
                  type="button"
                  class="w-full h-12 px-0.5 pt-0.5 flex flex-col items-center
                         hover:bg-slate-600/50 transition-colors"
                  title="{cell.date}{mark ? ` — ${mark.label}` : ''}{dots.count ? ` — ${dots.count} item${dots.count === 1 ? '' : 's'}` : ''}"
                  on:click={() => dispatch('selectDay', cell)}
                >
                  <!-- The DATE, in every cell. Without it the chart has to be
                       counted rather than read. -->
                  <span class="text-[10px] tabular-nums leading-none
                               {cell.today ? 'text-white font-bold'
                                 : cell.weekend && !mark ? 'text-sky-200/80' : 'text-slate-200'}">
                    {cell.day}
                  </span>

                  <!-- Dots in a fixed 2 x 3 block beneath the date. A column is
                       only so wide, but a wallplanner row has height to spare,
                       so the six go DOWN rather than competing for one line —
                       and at a fixed pitch they are big enough to tell apart by
                       colour, which is the only thing a dot has to do.

                       The overflow "+" takes the sixth slot rather than a
                       seventh, so a crowded day never grows a fourth row. -->
                  {#if dots.count}
                    {@const shown = dots.overflow ? dots.categories.slice(0, 5) : dots.categories}
                    {@const filled = shown.length + (dots.overflow ? 1 : 0)}
                    <span class="grid gap-0.5 justify-items-center mt-0.5
                                 {filled === 1 ? 'grid-cols-1' : 'grid-cols-2'}">
                      {#each shown as category}
                        <span class="w-2 h-2 rounded-full {categoryOf(category, categories).dot}
                                     {dots.outstanding ? '' : 'opacity-40'}"></span>
                      {/each}
                      {#if dots.overflow}
                        <span class="text-[9px] text-slate-300 leading-none">+</span>
                      {/if}
                    </span>
                  {/if}
                </button>
              </td>
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  /* Every day column is the same width, and wide enough for two digits and a
     dot beneath them. Thirty-seven of these is wider than most screens, which
     is what the scroll container is for — and what a wall planner is: wide. */
  .planner-year table {
    table-layout: fixed;
    width: max-content;
  }
  .planner-year th:first-child,
  .planner-year td:first-child {
    width: 3.25rem;
  }
  .planner-year thead th:not(:first-child),
  .planner-year tbody td {
    width: 1.6rem;
  }

  /* Provisional print rules. The layout proper is its own piece of work; this
     is enough that a print is legible rather than a dark smear. Weekends keep
     their tint, because losing it would cost the chart its stripes. */
  @media print {
    .planner-year { overflow: visible !important; }
    .planner-year table { width: 100%; }
    .planner-year :global(th),
    .planner-year :global(td) {
      border: 1px solid #999 !important;
      background: transparent !important;
      color: #000 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .planner-year :global(span) {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
