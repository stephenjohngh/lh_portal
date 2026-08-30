<!-- src/lib/apps/planner/components/MonthGrid.svelte -->
<!-- One month, with room to read.

     The year grid answers "what does this year look like" in dots; this answers
     "what is actually happening in March" in words. That is the whole reason to
     have both, and why this is not simply a bigger version of the other one:
     a cell here shows titles, times and what is already done. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { buildMonthGrid, WEEKDAY_LABELS } from '../utils/monthGrid.js';
  import { categoryOf, markStyle } from '../utils/categories.js';
  import { STATUS } from '../utils/agenda.js';

  export let year;
  export let month;
  export let occurrences = [];
  export let categories = [];
  export let today = null;
  /** Days shaded on the chart, keyed by date. */
  export let marks = new Map();

  const dispatch = createEventDispatcher();

  $: grid = buildMonthGrid(year, month, occurrences, today);

  /** Past this a cell would grow taller than its neighbours and break the row. */
  const PER_DAY = 4;
</script>

<div class="planner-month">
  <table class="w-full border-collapse table-fixed">
    <caption class="sr-only">{grid.label}</caption>

    <thead>
      <tr>
        {#each WEEKDAY_LABELS as label, i}
          <th class="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide
                     text-left border-b border-slate-600
                     {i >= 5 ? 'text-slate-500 bg-slate-900/60' : 'text-slate-300 bg-slate-800/60'}"
          >{label}</th>
        {/each}
      </tr>
    </thead>

    <tbody>
      {#each grid.weeks as week}
        <tr>
          {#each week as day}
            <!-- Three tones, not one. A month of near-black cells with a hairline
                 between them reads as a dark rectangle: the eye needs the
                 weekend to be a different SURFACE, not a slightly different
                 shade of the same one, and it needs to see where the weeks
                 divide without hunting. -->
            {@const mark = markStyle(marks.get(day.date))}
            <td class="align-top p-0 border border-slate-600/70
                       {mark ? mark.wash
                         : day.outside ? 'bg-slate-900/70'
                         : day.weekend ? 'bg-slate-900/40' : 'bg-slate-800/70'}
                       {day.today ? 'ring-2 ring-inset ring-purple-500/70' : ''}">
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <div class="h-24 p-1 overflow-hidden cursor-pointer hover:bg-slate-700/30
                          transition-colors"
                   on:click={() => dispatch('selectDay', day)}>

                <div class="flex items-baseline gap-1">
                  <!-- The date is the thing you scan for, so it is legible
                       rather than decorative. -->
                  <span class="text-xs tabular-nums font-medium
                               {day.today ? 'text-white font-bold'
                                 : day.outside ? 'text-slate-600' : 'text-slate-300'}">
                    {day.day}
                  </span>
                  {#if day.today}
                    <span class="text-[9px] uppercase tracking-wide text-purple-300">today</span>
                  {/if}
                  {#if mark}
                    <!-- Named, not merely coloured. A shaded square nobody can
                         explain is a puzzle. -->
                    <span class="text-[9px] text-slate-300 truncate">{mark.label}</span>
                  {/if}
                </div>

                <div class="mt-0.5 space-y-0.5">
                  {#each day.items.slice(0, PER_DAY) as item}
                    {@const category = categoryOf(item.series?.category, categories)}
                    {@const done = item.status === STATUS.DONE || item.status === STATUS.SKIPPED}
                    <div class="flex items-center gap-1 text-[10px] leading-tight
                                {done ? 'opacity-50' : ''}"
                         title="{item.series?.title}{item.linked ? ` — in ${item.ownerApp}` : ''}">
                      <span class="w-1 h-1 rounded-full shrink-0 {category.dot}"></span>
                      {#if !item.series?.all_day && item.series?.start_time}
                        <span class="text-slate-500 shrink-0 tabular-nums">
                          {item.series.start_time.slice(0, 5)}
                        </span>
                      {/if}
                      <span class="truncate {done ? 'line-through text-slate-500' : 'text-slate-200'}">
                        {item.series?.title}
                      </span>
                    </div>
                  {/each}

                  {#if day.items.length > PER_DAY}
                    <!-- Said as a number rather than shown, because a cell that
                         grows to fit breaks the row it is in. -->
                    <div class="text-[10px] text-slate-500">
                      +{day.items.length - PER_DAY} more
                    </div>
                  {/if}
                </div>
              </div>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  /* Narrower than this and a title is one word per line, so it scrolls. */
  .planner-month table {
    min-width: 40rem;
  }

  /* Provisional, like the year grid's — the print layout proper is its own
     piece of work. Enough that a month prints legibly rather than as a dark
     rectangle. */
  @media print {
    .planner-month table { min-width: 0; }
    .planner-month :global(th),
    .planner-month :global(td) {
      border: 1px solid #999 !important;
      background: transparent !important;
      color: #000 !important;
    }
    .planner-month :global(span) {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
