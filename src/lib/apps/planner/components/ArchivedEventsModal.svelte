<!-- src/lib/apps/planner/components/ArchivedEventsModal.svelte -->
<!-- Series taken off the planner with Archive, and the way back. Archiving
     removes a series from every view, so this list is the only place one can be
     found again. Restoring puts it back exactly as it was, with everything
     recorded against it. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from '#lib/components/common/Modal.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import { fmtDateOnly } from '#lib/utils/dates.js';
  import { describeRule } from '../utils/recurrence.js';
  import { categoryOf } from '../utils/categories.js';
  import { archivedSeries, staleStart } from '../utils/agenda.js';
  import { isRecurring } from '../utils/recurrence.js';
  const isRepeating = (e) => isRecurring(e.recurrence);

  export let show = false;
  export let events = [];
  export let categories = [];
  export let canEdit = false;
  /** Today, for noticing a start date that has long passed. */
  export let today = '';

  const dispatch = createEventDispatcher();
  $: list = archivedSeries(events);
</script>

<Modal bind:show title="Archived events" size="large" on:close={() => dispatch('close')}>
  {#if list.length === 0}
    <p class="text-sm text-slate-400">Nothing has been archived.</p>
  {:else}
    <p class="text-[11px] text-slate-500 mb-2">
      These are off the planner. Restore one and it comes back as it was, with
      every tick, note and skip recorded against it.
    </p>
    <div class="space-y-1.5">
      {#each list as event (event.id)}
        <div class="flex items-center gap-3 p-2 rounded border border-slate-700 bg-slate-800/40">
          <div class="flex-1 min-w-0">
            <p class="text-sm text-white truncate">{event.title}</p>
            <p class="text-xs text-slate-500">
              {categoryOf(event.category, categories)?.name ?? 'No category'}
              · from {fmtDateOnly(event.start_date)}
              · {describeRule(event.recurrence, { drifts: event.drifts })}
            </p>
          </div>
          {#if canEdit}
            <div class="flex items-center gap-1.5 shrink-0">
              <Button variant="primary" size="small" on:click={() => dispatch('restore', { event, edit: true })}>Restore and set dates…</Button>
              <Button variant="tertiary" size="xs" on:click={() => dispatch('restore', { event, edit: false })}>Restore as it was</Button>
            </div>
          {/if}
        </div>
        {#if canEdit && staleStart(event, today)}
          <p class="text-[11px] text-amber-300 -mt-1 mb-1 px-2">
            ⚠ Its dates are in the past. {isRepeating(event) ? 'Restored as it was, every date since ' + fmtDateOnly(event.start_date) + ' will show as overdue' : 'Restored as it was, it will show as overdue'} — use <strong>Restore and set dates…</strong> to give it new ones.
          </p>
        {/if}
      {/each}
    </div>
  {/if}
</Modal>
