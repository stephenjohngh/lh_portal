<!-- src/lib/apps/planner/PlannerApp.svelte -->
<!-- The Planner: the building's recurring year, and what is outstanding.
     Design and decisions: docs/requirements/Planner_App_Analysis.md.

     P0 is the agenda. The year grid (P1) and reading other apps' dated items
     (P2) come next, and the model was built first on purpose — the hard part is
     series-versus-occurrence, and everything else depends on it being right. -->
<script>
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { plannerStore } from './stores/plannerStore.js';
  import { buildOccurrences, agenda, describeAgenda, BUCKETS, STATUS } from './utils/agenda.js';
  import { addDaysISO, daysBetween } from './utils/recurrence.js';
  import { CATEGORIES } from './utils/categories.js';
  import { today } from '$lib/utils/dates';

  import Button        from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import OccurrenceRow from './components/OccurrenceRow.svelte';
  import EventFormModal from './components/EventFormModal.svelte';

  /**
   * The window occurrences are expanded over.
   *
   * Two years forward, as decided: a five-yearly inspection should appear while
   * there is still time to plan for it. A year back, so something missed last
   * autumn is still visible — the planner's job includes saying what did not
   * happen.
   */
  const WINDOW_BACK_DAYS = 365;
  const WINDOW_AHEAD_DAYS = 730;

  const now = today();
  const from = addDaysISO(now, -WINDOW_BACK_DAYS);
  const to   = addDaysISO(now, WINDOW_AHEAD_DAYS);

  $: state = $plannerStore;
  $: canEdit = $permissions.isAdmin || $permissions.canModify;

  let categoryFilter = '';
  let showDone = false;

  $: occurrences = buildOccurrences(state.events, state.occurrences, from, to)
    .filter(o => !categoryFilter || o.series?.category === categoryFilter);

  $: groups = agenda(occurrences, now);
  $: summary = describeAgenda(groups);

  // ── Actions ───────────────────────────────────────────────────────────────

  let formOpen = false;
  let editing = null;
  let formRef;
  let error = '';

  function newEvent()  { editing = null; formOpen = true; }
  function editSeries(series) { editing = series; formOpen = true; }

  async function saveEvent(e) {
    const target = editing;                 // captured before the await
    try {
      if (target) await plannerStore.updateEvent(target.id, e.detail, $auth.user.id);
      else        await plannerStore.createEvent(e.detail, $auth.user.id);
      formOpen = false;
      editing = null;
    } catch (err) {
      formRef?.fail(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleDone(e) {
    const occurrence = e.detail;
    const status = occurrence.status === STATUS.DONE ? STATUS.DUE : STATUS.DONE;
    try {
      // Recorded as done TODAY, not on the date it was due — a drifting series
      // counts from this, and the two are often different.
      await plannerStore.recordOccurrence(occurrence,
        { status, on: status === STATUS.DONE ? now : null }, $auth.user.id);
    } catch (err) { error = err instanceof Error ? err.message : String(err); }
  }

  async function toggleSkip(e) {
    const occurrence = e.detail;
    const status = occurrence.status === STATUS.SKIPPED ? STATUS.DUE : STATUS.SKIPPED;
    try {
      await plannerStore.recordOccurrence(occurrence, { status }, $auth.user.id);
    } catch (err) { error = err instanceof Error ? err.message : String(err); }
  }

  /** Moving one occurrence, which never touches the pattern. */
  let moving = null;
  let moveTo = '';

  function requestMove(e) {
    moving = e.detail;
    moveTo = e.detail.date;
  }

  async function confirmMove() {
    const occurrence = moving;
    const date = moveTo;
    moving = null;
    if (!occurrence || !date) return;
    try {
      await plannerStore.moveOccurrence(occurrence, date, $auth.user.id);
    } catch (err) { error = err instanceof Error ? err.message : String(err); }
  }

  onMount(async () => {
    await permissions.init($auth.user.id, 'planner');
    try { await plannerStore.load(); }
    catch (err) { error = err instanceof Error ? err.message : String(err); }
  });
</script>

<div class="p-4">

  {#if error}
    <div class="mb-3"><ErrorDisplay message={error} onDismiss={() => error = ''} /></div>
  {/if}
  {#if state.error}
    <div class="mb-3">
      <ErrorDisplay message={state.error} onDismiss={() => plannerStore.clearError()} />
    </div>
  {/if}

  <!-- Header -->
  <div class="flex items-start gap-3 mb-4 flex-wrap">
    <div class="min-w-0">
      <h2 class="text-sm font-semibold text-white">Planner</h2>
      <p class="text-xs text-slate-500 mt-0.5">{summary}</p>
    </div>

    <div class="flex-1"></div>

    <div class="flex items-center gap-2 shrink-0">
      <select bind:value={categoryFilter}
              class="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded
                     text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
        <option value="">All categories</option>
        {#each CATEGORIES as c}
          <option value={c.value}>{c.label}</option>
        {/each}
      </select>

      <ProtectedButton variant="primary" size="small" on:click={newEvent}>
        + New event
      </ProtectedButton>
    </div>
  </div>

  {#if state.loading && !state.events.length}
    <div class="flex justify-center py-10"><LoadingSpinner /></div>

  {:else if !state.events.length}
    <div class="text-center py-12 text-slate-500">
      <p class="text-sm">The year is empty.</p>
      <p class="text-xs mt-2 max-w-md mx-auto">
        Add the things the building expects — the AGM, insurance renewal, meter
        readings, gutters each autumn — and they will appear here as they come
        round.
      </p>
    </div>

  {:else}
    <div class="space-y-5">
      {#each BUCKETS as bucket}
        {@const items = groups[bucket.key]}
        {#if bucket.key !== 'done' || showDone}
          {#if items.length}
            <div>
              <div class="flex items-center gap-2 mb-2">
                <h3 class="text-xs uppercase tracking-wide font-semibold
                           {bucket.key === 'overdue' ? 'text-red-400'
                             : bucket.key === 'due_soon' ? 'text-amber-400' : 'text-slate-500'}">
                  {bucket.label}
                </h3>
                <span class="text-xs text-slate-600">{items.length}</span>
              </div>

              <div class="space-y-1.5">
                {#each items as occurrence (occurrence.event_id + occurrence.scheduled_for)}
                  <OccurrenceRow
                    {occurrence}
                    {canEdit}
                    showLateness={bucket.key === 'overdue'}
                    daysLate={daysBetween(occurrence.date, now)}
                    on:toggle={toggleDone}
                    on:skip={toggleSkip}
                    on:move={requestMove}
                    on:editSeries={(e) => editSeries(e.detail)}
                  />
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      {/each}

      <button type="button" class="text-xs text-slate-500 hover:text-slate-300"
              on:click={() => showDone = !showDone}>
        {showDone ? 'Hide' : 'Show'} what is done ({groups.done.length})
      </button>
    </div>
  {/if}
</div>

<EventFormModal
  bind:this={formRef}
  bind:show={formOpen}
  event={editing}
  on:save={saveEvent}
  on:close={() => { formOpen = false; editing = null; }}
/>

<ConfirmDialog
  show={!!moving}
  title="Move this one?"
  message={moving
    ? `Only this occurrence of “${moving.series?.title}” moves. The pattern is unchanged.`
    : ''}
  confirmText="Move"
  on:confirm={confirmMove}
  on:cancel={() => moving = null}
/>

{#if moving}
  <!-- The date sits with the confirmation rather than in a form of its own:
       there is one field, and asking twice for one field is a dialog too many. -->
  <div class="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
    <div class="pointer-events-auto bg-slate-800 border border-slate-600 rounded
                px-3 py-2 shadow-lg mt-32">
      <label class="text-xs text-slate-400 block mb-1" for="planner-move-to">Move to</label>
      <input id="planner-move-to" type="date" bind:value={moveTo}
             class="px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-white
                    focus:outline-none focus:ring-1 focus:ring-purple-500" />
    </div>
  </div>
{/if}
