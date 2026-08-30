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
  import { profiles, profilesStore } from '$lib/stores/profiles';
  import { buildOccurrences, agenda, describeAgenda, BUCKETS, STATUS } from './utils/agenda.js';
  import { addDaysISO, daysBetween } from './utils/recurrence.js';
  import { pickable, swatch, marksByDate } from './utils/categories.js';
  import { SOURCES } from './utils/linked.js';
  import { today, fmtDateLong } from '$lib/utils/dates';

  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import OccurrenceRow from './components/OccurrenceRow.svelte';
  import EventFormModal from './components/EventFormModal.svelte';
  import CategoriesModal from './components/CategoriesModal.svelte';
  import DayMarkControl from './components/DayMarkControl.svelte';
  import MultiSelectDropdown from '$lib/components/common/MultiSelectDropdown.svelte';
  import YearGrid from './components/YearGrid.svelte';
  import MonthGrid from './components/MonthGrid.svelte';
  import { stepMonth, buildMonthGrid } from './utils/monthGrid.js';
  import { yearsInWindow } from './utils/yearGrid.js';

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

  /**
   * Categories to show. Empty means all of them — the same convention the
   * Components tab uses, so a filter bar behaves the same way in both places.
   *
   * A Set rather than an array because MultiSelectDropdown binds one, and
   * because "is this category showing" is asked once per occurrence per render.
   */
  let categoryFilter = new Set();
  let openDropdown = null;
  let showDone = false;

  // ── Which view ────────────────────────────────────────────────────────────
  // The agenda answers "what should I be doing"; the year answers "what does
  // this year look like". They are different questions, and a wallplanner that
  // could only answer the second would not be much use on a Monday morning.
  let view = 'agenda';
  let year = Number(now.slice(0, 4));
  let month = Number(now.slice(5, 7));
  let selectedDay = null;

  /** Paging the month view, stopped at the edges of the expanded window. */
  function goMonth(step) {
    const next = stepMonth(year, month, step, { from, to });
    if (!next) return;
    year = next.year;
    month = next.month;
    selectedDay = null;
  }

  $: monthLabel = buildMonthGrid(year, month, []).label;

  $: years = yearsInWindow(from, to);
  /** Shaded days, keyed by date, so a grid can ask per cell without scanning. */
  $: dayMarks = marksByDate(state.dayMarks);
  $: dayItems = selectedDay
    ? occurrences.filter(o => o.date === selectedDay)
    : [];

  /**
   * Show what the other apps have as well.
   *
   * On by default: the point of the app is one year, not the planner's own
   * corner of it. The switch exists for the case where one source drowns the
   * rest — a building with weekly maintenance jobs, most likely.
   */
  let showLinked = true;

  $: occurrences = [
    ...buildOccurrences(state.events, state.occurrences, from, to),
    ...(showLinked ? state.linked : []),
  ]
    .filter(o => categoryFilter.size === 0 || categoryFilter.has(o.series?.category))
    .sort((a, b) => a.date.localeCompare(b.date));

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

  async function archiveEvent(e) {
    const { event, archived } = e.detail;
    try {
      await plannerStore.archiveEvent(event.id, archived, $auth.user.id);
      formOpen = false;
      editing = null;
    } catch (err) { error = err instanceof Error ? err.message : String(err); }
  }

  async function removeEvent(e) {
    const target = e.detail;                // captured before the await
    try {
      await plannerStore.deleteEvent(target.id, target.title);
      formOpen = false;
      editing = null;
    } catch (err) { error = err instanceof Error ? err.message : String(err); }
  }

  // ── Shaded days ───────────────────────────────────────────────────────────

  async function setDayMark(e) {
    const { date, label, colour } = e.detail;
    try { await plannerStore.setDayMark(date, { label, colour }, $auth.user.id); }
    catch (err) { error = err instanceof Error ? err.message : String(err); }
  }

  async function clearDayMark(e) {
    try { await plannerStore.clearDayMark(e.detail.date); }
    catch (err) { error = err instanceof Error ? err.message : String(err); }
  }

  // ── Promotion ─────────────────────────────────────────────────────────────

  let promoting = null;
  let promoteOn = '';
  let promoteBusy = false;

  function requestPromote(e) {
    promoting = e.detail;
    promoteOn = e.detail.date;
  }

  async function confirmPromote() {
    const occurrence = promoting;
    const onDate = promoteOn;
    if (!occurrence) return;

    promoteBusy = true;
    try {
      await plannerStore.promoteToMaintenance(occurrence.series, onDate, $auth.user.id);
      // Read the aggregation again: the job did not exist when it was last
      // asked, and without this the event vanishes with nothing in its place.
      await plannerStore.loadLinked(from, to);
      promoting = null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      promoteBusy = false;
    }
  }

  // ── Categories ────────────────────────────────────────────────────────────

  let categoriesOpen = false;
  let categoryError = '';

  async function createCategory(e) {
    try { await plannerStore.createCategory(e.detail, $auth.user.id); }
    catch (err) { categoryError = err instanceof Error ? err.message : String(err); }
  }

  async function updateCategory(e) {
    const { id, ...fields } = e.detail;
    try { await plannerStore.updateCategory(id, fields, $auth.user.id); }
    catch (err) { categoryError = err instanceof Error ? err.message : String(err); }
  }

  async function deleteCategory(e) {
    try { await plannerStore.deleteCategory(e.detail.id, e.detail.name); }
    catch (err) { categoryError = err instanceof Error ? err.message : String(err); }
  }

  /** Moving one occurrence, which never touches the pattern. */
  let moving = null;
  let moveTo = '';

  let movingOpen = false;

  function requestMove(e) {
    moving = e.detail;
    moveTo = e.detail.date;
    movingOpen = true;
  }

  async function confirmMove() {
    const occurrence = moving;
    const date = moveTo;
    movingOpen = false;
    moving = null;
    if (!occurrence || !date) return;
    try {
      await plannerStore.moveOccurrence(occurrence, date, $auth.user.id);
    } catch (err) { error = err instanceof Error ? err.message : String(err); }
  }

  onMount(async () => {
    await permissions.init($auth.user.id, 'planner');
    profilesStore.load();
    try { await plannerStore.load(); }
    catch (err) { error = err instanceof Error ? err.message : String(err); }

    // Not awaited into the first paint: the planner's own year is the app, and
    // four cross-app reads should not hold it back. Each of those four is
    // allowed to fail alone — see the store.
    plannerStore.loadLinked(from, to).catch(() => {});
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
      <div class="flex rounded border border-slate-600 overflow-hidden text-xs">
        {#each [['agenda', 'Agenda'], ['month', 'Month'], ['year', 'Year']] as [key, label]}
          <button type="button"
                  class="px-2.5 py-1 transition-colors
                         {view === key ? 'bg-purple-600 text-white'
                                       : 'text-slate-400 hover:bg-slate-700'}"
                  on:click={() => { view = key; selectedDay = null; }}>{label}</button>
        {/each}
      </div>

      {#if view === 'month'}
        <div class="flex items-center gap-1">
          <button type="button" title="Previous month"
                  class="px-1.5 py-1 text-xs text-slate-400 hover:text-white
                         border border-slate-600 rounded"
                  on:click={() => goMonth(-1)}>←</button>
          <span class="text-xs text-slate-300 w-28 text-center">{monthLabel}</span>
          <button type="button" title="Next month"
                  class="px-1.5 py-1 text-xs text-slate-400 hover:text-white
                         border border-slate-600 rounded"
                  on:click={() => goMonth(1)}>→</button>
        </div>
      {/if}

      {#if view === 'year'}
        <select bind:value={year}
                class="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded
                       text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
          {#each years as y}<option value={y}>{y}</option>{/each}
        </select>
      {/if}

      <!-- The portal's own filter control, moved to common/ for this — the
           Components tab has had it for a year and it behaves the way people
           here already expect a filter to behave. -->
      <MultiSelectDropdown
        label="Category" placeholder="All categories" noun="categories" minWidth="130px"
        options={pickable(state.categories).map(c => ({ value: c.slug, label: c.name }))}
        bind:selected={categoryFilter}
        open={openDropdown === 'category'}
        on:toggle={() => openDropdown = openDropdown === 'category' ? null : 'category'}
      />

      <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer"
             title="Maintenance jobs, meetings, action deadlines and reviews falling due">
        <input type="checkbox" bind:checked={showLinked} class="accent-purple-500" />
        Other apps
      </label>

      <ProtectedButton variant="secondary" size="small"
                       title="The categories this building uses"
                       on:click={() => categoriesOpen = true}>
        Categories
      </ProtectedButton>

      <ProtectedButton variant="primary" size="small" on:click={newEvent}>
        + New event
      </ProtectedButton>
    </div>
  </div>

  {#if state.loading && !state.events.length}
    <div class="flex justify-center py-10"><LoadingSpinner /></div>

  {:else if !state.events.length && !occurrences.length}
    <div class="text-center py-12 text-slate-500">
      <p class="text-sm">The year is empty.</p>
      <p class="text-xs mt-2 max-w-md mx-auto">
        Add the things the building expects — the AGM, insurance renewal, meter
        readings, gutters each autumn — and they will appear here as they come
        round.
      </p>
    </div>

  {:else if view === 'month'}
    <!-- ── One month, with room to read ────────────────────────────────── -->
    <div class="space-y-3">
      <MonthGrid
        {year}
        {month}
        {occurrences}
        categories={state.categories}
        marks={dayMarks}
        today={now}
        on:selectDay={(e) => selectedDay = e.detail.date}
      />

      {#if selectedDay}
        <div class="border border-slate-700 rounded p-3 bg-slate-800/40">
          <div class="flex items-center gap-2 mb-2">
            <h3 class="text-xs font-semibold text-white">{fmtDateLong(selectedDay)}</h3>
            <DayMarkControl
              date={selectedDay}
              mark={dayMarks.get(selectedDay) ?? null}
              {canEdit}
              on:set={setDayMark}
              on:clear={clearDayMark}
            />
            <div class="flex-1"></div>
            <button class="text-xs text-slate-500 hover:text-slate-300"
                    on:click={() => selectedDay = null}>Close</button>
          </div>

          {#if dayItems.length}
            <div class="space-y-1.5">
              {#each dayItems as occurrence (occurrence.event_id + occurrence.scheduled_for)}
                <OccurrenceRow
                  {occurrence}
                  {canEdit}
                  categories={state.categories}
                  owners={$profiles.list}
                  on:toggle={toggleDone}
                  on:skip={toggleSkip}
                  on:move={requestMove}
                  on:promote={requestPromote}
                  on:editSeries={(e) => editSeries(e.detail)}
                />
              {/each}
            </div>
          {:else}
            <p class="text-xs text-slate-500">Nothing planned.</p>
          {/if}
        </div>
      {/if}
    </div>

  {:else if view === 'year'}
    <!-- ── The wallplanner ─────────────────────────────────────────────── -->
    <div class="space-y-3">
      <YearGrid
        {year}
        {occurrences}
        categories={state.categories}
        marks={dayMarks}
        today={now}
        selected={selectedDay}
        on:selectDay={(e) => selectedDay = e.detail.date}
        on:selectMonth={(e) => { month = e.detail; view = 'month'; selectedDay = null; }}
      />

      <!-- The legend earns its place: a grid of coloured dots is unreadable
           without one, and it is also what makes the print output usable. -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {#each pickable(state.categories) as c}
          <span class="flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full {swatch(c.colour).dot}"></span>{c.name}
          </span>
        {/each}
        <span class="flex items-center gap-1 ml-2">
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400 opacity-40"></span>faded = done
        </span>
      </div>

      {#if showLinked}
        <p class="text-[11px] text-slate-600">
          Also showing {Object.values(SOURCES).map(s => s.label).join(', ').toLowerCase()}
          from other apps. Those are marked ↗ and are completed where they live.
        </p>
      {/if}

      {#if selectedDay}
        <div class="border border-slate-700 rounded p-3 bg-slate-800/40">
          <div class="flex items-center gap-2 mb-2">
            <h3 class="text-xs font-semibold text-white">{fmtDateLong(selectedDay)}</h3>
            <DayMarkControl
              date={selectedDay}
              mark={dayMarks.get(selectedDay) ?? null}
              {canEdit}
              on:set={setDayMark}
              on:clear={clearDayMark}
            />
            <div class="flex-1"></div>
            <button class="text-xs text-slate-500 hover:text-slate-300"
                    on:click={() => selectedDay = null}>Close</button>
          </div>

          {#if dayItems.length}
            <div class="space-y-1.5">
              {#each dayItems as occurrence (occurrence.event_id + occurrence.scheduled_for)}
                <OccurrenceRow
                  {occurrence}
                  {canEdit}
                  categories={state.categories}
                  owners={$profiles.list}
                  on:toggle={toggleDone}
                  on:skip={toggleSkip}
                  on:move={requestMove}
                  on:promote={requestPromote}
                  on:editSeries={(e) => editSeries(e.detail)}
                />
              {/each}
            </div>
          {:else}
            <p class="text-xs text-slate-500">Nothing planned.</p>
          {/if}
        </div>
      {:else}
        <p class="text-xs text-slate-600">Click a day to see what is on it.</p>
      {/if}
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
                    categories={state.categories}
                    owners={$profiles.list}
                    showLateness={bucket.key === 'overdue'}
                    daysLate={daysBetween(occurrence.date, now)}
                    on:toggle={toggleDone}
                    on:skip={toggleSkip}
                    on:move={requestMove}
                    on:promote={requestPromote}
                  on:promote={requestPromote}
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
  categories={state.categories}
  on:save={saveEvent}
  on:archive={archiveEvent}
  on:remove={removeEvent}
  on:close={() => { formOpen = false; editing = null; }}
/>

<CategoriesModal
  bind:show={categoriesOpen}
  categories={state.categories}
  {canEdit}
  canDelete={$permissions.isAdmin}
  bind:error={categoryError}
  on:create={createCategory}
  on:update={updateCategory}
  on:delete={deleteCategory}
  on:close={() => { categoriesOpen = false; categoryError = ''; }}
/>

<Modal show={!!promoting} title="Hand this to Maintenance" size="medium"
       on:close={() => promoting = null}>
  <div class="space-y-3 text-xs text-slate-400">
    <p>
      <span class="text-white">“{promoting?.series?.title}”</span> becomes a
      maintenance job. The planner stops holding it and shows the job instead —
      one record, in the app that owns that kind of work.
    </p>

    <FormInput label="Scheduled for" type="date" bind:value={promoteOn} />

    {#if promoting?.series?.recurrence?.freq !== 'once'}
      <!-- The thing nobody would work out for themselves, and the reason this
           is a dialog rather than a button. -->
      <p class="p-2 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200">
        This series repeats. One job is created, for the date above — Maintenance
        schedules repeats from when work is COMPLETED, which is not the same as
        the planner's fixed pattern. Set up a regime in Maintenance if it should
        keep coming round.
      </p>
    {/if}

    <p class="text-slate-500">
      Anything already ticked against it is kept. This cannot be undone from
      here.
    </p>
  </div>

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" disabled={promoteBusy} on:click={() => promoting = null}>
      Cancel
    </Button>
    <Button variant="primary" disabled={promoteBusy || !promoteOn} on:click={confirmPromote}>
      {promoteBusy ? 'Handing over…' : 'Create the job'}
    </Button>
  </div>
</Modal>

<Modal bind:show={movingOpen} title="Move this one" size="small"
       on:close={() => { movingOpen = false; moving = null; }}>
  <!-- A dialog with the field in it, rather than a floating box beside a
       confirmation. One question, one place to answer it. -->
  <p class="text-xs text-slate-400 mb-3">
    Only this occurrence of “{moving?.series?.title}” moves. The pattern is
    unchanged, and it keeps a note of where it should have been.
  </p>
  <FormInput label="New date" type="date" bind:value={moveTo} />

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" on:click={() => { movingOpen = false; moving = null; }}>
      Cancel
    </Button>
    <Button variant="primary" disabled={!moveTo} on:click={confirmMove}>Move</Button>
  </div>
</Modal>
