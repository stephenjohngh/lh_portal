<!-- src/lib/apps/planner/components/PlannerPrint.svelte -->
<!-- The planner, on paper.

     A print-only rendering rather than a stylesheet over the screen one. The
     two are not the same picture: the screen has hover, a day panel, buttons
     and a dark ground; paper has page breaks, a heading that has to say what it
     is, and no way to ask a question of a cell. Trying to make one set of
     markup serve both is how print stylesheets end up as a list of things
     hidden.

     What is printed is WHAT IS ON SCREEN. This component is handed the same
     filtered occurrences the grids get, so the category filter and the "other
     apps" switch carry through — and the heading says which, because a chart
     that quietly omits half the year is worse than no chart.

     Styles live in planner-print.css, which PlannerApp imports. -->
<script>
  import { buildYearGrid, cellMarks, columnWeekdays, WEEKDAY_SHORT } from '../utils/yearGrid.js';
  import { buildMonthGrid } from '../utils/monthGrid.js';
  import { categoryOf, swatch, pickable } from '../utils/categories.js';
  import { fmtGenerated } from '$lib/utils/dates';

  export let year;
  /** 'chart' — the whole year on one sheet. 'months' — one month per sheet. */
  export let layout = 'chart';
  /** Which months to print, 1-12, in order. */
  export let months = [];
  /** Already filtered — see the header comment. */
  export let occurrences = [];
  export let categories = [];
  export let marks = new Map();
  /** One line saying what was left out, so the paper is honest about it. */
  export let filterNote = '';

  const COLUMNS = columnWeekdays();

  $: yearGrid = buildYearGrid(year, occurrences)
    .filter(row => months.includes(row.month));

  /**
   * Only the categories actually present, so a legend describes this chart
   * rather than the building's whole vocabulary.
   */
  $: usedSlugs = new Set(
    occurrences
      .filter(o => o.date?.startsWith(String(year)))
      .map(o => o.series?.category ?? null),
  );
  $: legend = pickable(categories).filter(c => usedSlugs.has(c.slug));

  /** A day's dots, resolved to real colours — paper has no Tailwind. */
  function inks(items) {
    const { categories: slugs, overflow } = cellMarks(items, 6);
    return {
      inks: slugs.map(slug => categoryOf(slug, categories).ink ?? swatch(null).ink),
      overflow,
    };
  }

  const time = (item) => (item.series?.all_day ? '' : (item.series?.start_time ?? '').slice(0, 5));
</script>

<div class="planner-print-host">
  {#if layout === 'chart'}
    <section class="print-page">
      <header class="print-head">
        <div class="print-title">Planner {year}</div>
        <div class="print-sub">
          {filterNote}<br />{fmtGenerated()}
        </div>
      </header>

      <table class="print-year">
        <thead>
          <tr>
            <th class="month-cell">{year}</th>
            {#each COLUMNS as weekday}
              <th class={weekday >= 5 ? 'weekend' : ''}>{WEEKDAY_SHORT[weekday].slice(0, 1)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each yearGrid as month}
            <tr>
              <th class="month-cell" scope="row">{month.short}</th>
              {#each month.slots as cell, column}
                {#if !cell}
                  <td class="outside"></td>
                {:else}
                  {@const dots = inks(cell.items)}
                  {@const mark = marks.get(cell.date)}
                  <td class={mark ? 'marked' : cell.weekend ? 'weekend' : ''}
                      title={mark?.label ?? ''}>
                    <div class="day">{cell.day}</div>
                    {#if dots.inks.length}
                      <div class="print-dots">
                        {#each dots.inks as ink}
                          <span class="print-dot" data-ink style="--ink: {ink}"></span>
                        {/each}
                        {#if dots.overflow}<span class="day">+</span>{/if}
                      </div>
                    {/if}
                  </td>
                {/if}
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>

      {#if legend.length}
        <div class="print-legend">
          {#each legend as category}
            <span class="key">
              <span class="print-dot" data-ink style="--ink: {swatch(category.colour).ink}"></span>
              {category.name}
            </span>
          {/each}
        </div>
      {/if}
    </section>

  {:else}
    {#each months as month}
      {@const grid = buildMonthGrid(year, month, occurrences)}
      <section class="print-page">
        <header class="print-head">
          <div class="print-title">{grid.label}</div>
          <div class="print-sub">{filterNote}<br />{fmtGenerated()}</div>
        </header>

        <table class="print-month">
          <thead>
            <tr>
              {#each WEEKDAY_SHORT as day}<th>{day}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each grid.weeks as week}
              <tr>
                {#each week as day}
                  {@const mark = marks.get(day.date)}
                  <td class={day.outside ? 'adjacent' : ''}>
                    <div class="date">{day.day}</div>
                    {#if mark}<div class="mark-label">{mark.label}</div>{/if}
                    {#each day.items as item}
                      <div class="item {item.status === 'done' ? 'done' : ''}">
                        <span class="print-dot" data-ink
                              style="--ink: {categoryOf(item.series?.category, categories).ink ?? swatch(null).ink}"></span>
                        <span>
                          {#if time(item)}<span class="when">{time(item)}</span> {/if}{item.series?.title}
                        </span>
                      </div>
                    {/each}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/each}
  {/if}
</div>
