<!-- src/lib/apps/mor/components/MorDashboard.svelte -->
<!-- Phase 1e — KPI dashboard: stats, BSR deadline tracker, status
     breakdown, recent activity. Reads from the already-loaded store. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { morStore } from '$lib/apps/mor/stores/morStore';
  import Badge from '$lib/components/common/Badge.svelte';
  import {
    bsrReportClock,
    STATUS_LABEL, STATUS_COLOUR,
    BSR_TRACK_STATUSES, OPEN_STATUSES, STATUS_ORDER,
  } from '$lib/apps/mor/utils/morHelpers';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates';

  const dispatch = createEventDispatcher();

  $: cases = $morStore.cases;

  // ── Computed stats ────────────────────────────────────────────────────────

  $: openCases = cases.filter(c => OPEN_STATUSES.includes(c.status));

  // Cases on the BSR track without a submitted report (10-day clock running)
  $: bsrActive = cases.filter(c =>
    ['bsr_notice', 'bsr_report'].includes(c.status) && !c.bsr_report_submitted_at
  );

  // Attach clocks and sort most urgent first
  $: bsrWithClocks = bsrActive
    .map(c => ({ ...c, clock: bsrReportClock(c.identification_date) }))
    .sort((a, b) => (a.clock?.daysLeft ?? 99) - (b.clock?.daysLeft ?? 99));

  $: breachedCount = bsrWithClocks.filter(c => c.clock?.status === 'breach').length;

  // Cases closed in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  $: recentlyClosed = [...cases]
    .filter(c => c.status === 'closed' && c.closed_at && c.closed_at >= thirtyDaysAgo)
    .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
    .slice(0, 6);

  // Open cases by status (workflow order, non-zero only)
  $: statusBreakdown = STATUS_ORDER
    .map(s => ({ status: s, count: openCases.filter(c => c.status === s).length }))
    .filter(s => s.count > 0);

  // Urgency breakdown
  $: urgentOpen = openCases.filter(c => c.urgency).length;

  // ── Clock colour helpers ──────────────────────────────────────────────────
  function clockBg(status) {
    if (status === 'breach')   return 'bg-red-900/50 border-red-700';
    if (status === 'critical') return 'bg-red-900/30 border-red-600';
    if (status === 'warning')  return 'bg-amber-900/30 border-amber-600';
    return 'bg-slate-700/40 border-slate-600';
  }
  function clockText(status) {
    if (status === 'breach')   return 'text-red-300 font-bold';
    if (status === 'critical') return 'text-red-300 font-semibold';
    if (status === 'warning')  return 'text-amber-300';
    return 'text-slate-300';
  }
</script>

<div class="space-y-6">

  <!-- ── Summary stat cards ─────────────────────────────────────────────── -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Open cases -->
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <p class="text-3xl font-bold text-blue-300">{openCases.length}</p>
      <p class="text-sm text-slate-400 mt-1">Open cases</p>
      {#if urgentOpen > 0}
        <p class="text-xs text-red-400 mt-1">⚠ {urgentOpen} urgent</p>
      {/if}
    </div>

    <!-- Active BSR deadlines -->
    <div class="bg-slate-800 border {bsrActive.length > 0 ? 'border-orange-700/50' : 'border-slate-700'} rounded-xl p-4">
      <p class="text-3xl font-bold {bsrActive.length > 0 ? 'text-orange-300' : 'text-slate-500'}">
        {bsrActive.length}
      </p>
      <p class="text-sm text-slate-400 mt-1">Active BSR deadlines</p>
      <p class="text-xs text-slate-500 mt-1">10-day clock running</p>
    </div>

    <!-- Breached -->
    <div class="bg-slate-800 border {breachedCount > 0 ? 'border-red-700/60' : 'border-slate-700'} rounded-xl p-4">
      <p class="text-3xl font-bold {breachedCount > 0 ? 'text-red-400' : 'text-slate-500'}">
        {breachedCount}
      </p>
      <p class="text-sm text-slate-400 mt-1">Deadline breached</p>
      {#if breachedCount > 0}
        <p class="text-xs text-red-400 mt-1">Immediate action required</p>
      {/if}
    </div>

    <!-- Closed this month -->
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <p class="text-3xl font-bold text-emerald-400">{recentlyClosed.length}</p>
      <p class="text-sm text-slate-400 mt-1">Closed (30 days)</p>
    </div>
  </div>

  <!-- ── BSR Deadline Tracker ──────────────────────────────────────────── -->
  {#if bsrWithClocks.length > 0}
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-slate-300 mb-4">
        Active BSR Deadlines
        <span class="text-xs text-slate-500 font-normal ml-1">
          — 10 calendar days from identification date
        </span>
      </h3>

      <div class="space-y-2">
        {#each bsrWithClocks as c (c.id)}
          {@const cl = c.clock}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="flex items-center gap-4 p-3 rounded-lg border cursor-pointer
                   hover:border-slate-500 transition-colors
                   {cl ? clockBg(cl.status) : 'bg-slate-700/40 border-slate-600'}"
            on:click={() => dispatch('selectCase', c)}
          >
            <!-- Reference + description -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="font-mono text-sm font-semibold text-white">{c.reference}</span>
                <Badge bgClass={STATUS_COLOUR[c.status] ?? 'bg-slate-600'}>
                  {STATUS_LABEL[c.status]}
                </Badge>
                {#if c.urgency}
                  <span class="text-red-400 text-xs font-bold">⚠ Urgent</span>
                {/if}
              </div>
              <p class="text-xs text-slate-400 truncate">{c.description}</p>
            </div>

            <!-- Clock display -->
            <div class="text-right shrink-0">
              {#if cl}
                <p class="text-sm {clockText(cl.status)}">{cl.label}</p>
                <p class="text-xs text-slate-500">Deadline {fmtDate(cl.deadline.toISOString())}</p>
              {:else}
                <p class="text-sm text-emerald-400">Report submitted</p>
              {/if}
            </div>

            <span class="text-slate-500 text-xs shrink-0">View →</span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-5 text-center">
      <p class="text-emerald-400 text-sm font-medium">✓ No active BSR deadlines</p>
      <p class="text-xs text-slate-500 mt-1">No cases are currently awaiting BSR notice or report submission.</p>
    </div>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

    <!-- ── Status breakdown ────────────────────────────────────────────── -->
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-slate-300 mb-4">Open Cases by Status</h3>

      {#if statusBreakdown.length === 0}
        <p class="text-sm text-slate-500 italic">No open cases.</p>
      {:else}
        <div class="space-y-2">
          {#each statusBreakdown as row}
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full {(STATUS_COLOUR[row.status] ?? 'bg-slate-600').replace('bg-', 'bg-')}"></div>
                <span class="text-sm text-slate-300">{STATUS_LABEL[row.status] ?? row.status}</span>
              </div>
              <span class="text-sm font-semibold text-slate-200 bg-slate-700 px-2 py-0.5 rounded">
                {row.count}
              </span>
            </div>
          {/each}
        </div>
        <div class="border-t border-slate-700 mt-3 pt-3 flex justify-between text-xs text-slate-500">
          <span>Total open</span>
          <span class="font-semibold text-slate-300">{openCases.length}</span>
        </div>
      {/if}
    </div>

    <!-- ── Recently closed ─────────────────────────────────────────────── -->
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-slate-300 mb-4">Recently Closed
        <span class="text-xs text-slate-500 font-normal ml-1">(last 30 days)</span>
      </h3>

      {#if recentlyClosed.length === 0}
        <p class="text-sm text-slate-500 italic">No cases closed in the last 30 days.</p>
      {:else}
        <div class="space-y-3">
          {#each recentlyClosed as c (c.id)}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div
              class="cursor-pointer hover:bg-slate-700/40 rounded-lg p-2 -mx-2 transition-colors"
              on:click={() => dispatch('selectCase', c)}
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-sm font-semibold text-emerald-400">{c.reference}</span>
                <span class="text-xs text-slate-500">{fmtDate(c.closed_at)}</span>
              </div>
              <p class="text-xs text-slate-400 mt-0.5 truncate">{c.description}</p>
              {#if c.lessons_learned}
                <p class="text-xs text-slate-500 italic mt-0.5 truncate">
                  Lessons: {c.lessons_learned}
                </p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

  </div>

  <!-- ── Urgency and mechanism summary ──────────────────────────────────── -->
  {#if openCases.length > 0}
    {@const structural = openCases.filter(c => c.mechanism === 'structural' || c.mechanism === 'both').length}
    {@const firesmoke  = openCases.filter(c => c.mechanism === 'fire_smoke'  || c.mechanism === 'both').length}
    {@const unknown    = openCases.filter(c => c.mechanism === 'unknown' || !c.mechanism).length}
    {#if structural > 0 || firesmoke > 0}
      <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-slate-300 mb-4">Open Cases by Mechanism</h3>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <p class="text-2xl font-bold text-orange-400">{structural}</p>
            <p class="text-xs text-slate-500 mt-1">Structural</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-red-400">{firesmoke}</p>
            <p class="text-xs text-slate-500 mt-1">Fire / Smoke</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-slate-500">{unknown}</p>
            <p class="text-xs text-slate-500 mt-1">Assessing</p>
          </div>
        </div>
      </div>
    {/if}
  {/if}

</div>
