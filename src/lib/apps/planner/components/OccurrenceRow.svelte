<!-- src/lib/apps/planner/components/OccurrenceRow.svelte -->
<!-- One dated thing, and what can be done to it.

     The tick is the point of the app, so it is the largest target on the row
     and sits where the eye starts. Everything else — the note, the move, the
     skip — is behind the row rather than in front of it. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { fmtDate } from '$lib/utils/dates';
  import { STATUS } from '../utils/agenda.js';
  import { categoryOf } from '../utils/categories.js';
  import { describeRule } from '../utils/recurrence.js';

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
</script>

<div class="flex items-start gap-3 p-2.5 rounded border border-slate-700
            bg-slate-800/40 hover:bg-slate-800/70 transition-colors
            {done || skipped ? 'opacity-60' : ''}">

  {#if linked}
    <!-- No tick at all, rather than a disabled one. A disabled tick invites
         the question "why can I not"; a mark that is plainly not a control
         says this belongs elsewhere. -->
    <span class="mt-0.5 w-5 h-5 shrink-0 rounded flex items-center justify-center
                 text-[10px] text-slate-500 border border-slate-700"
          title="Owned by {occurrence.ownerApp}">↗</span>
  {:else}
  <!-- The tick. Disabled rather than hidden for a viewer: a control that
       vanishes leaves the reader wondering where it went. -->
  <button
    type="button"
    class="mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center
           text-xs transition-colors
           {done ? 'bg-green-600 border-green-500 text-white'
                 : 'border-slate-500 text-transparent hover:border-green-500'}
           {canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}"
    disabled={!canEdit}
    title={done ? 'Mark as not done' : 'Mark as done'}
    on:click={() => dispatch('toggle', occurrence)}
  >✓</button>
  {/if}

  <div class="min-w-0 flex-1">
    <div class="flex items-baseline gap-2 flex-wrap">
      <span class="w-1.5 h-1.5 rounded-full shrink-0 {category.dot}"></span>
      <span class="text-sm text-white {done ? 'line-through' : ''}">{series?.title}</span>

      {#if linked}
        <span class="text-[10px] px-1 rounded border {category.chip}">{occurrence.sourceLabel}</span>
      {/if}
      {#if skipped}
        <span class="text-[10px] uppercase tracking-wide text-slate-500">skipped</span>
      {/if}
      {#if occurrence.moved}
        <span class="text-[10px] text-amber-400"
              title="Moved from {fmtDate(occurrence.scheduled_for)}">moved</span>
      {/if}
    </div>

    <p class="text-xs text-slate-500 mt-0.5">
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

    {#if occurrence.note}
      <p class="text-xs text-slate-400 mt-1 italic">{occurrence.note}</p>
    {/if}

    {#if series?.recurrence?.freq && series.recurrence.freq !== 'once'}
      <p class="text-[11px] text-slate-600 mt-0.5">
        {describeRule(series.recurrence, { drifts: series.drifts })}
      </p>
    {/if}
  </div>

  {#if canEdit && !linked}
    <div class="flex items-center gap-1 shrink-0">
      <button type="button" title="Move this one to another date"
              class="text-slate-600 hover:text-amber-300 text-xs px-1"
              on:click={() => dispatch('move', occurrence)}>↦</button>
      <button type="button" title={skipped ? 'Un-skip' : 'Skip this one'}
              class="text-slate-600 hover:text-slate-300 text-xs px-1"
              on:click={() => dispatch('skip', occurrence)}>⊘</button>
      <button type="button" title="Hand this to Maintenance"
              class="text-slate-600 hover:text-sky-300 text-xs px-1"
              on:click={() => dispatch('promote', occurrence)}>⇥</button>
      <button type="button" title="Edit the series"
              class="text-slate-600 hover:text-purple-300 text-xs px-1"
              on:click={() => dispatch('editSeries', series)}>✎</button>
    </div>
  {/if}
</div>
