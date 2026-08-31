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
  /**
   * Grow to fill the space instead of keeping a fixed cell size.
   *
   * On a page the chart is wider than the window and scrolls sideways, which is
   * what a wall planner is. Given a whole screen, that is the wrong answer: the
   * width is finally enough, and 37 narrow columns in the middle of a large
   * display is a smaller planner in a bigger box.
   *
   * So `fit` divides the width across the columns and the height across the
   * twelve months, and scales the type and the dots with them. Every size below
   * is a custom property for exactly this reason — one switch, no second
   * layout to keep in step.
   */
  export let fit = false;

  const dispatch = createEventDispatcher();

  $: grid = buildYearGrid(year, occurrences, today);

  const COLUMNS = columnWeekdays();
</script>

<div class="overflow-x-auto planner-year" class:fit>
  <table class="border-collapse">
    <caption class="sr-only">Planner for {year}</caption>

    <thead>
      <tr>
        <th class="sticky left-0 z-20 bg-slate-700 text-left px-2 py-1
                   text-[11px] text-slate-100 font-semibold border border-slate-600">
          {year}
        </th>
        {#each COLUMNS as weekday}
          <th class="weekday px-0 py-1 font-semibold uppercase border border-slate-700
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
                    class="month-name w-full text-left px-2 py-1 font-semibold
                           text-slate-100 hover:bg-slate-600 transition-colors"
                    title="Open {month.label}"
                    on:click={() => dispatch('selectMonth', month.month)}>{month.short}</button>
          </th>

          {#each month.slots as cell, column}
            {#if !cell}
              <!-- Before the 1st or after the last. Empty, and visibly outside
                   the month rather than merely dark. -->
              <td class="border border-slate-800 bg-slate-950/80
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
                  class="w-full h-full px-0.5 pt-0.5 flex flex-col items-center
                         hover:bg-slate-600/50 transition-colors"
                  title="{cell.date}{mark ? ` — ${mark.label}` : ''}{dots.count ? ` — ${dots.count} item${dots.count === 1 ? '' : 's'}` : ''}"
                  on:click={() => dispatch('selectDay', cell)}
                >
                  <!-- The DATE, in every cell. Without it the chart has to be
                       counted rather than read. -->
                  <span class="day-num tabular-nums leading-none
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
                        <span class="dot rounded-full {categoryOf(category, categories).dot}
                                     {dots.outstanding ? '' : 'opacity-40'}"></span>
                      {/each}
                      {#if dots.overflow}
                        <span class="dot-more text-slate-300 leading-none">+</span>
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
  /* Every size the chart is made of, in one place — so "fill the screen" is a
     handful of new values rather than a second layout. */
  .planner-year {
    --cell-w: 1.6rem;
    --cell-h: 3rem;
    --head-w: 3.25rem;
    --date-size: 10px;
    --dot-size: 0.5rem;
    --weekday-size: 9px;
    --month-size: 11px;
  }

  /* Every day column is the same width, and wide enough for two digits and a
     dot beneath them. Thirty-seven of these is wider than most screens, which
     is what the scroll container is for — and what a wall planner is: wide. */
  .planner-year table {
    table-layout: fixed;
    width: max-content;
  }
  .planner-year th:first-child,
  .planner-year td:first-child {
    width: var(--head-w);
  }
  .planner-year thead th:not(:first-child),
  .planner-year tbody td {
    width: var(--cell-w);
  }
  .planner-year tbody td {
    height: var(--cell-h);
  }

  .day-num     { font-size: var(--date-size); }
  .weekday     { font-size: var(--weekday-size); }
  .month-name  { font-size: var(--month-size); }
  .dot         { width: var(--dot-size); height: var(--dot-size); }
  .dot-more    { font-size: calc(var(--dot-size) * 1.15); }

  /* ── Filling a screen ────────────────────────────────────────────────────
     Width: `width: 100%` with `table-layout: fixed` and only the month column
     pinned — the browser divides the remainder across the 37 day columns, so
     there is no arithmetic here to get wrong on a screen nobody tested.

     Height: twelve rows share what is left after the app's own header, which
     the 13rem stands for. It is the one measured guess in this file; if it is
     a little out the shell scrolls, which is why `max()` keeps the rows at
     their page size rather than letting them collapse on a short screen.

     Type and dots scale with the viewport and are clamped at both ends: a wall
     planner is read from across a room, but the numbers should not become a
     headline on a 4K display. */
  .planner-year.fit {
    --cell-h: max(3rem, calc((100vh - 13rem) / 12));
    --head-w: 4.5rem;
    --date-size: clamp(10px, 0.85vw, 20px);
    --dot-size: clamp(0.5rem, 0.6vw, 1rem);
    --weekday-size: clamp(9px, 0.6vw, 15px);
    --month-size: clamp(11px, 0.75vw, 18px);
    overflow-x: hidden;
  }
  .planner-year.fit table {
    width: 100%;
  }
  .planner-year.fit thead th:not(:first-child),
  .planner-year.fit tbody td {
    width: auto;
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
