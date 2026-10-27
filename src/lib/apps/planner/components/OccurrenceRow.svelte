<!-- src/lib/apps/planner/components/OccurrenceRow.svelte -->
<!-- One dated thing, and what can be done to it.

     The tick is the point of the app, so it is the largest target on the row
     and sits where the eye starts. Everything else — the note, the move, the
     skip — is behind the row rather than in front of it. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { fmtDate } from '#lib/utils/dates.js';
  import { STATUS, firstLine } from '../utils/agenda.js';
  import { categoryOf } from '../utils/categories.js';
  import { describeRule, isRecurring } from '../utils/recurrence.js';

  export let occurrence;
  export let canEdit = false;
  /** Overdue rows say how late they are; planned ones do not need to. */
  export let showLateness = false;
  export let daysLate = 0;
  /** The building's categories, so a slug can be resolved to name and colour. */
  export let categories = [];
  /** Profiles, so an owner id can be shown as a name. */
  export let owners = [];

  const dispatch = createEventDispatcher();

  $: series   = occurrence.series;
  $: category = categoryOf(series?.category, categories);
  $: done     = occurrence.status === STATUS.DONE;
  $: skipped  = occurrence.status === STATUS.SKIPPED;
  /**
   * Something another app owns. It is shown, never touched: ticking it here
   * and ticking it there would be two records of one fact.
   */
  $: linked   = !!occurrence.linked;
  $: owner    = owners.find(p => p.id === series?.owner_id)?.full_name ?? null;
  /**
   * A one-off is not a series, and every word on this row has to know it —
   * "skip this one" and "edit the series" both promise dates that do not exist.
   */
  $: recurring = isRecurring(series?.recurrence);
  /** The opening line of the event's notes, if it has any. */
  $: summary   = firstLine(series?.description);
  /**
   * A skip on a one-off is a CANCELLATION — the AGM did not happen — and that
   * is the word for it. On a series it is a skip, because the pattern carries
   * on regardless. Same stored status either way: it is one fact, "this dated
   * thing was deliberately not done", and storing two words for it would make
   * every reader of the column learn both.
   */
  $: notDoneWord = recurring ? 'skipped' : 'cancelled';
  /**
   * Whether this event's category is one the building hands to Maintenance —
   * migration 184. An AGM or a set of accounts is not maintenance work, and a
   * button that makes a job out of one is an invitation to a mess.
   */
</script>

<!-- The tick opens the row, level with the title; what follows sits under it at
     the full width of the row rather than indented beside it. The tick's outline
     is the category's colour (it replaces the coloured dot), filled when done. -->
<div class="p-2.5 rounded border border-slate-700
            bg-slate-800/40 hover:bg-slate-800/70 transition-colors
            {done || skipped ? 'opacity-60' : ''}">

  <div class="flex items-center gap-2 min-h-[1.25rem]">
    {#if linked}
      <!-- No tick at all, rather than a disabled one. A disabled tick invites
           the question "why can I not"; a mark that is plainly not a control
           says this belongs elsewhere. -->
      <span class="w-5 h-5 shrink-0 rounded border-2 {category.edge} flex items-center justify-center
                   text-[10px] text-slate-400"
            title="Owned by {occurrence.ownerApp}">↗</span>
    {:else}
      <!-- Disabled rather than hidden for a viewer: a control that vanishes
           leaves the reader wondering where it went. -->
      <button
        type="button"
        class="w-5 h-5 shrink-0 rounded border-2 {category.edge} flex items-center justify-center
               text-xs transition-colors
               {done ? category.dot + ' text-white' : 'text-transparent hover:bg-slate-700'}
               {canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}"
        disabled={!canEdit}
        title={done ? 'Mark as not done' : 'Mark as done'}
        on:click={() => dispatch('toggle', occurrence)}
      >✓</button>
    {/if}

    <!-- Clicking the text (not the tick or the pencil) opens everything about it,
         read-only. -->
    <div class="min-w-0 flex-1 flex items-center gap-2 flex-wrap cursor-pointer" role="button" tabindex="0"
         title="Show the details"
         on:click={() => dispatch('open', occurrence)}
         on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dispatch('open', occurrence); } }}>
      <span class="text-sm leading-5 text-white {done ? 'line-through' : ''}">{series?.title}</span>

      {#if linked}
        <span class="text-[10px] px-1 rounded border {category.chip}">{occurrence.sourceLabel}</span>
      {/if}
      {#if skipped}
        <span class="text-[10px] uppercase tracking-wide text-slate-500">{notDoneWord}</span>
      {/if}
      {#if occurrence.moved}
        <span class="text-[10px] text-amber-400"
              title="Moved from {fmtDate(occurrence.scheduled_for)}">moved</span>
      {/if}
    </div>

    <!-- One pencil. Moving this date, skipping it and handing it to Maintenance
         are inside the edit dialog, with the series, rather than a row of small
         glyphs to tell apart. -->
    {#if canEdit && !linked}
      <button type="button" title={recurring ? 'Edit — this date or the series' : 'Edit this event'}
              class="shrink-0 text-slate-500 hover:text-purple-300 text-sm px-1 leading-5"
              on:click={() => dispatch('edit', occurrence)}>✎</button>
    {/if}
  </div>

  <div class="cursor-pointer" role="button" tabindex="-1" on:click={() => dispatch('open', occurrence)}
       on:keydown={() => {}}>
    <p class="text-xs text-slate-500 mt-1">
      {fmtDate(occurrence.date)}
      {#if !series?.all_day && series?.start_time}
        · {series.start_time.slice(0, 5)}{#if series.end_time}–{series.end_time.slice(0, 5)}{/if}
      {/if}
      {#if series?.location}· {series.location}{/if}
      {#if owner}· <span class="text-slate-400">{owner}</span>{/if}
      {#if linked}· <span class="text-slate-600">in {occurrence.ownerApp}</span>{/if}
      {#if showLateness && daysLate > 0}
        · <span class="text-red-400">{daysLate} day{daysLate === 1 ? '' : 's'} late</span>
      {/if}
      {#if done && occurrence.completed_on && occurrence.completed_on !== occurrence.date}
        · <span class="text-green-400">done {fmtDate(occurrence.completed_on)}</span>
      {/if}
    </p>

    <!-- The first line of the notes. A whole description would turn an agenda
         into a wall of text, but a row with no hint of what a title means costs
         a click to find out — one line is what fits and usually what is needed.
         Clipped rather than wrapped, so every row stays the same height. -->
    {#if summary}
      <p class="text-xs text-slate-400 mt-0.5 truncate" title={series.description}>{summary}</p>
    {/if}

    {#if occurrence.note}
      <p class="text-xs text-slate-400 mt-1 italic">{occurrence.note}</p>
    {/if}

    {#if recurring}
      <p class="text-[11px] text-slate-600 mt-0.5">
        {describeRule(series.recurrence, { drifts: series.drifts })}
      </p>
    {/if}
  </div>
</div>
