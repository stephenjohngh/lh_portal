<!-- src/lib/apps/planner/PlannerApp.svelte -->
<!-- The Planner: the building's recurring year, and what is outstanding.
     Design and decisions: docs/requirements/Planner_App_Analysis.md.

     P0 is the agenda. The year grid (P1) and reading other apps' dated items
     (P2) come next, and the model was built first on purpose — the hard part is
     series-versus-occurrence, and everything else depends on it being right. -->
<script>
  import { onMount, tick } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { plannerStore } from './stores/plannerStore.js';
  import { profiles, profilesStore } from '$lib/stores/profiles';
  import { buildOccurrences, agenda, describeAgenda, BUCKETS, STATUS } from './utils/agenda.js';
  import { addDaysISO, daysBetween, isRecurring } from './utils/recurrence.js';
  import { pickable, swatch, marksByDate } from './utils/categories.js';
  import { SOURCES, visibleSources } from './utils/linked.js';
  import { today, fmtDateLong } from '$lib/utils/dates';

  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import OccurrenceRow from './components/OccurrenceRow.svelte';
  import EventFormModal from './components/EventFormModal.svelte';
  import AdminMenu from './components/AdminMenu.svelte';
  import PlannerPrint from './components/PlannerPrint.svelte';
  import './planner-print.css';
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
  /**
   * The toolbar, for closing an open menu when the click lands anywhere else.
   * Neither menu closes itself: both are parent-controlled so only one can be
   * open at a time, which leaves the parent owning this too.
   */
  let toolbar = null;

  function onWindowClick(e) {
    if (openDropdown && toolbar && !toolbar.contains(e.target)) openDropdown = null;
  }

  // ── Fullscreen, for the wallplanner ───────────────────────────────────────
  // A year is 37 columns wide and is meant to be looked at from across a room.
  // The browser chrome and the portal's own nav are perhaps 200px of height and
  // the page padding some width, none of which says anything about the year.
  //
  // The element made fullscreen is the WHOLE app, not just the grid. Only the
  // fullscreen element's subtree is painted, so a fullscreened grid would leave
  // every dialog — edit, move, promote, the confirmations — invisible while
  // still capturing clicks. That is the trap in this API, and wrapping
  // everything is the way past it rather than a compromise: the toolbar has to
  // be reachable in there anyway.
  let shell = null;
  let isFullscreen = false;

  /**
   * Whether the browser can do this at all.
   *
   * iPhone Safari has no Element.requestFullscreen — only video goes
   * fullscreen there — so the button is hidden rather than offered and broken.
   */
  const canFullscreen = typeof document !== 'undefined'
    && !!(document.fullscreenEnabled ?? document.webkitFullscreenEnabled);

  function toggleFullscreen() {
    if (!shell) return;

    if (isFullscreen) {
      (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);
    } else {
      (shell.requestFullscreen ?? shell.webkitRequestFullscreen)?.call(shell);
    }
  }

  /**
   * Read from the browser, never assumed.
   *
   * Escape exits fullscreen and cannot be intercepted, so the button's label
   * would be a lie within one keypress if this tracked our own clicks instead.
   */
  function onFullscreenChange() {
    isFullscreen = !!(document.fullscreenElement ?? document.webkitFullscreenElement);
  }

  // ── Printing ──────────────────────────────────────────────────────────────
  // A caretaker wants the year on the wall. What is printed is what is on
  // SCREEN — the same filtered occurrences the grids are given — because a
  // chart that quietly restored everything a filter removed would be a
  // different year from the one that was asked for.
  let printOpen = false;
  let printing = false;
  let preparingPrint = false;
  /** 'chart' — the year on one landscape sheet. 'months' — one month a sheet. */
  let printLayout = 'chart';
  let printFrom = 1;
  let printTo = 12;
  /** The body class naming the paper, remembered so it can be taken off again. */
  let printPage = '';

  const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: buildMonthGrid(2026, i + 1, []).label.split(' ')[0],
  }));

  /** Always in order, and never empty — a backwards range prints one month. */
  $: printMonths = (() => {
    const a = Math.min(Number(printFrom), Number(printTo));
    const b = Math.max(Number(printFrom), Number(printTo));
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  })();

  /**
   * What the paper has to admit to.
   *
   * A printed chart outlives the screen it came from, so it says which filters
   * were in force. Somebody finding it on a wall in six months cannot ask.
   */
  $: filterNote = [
    categoryFilter.size
      ? `Categories: ${pickable(state.categories)
          .filter(c => categoryFilter.has(c.slug))
          .map(c => c.name).join(', ')}`
      : 'All categories',
    showLinked && sourceLabels.length
      ? `including ${sourceLabels.join(', ').toLowerCase()}`
      : 'planner events only',
  ].join(' · ');

  async function doPrint() {
    if (preparingPrint) return;
    preparingPrint = true;
    printOpen = false;
    printing = true;
    try {
      // Names the page for the WHOLE document, so no box changes page type
      // mid-flow — that cost a blank sheet and a month printed portrait when
      // the name lived on the print host. Scoped to this print: a permanent
      // landscape @page would outlive the planner in the session.
      //
      // The year is 37 columns and can only be landscape; a month is taller
      // than it is wide and reads better portrait, with the height going into
      // the cells.
      printPage = printLayout === 'chart' ? 'planner-print-landscape' : 'planner-print-portrait';
      document.body.classList.add(printPage);
      // Rendered before the dialog opens, or the browser prints an empty host.
      await tick();
      // Chrome fires afterprint once per dialog; `once` keeps a second print
      // from tearing down a rendering that is still on screen.
      window.addEventListener('afterprint', () => {
        printing = false;
        if (printPage) document.body.classList.remove(printPage);
      }, { once: true });
      window.print();
    } finally {
      preparingPrint = false;
    }
  }
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
  /**
   * The other apps whose work this user may be shown — Maintenance, Management,
   * Golden Thread — from the permissions already loaded for every app.
   *
   * Being given the planner is not being given Management: a caretaker without
   * that app should not meet its meetings here instead. Derived rather than
   * captured, so granting somebody an app takes effect on their next load.
   */
  $: sources = visibleSources($permissions);
  /** The names of those apps, for the line under the year. */
  $: sourceLabels = Object.values(SOURCES)
    .filter(source => sources.has(source.key))
    .map(source => source.label);

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
      await plannerStore.loadLinked(from, to, visibleSources($permissions));
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
    // visibleSources($permissions), not the `sources` derivation: a store
    // subscription updates $permissions synchronously, whereas a `$:` block
    // waits for the render cycle. This line runs immediately after the await
    // that fills the store, so reading the derivation could ask before it had
    // caught up — and this one fails CLOSED, which would silently show nothing.
    plannerStore.loadLinked(from, to, visibleSources($permissions)).catch(() => {});
  });
</script>

<!-- Closes an open toolbar menu when the click lands anywhere else. Both menus
     are parent-controlled so that only one can be open at a time, which leaves
     the parent owning the dismissal too. -->
<svelte:window on:click={onWindowClick} />
<svelte:document on:fullscreenchange={onFullscreenChange}
                 on:webkitfullscreenchange={onFullscreenChange} />

<!-- The fullscreen element. Everything is inside it — including the dialogs
     below — because only the fullscreen subtree is painted. -->
<div bind:this={shell} class="planner-shell">
<div class="planner-screen p-4">

  {#if error}
    <div class="mb-3"><ErrorDisplay message={error} onDismiss={() => error = ''} /></div>
  {/if}
  {#if state.error}
    <div class="mb-3">
      <ErrorDisplay message={state.error} onDismiss={() => plannerStore.clearError()} />
    </div>
  {/if}

  <!-- Header.

       Two groups with the gap between them, rather than one long row: on the
       left is WHICH VIEW and WHEN — the controls that change what you are
       looking at — and on the right the ones that act on it. The arrows sit
       either side of the month they move, because an arrow's meaning is the
       thing next to it. -->
  <div bind:this={toolbar} class="flex items-center gap-3 mb-4 flex-wrap">
    <div class="min-w-0">
      <h2 class="text-sm font-semibold text-white">Planner</h2>
      <p class="text-xs text-slate-500 mt-0.5">{summary}</p>
    </div>

    <div class="flex rounded border border-slate-600 overflow-hidden text-xs shrink-0">
      {#each [['agenda', 'Agenda'], ['month', 'Month'], ['year', 'Year']] as [key, label]}
        <button type="button"
                class="px-2.5 py-1 transition-colors
                       {view === key ? 'bg-purple-600 text-white'
                                     : 'text-slate-400 hover:bg-slate-700'}"
                on:click={() => { view = key; selectedDay = null; }}>{label}</button>
      {/each}
    </div>

    {#if view === 'month'}
      <div class="flex items-center gap-1 shrink-0">
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
      <select bind:value={year} title="Which year"
              class="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded
                     text-white focus:outline-none focus:ring-1 focus:ring-purple-500 shrink-0">
        {#each years as y}<option value={y}>{y}</option>{/each}
      </select>
    {/if}

    <div class="flex-1 min-w-[1rem]"></div>

    <div class="flex items-center gap-2 shrink-0">
      <!-- The portal's own filter control, moved to common/ for this — the
           Components tab has had it for a year and it behaves the way people
           here already expect a filter to behave.

           No label above it: "All categories" already says what it is, and the
           heading only made the control taller than everything beside it. -->
      <MultiSelectDropdown
        title="Show only certain categories"
        placeholder="All categories" noun="categories" minWidth="130px"
        options={pickable(state.categories).map(c => ({ value: c.slug, label: c.name }))}
        bind:selected={categoryFilter}
        open={openDropdown === 'category'}
        on:toggle={() => openDropdown = openDropdown === 'category' ? null : 'category'}
      />

      <!-- Hidden outright when this user has none of the other apps: a switch
           whose only possible result is "nothing" is a control that lies. -->
      {#if sources.size}
        <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer"
               title="Dated work from {sourceLabels.join(', ')}">
          <input type="checkbox" bind:checked={showLinked} class="accent-purple-500" />
          Other apps
        </label>
      {/if}

      <!-- ENTERING is year-only: the agenda is a list that gains nothing from
           the extra room, and the month already fits. LEAVING is always
           offered, because the toolbar comes with you — switch to the agenda
           in fullscreen and a year-only button would take the way out with it,
           leaving Escape as the only exit and nothing on screen saying so. -->
      {#if canFullscreen && (view === 'year' || isFullscreen)}
        <button
          type="button"
          class="bg-slate-700 border border-slate-600 hover:border-slate-500 rounded
                 px-2.5 py-1.5 text-xs text-white transition-colors"
          title={isFullscreen
            ? 'Leave fullscreen (or press Esc)'
            : 'Fill the screen — the whole planner, without the browser or the portal nav'}
          on:click={toggleFullscreen}
        >{isFullscreen ? '⤡ Exit' : '⤢ Fullscreen'}</button>
      {/if}

      <!-- Year and month only: the agenda is a list, and the portal already
           makes Word documents for lists. -->
      {#if view === 'year' || view === 'month'}
        <button
          type="button"
          class="bg-slate-700 border border-slate-600 hover:border-slate-500 rounded
                 px-2.5 py-1.5 text-xs text-white transition-colors"
          title="Print the year, or a run of months — as filtered"
          on:click={() => {
            // The month view opens on the month being looked at.
            if (view === 'month') { printLayout = 'months'; printFrom = month; printTo = month; }
            printOpen = true;
          }}
        >Print</button>
      {/if}

      {#if $permissions.isAdmin}
        <AdminMenu
          items={[{ id: 'categories', label: 'Categories', hint: 'Colours, names, what may be handed over' }]}
          open={openDropdown === 'admin'}
          on:toggle={() => openDropdown = openDropdown === 'admin' ? null : 'admin'}
          on:select={(e) => { openDropdown = null; if (e.detail === 'categories') categoriesOpen = true; }}
        />
      {/if}

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
            <!-- Adding from the day panel, where somebody looking at a date
                 already is. The form opens with this date filled in. -->
            {#if canEdit}
              <button class="text-xs text-purple-300 hover:text-purple-200"
                      on:click={newEvent}>+ Add event</button>
            {/if}
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
      <!-- Fullscreen is not just more room around the chart: `fit` makes the
           chart take the room. -->
      <YearGrid
        fit={isFullscreen}
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
            <span class="w-2 h-2 rounded-full {swatch(c.colour).dot}"></span>{c.name}
          </span>
        {/each}
        <span class="flex items-center gap-1 ml-2">
          <span class="w-2 h-2 rounded-full bg-slate-400 opacity-40"></span>faded = done
        </span>
      </div>

      {#if showLinked}
        <p class="text-[11px] text-slate-600">
          Also showing {sourceLabels.join(', ').toLowerCase()} from other apps.
          Those are marked ↗ and are completed where they live.
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
            <!-- Adding from the day panel, where somebody looking at a date
                 already is. The form opens with this date filled in. -->
            {#if canEdit}
              <button class="text-xs text-purple-300 hover:text-purple-200"
                      on:click={newEvent}>+ Add event</button>
            {/if}
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
  defaultDate={selectedDay}
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

    {#if isRecurring(promoting?.series?.recurrence)}
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

<Modal bind:show={printOpen} title="Print the planner" size="small"
       on:close={() => printOpen = false}>
  <div class="space-y-3">
    <div>
      <p class="text-xs text-slate-400 mb-1.5">What to print</p>
      <div class="space-y-1.5">
        <label class="flex items-start gap-2 cursor-pointer text-xs">
          <input type="radio" bind:group={printLayout} value="chart"
                 class="mt-0.5 accent-purple-500" />
          <span class="text-slate-300">
            The year chart, on one landscape sheet
            <span class="block text-slate-500">
              The wallplanner as you see it — dates and category dots. Fewer
              months simply make taller rows.
            </span>
          </span>
        </label>
        <label class="flex items-start gap-2 cursor-pointer text-xs">
          <input type="radio" bind:group={printLayout} value="months"
                 class="mt-0.5 accent-purple-500" />
          <span class="text-slate-300">
            Month by month, one sheet each
            <span class="block text-slate-500">
              With titles and times. This is the one to carry around.
            </span>
          </span>
        </label>
      </div>
    </div>

    <div class="flex items-end gap-2">
      <div class="flex-1"><FormSelect label="From" bind:value={printFrom} options={MONTH_OPTIONS} placeholder="" /></div>
      <div class="flex-1"><FormSelect label="To" bind:value={printTo} options={MONTH_OPTIONS} placeholder="" /></div>
    </div>

    <p class="text-[11px] text-slate-500">
      {printMonths.length} month{printMonths.length === 1 ? '' : 's'} of {year}
      {#if printLayout === 'months'}— {printMonths.length} portrait sheet{printMonths.length === 1 ? '' : 's'}{:else}on one landscape sheet{/if}.
      <span class="block mt-1">
        Printed as filtered: <span class="text-slate-400">{filterNote}</span>. The
        sheet says so too, because it will outlive this screen.
      </span>
    </p>
  </div>

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" on:click={() => printOpen = false}>Cancel</Button>
    <Button variant="primary" disabled={preparingPrint} on:click={doPrint}>
      {preparingPrint ? 'Preparing…' : 'Print'}
    </Button>
  </div>
</Modal>

{#if printing}
  <PlannerPrint
    {year}
    layout={printLayout}
    months={printMonths}
    {occurrences}
    categories={state.categories}
    marks={dayMarks}
    {filterNote}
  />
{/if}

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
</div>

<style>
  /*
   * The fullscreen element paints nothing of its own by default, and the
   * browser's backdrop behind it is black — so without this the planner sits in
   * a black surround with the portal's slate nowhere to be seen.
   *
   * `:fullscreen` rather than a class alone, because Escape leaves fullscreen
   * without going through our button; the class is only there for anything that
   * wants to react in JS-visible ways.
   */
  .planner-shell:fullscreen {
    background: rgb(15 23 42);          /* slate-900, the portal's own ground */
    overflow-y: auto;
    width: 100%;
    height: 100%;
  }
</style>
