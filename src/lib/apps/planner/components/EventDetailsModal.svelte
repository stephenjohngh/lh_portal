<!-- src/lib/apps/planner/components/EventDetailsModal.svelte
     One dated thing, read-only, with everything the edit form holds — what a
     person gets by clicking an event's text. It is also how something owned by
     another app is read, since that cannot be edited here. Editing is one
     button away (the same dialog the pencil on the row opens). -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal  from '#lib/components/common/Modal.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import { fmtDateLong } from '#lib/utils/dates.js';
  import { STATUS } from '../utils/agenda.js';
  import { categoryOf } from '../utils/categories.js';
  import { describeRule, isRecurring } from '../utils/recurrence.js';

  export let show = false;
  /** The occurrence being read, or null. */
  export let occurrence = null;
  export let categories = [];
  export let owners = [];
  export let canEdit = false;

  const dispatch = createEventDispatcher();

  $: series    = occurrence?.series ?? null;
  $: category  = categoryOf(series?.category, categories);
  $: linked    = !!occurrence?.linked;
  $: owner     = owners.find((p) => p.id === series?.owner_id)?.full_name ?? null;
  $: recurring = isRecurring(series?.recurrence);
  $: state =
    occurrence?.status === STATUS.DONE ? 'Done' :
    occurrence?.status === STATUS.SKIPPED ? (recurring ? 'Skipped' : 'Cancelled') : null;
  $: when = !series ? '' : series.all_day || !series.start_time
    ? 'All day'
    : `${series.start_time.slice(0, 5)}${series.end_time ? '–' + series.end_time.slice(0, 5) : ''}`;

  function close() { show = false; dispatch('close'); }
</script>

<Modal bind:show title={series?.title ?? 'Event'} size="medium" on:close={close}>
  {#if occurrence && series}
    <dl class="text-sm space-y-2.5" data-testid="event-details">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full shrink-0 {category.dot}"></span>
        <span class="text-slate-200">{category.name}</span>
        {#if linked}
          <span class="text-[10px] px-1 rounded border {category.chip}">{occurrence.sourceLabel}</span>
        {/if}
        {#if state}<span class="text-xs uppercase tracking-wide text-slate-400">{state}</span>{/if}
      </div>

      <div>
        <dt class="text-xs text-slate-500">When</dt>
        <dd class="text-slate-200">
          {fmtDateLong(occurrence.date)} · {when}
          {#if occurrence.moved}<span class="text-amber-400 text-xs">· moved from {fmtDateLong(occurrence.scheduled_for)}</span>{/if}
          {#if occurrence.completed_on && occurrence.status === STATUS.DONE}
            <span class="text-green-400 text-xs">· done {fmtDateLong(occurrence.completed_on)}</span>
          {/if}
        </dd>
      </div>

      {#if series.location}
        <div><dt class="text-xs text-slate-500">Where</dt><dd class="text-slate-200">{series.location}</dd></div>
      {/if}
      {#if owner}
        <div><dt class="text-xs text-slate-500">Owner</dt><dd class="text-slate-200">{owner}</dd></div>
      {/if}
      {#if linked}
        <div><dt class="text-xs text-slate-500">Kept in</dt>
          <dd class="text-slate-200">{occurrence.ownerApp} — it is completed there, not here.</dd></div>
      {:else}
        <div>
          <dt class="text-xs text-slate-500">Repeats</dt>
          <dd class="text-slate-200">{recurring ? describeRule(series.recurrence, { drifts: series.drifts }) : 'Once'}</dd>
        </div>
        {#if series.lead_days != null}
          <div><dt class="text-xs text-slate-500">Days of notice</dt><dd class="text-slate-200">{series.lead_days}</dd></div>
        {/if}
      {/if}

      {#if series.description}
        <div>
          <dt class="text-xs text-slate-500">Notes</dt>
          <dd class="text-slate-300 whitespace-pre-wrap">{series.description}</dd>
        </div>
      {/if}
      {#if occurrence.note}
        <div>
          <dt class="text-xs text-slate-500">Note on this date</dt>
          <dd class="text-slate-300 italic whitespace-pre-wrap">{occurrence.note}</dd>
        </div>
      {/if}
    </dl>
  {/if}

  <div slot="footer" class="flex items-center gap-2">
    <div class="flex-1"></div>
    <Button variant="secondary" on:click={close}>Close</Button>
    {#if canEdit && !linked}
      <Button variant="primary" on:click={() => dispatch('edit', occurrence)}>Edit</Button>
    {/if}
  </div>
</Modal>
