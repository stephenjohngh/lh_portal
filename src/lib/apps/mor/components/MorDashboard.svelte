<!-- src/lib/apps/mor/components/MorDashboard.svelte -->
<!-- Phase 1e — KPI dashboard: stats, BSR deadline tracker, status
     breakdown, recent activity. Reads from the already-loaded store. -->
<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { morStore } from '$lib/apps/mor/stores/morStore';
  import { auth }     from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { supabase } from '$lib/supabaseClient';
  import Badge from '$lib/components/common/Badge.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import {
    bsrReportClock,
    STATUS_LABEL, STATUS_COLOUR,
    OPEN_STATUSES, STATUS_ORDER,
    clockBgClass, clockTextClass,
    caseSlaSummary,
    shouldShowBsrNotifyNudge, shouldShowClosureNudge, shouldShowStalenessNudge,
    isAwaitingMyApproval, isMyProposalAwaitingApproval, isMineAndOpen,
  } from '$lib/apps/mor/utils/morHelpers';
  import { fmtDate } from '$lib/utils/dates';

  const dispatch = createEventDispatcher();

  $: userId  = $auth.user?.id;
  $: isAdmin = $permissions.isAdmin;
  $: contactsByCase = $morStore.reporterContactsByCase ?? {};

  // Tick so BSR clocks stay current while the dashboard is open.
  let tick = 0;
  let intervalId = null;
  onMount(() => { intervalId = setInterval(() => tick++, 60_000); });
  onDestroy(() => { if (intervalId) clearInterval(intervalId); });

  const OPEN_SET = new Set(OPEN_STATUSES);

  $: cases = $morStore.cases;

  // ── Computed stats ────────────────────────────────────────────────────────

  $: openCases = cases.filter(c => OPEN_SET.has(c.status));

  // Cases on the BSR track without a submitted report (10-day clock running)
  $: bsrActive = cases.filter(c =>
    ['bsr_notice', 'bsr_report'].includes(c.status) && !c.bsr_report_submitted_at
  );

  // Attach clocks and sort most urgent first. Use msRemaining (raw) rather than
  // daysLeft (rounded) so cases inside the same day boundary stay ordered.
  // `tick` is referenced so the reactive re-runs on the interval.
  $: bsrWithClocks = (tick, bsrActive
    .map(c => ({ ...c, clock: bsrReportClock(c.identification_date) }))
    .sort((a, b) => (a.clock?.msRemaining ?? Infinity) - (b.clock?.msRemaining ?? Infinity)));

  $: breachedCount = bsrWithClocks.filter(c => c.clock?.status === 'breach').length;

  // Cases closed in the last 30 days. Reactive so the window slides as the
  // page stays open, not snapshotted at mount time.
  $: thirtyDaysAgo = (tick, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  $: recentlyClosed = [...cases]
    .filter(c => c.status === 'closed' && c.closed_at && c.closed_at >= thirtyDaysAgo)
    .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
    .slice(0, 6);

  // Open cases by status (workflow order, non-zero only).
  // Group with a single pass then look up by status.
  $: statusBreakdown = (() => {
    const counts = new Map();
    for (const c of openCases) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
    return STATUS_ORDER
      .filter(s => counts.has(s))
      .map(s => ({ status: s, count: counts.get(s) }));
  })();

  // Urgency breakdown
  $: urgentOpen = openCases.filter(c => c.urgency).length;

  // ── SLA breach view ────────────────────────────────────────────────────────
  $: slaBreaches = (tick, openCases
    .map(c => ({ c, summary: caseSlaSummary(c) }))
    .filter(x => x.summary.breached.length > 0 || x.summary.critical.length > 0)
    .sort((a, b) => (b.summary.breached.length - a.summary.breached.length)
                 || (b.summary.critical.length - a.summary.critical.length)));

  // ── Reporter-contact backlog ───────────────────────────────────────────────
  // BSR-track cases needing an escalation letter to the reporter.
  $: contactBacklogBsr = (tick, openCases.filter(c =>
    shouldShowBsrNotifyNudge(c, contactsByCase[c.id] ?? [])));

  // Closed cases still owing a reporter or residents letter.
  $: contactBacklogClosure = cases
    .filter(c => c.status === 'closed')
    .map(c => ({ c, n: shouldShowClosureNudge(c, contactsByCase[c.id] ?? []) }))
    .filter(x => x.n.reporter || x.n.residents);

  // Stale cases (> 14 days since last reporter contact).
  $: contactBacklogStale = (tick, openCases.filter(c =>
    shouldShowStalenessNudge(c, contactsByCase[c.id] ?? [])));

  $: contactBacklogTotal =
        contactBacklogBsr.length + contactBacklogClosure.length + contactBacklogStale.length;

  // ── My queue ───────────────────────────────────────────────────────────────
  $: awaitingMyApproval = userId
    ? openCases.filter(c => isAwaitingMyApproval(c, userId, isAdmin))
    : [];
  $: myProposalsAwaiting = userId
    ? openCases.filter(c => isMyProposalAwaitingApproval(c, userId))
    : [];
  $: myOpenCases = userId
    ? openCases.filter(c => isMineAndOpen(c, userId))
    : [];

  // ── Period summary report ──────────────────────────────────────────────────
  function defaultPeriodStart() {
    // Default to the start of the current quarter.
    const now = new Date();
    const q   = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
  }
  function todayIso() { return new Date().toISOString().slice(0, 10); }

  let periodStart = defaultPeriodStart();
  let periodEnd   = todayIso();
  let generating  = false;
  let periodError = '';

  async function generatePeriodReport() {
    periodError = '';
    if (!periodStart || !periodEnd || periodStart > periodEnd) {
      periodError = 'Please choose a start date on or before the end date.';
      return;
    }
    generating = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { periodError = 'Not signed in.'; return; }

      const r = await fetch('/api/mor/period-summary', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ start: periodStart, end: periodEnd }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        periodError = j.error ?? 'Could not generate the report.';
        return;
      }
      const blob = await r.blob();
      const dispo = r.headers.get('Content-Disposition') ?? '';
      const m = dispo.match(/filename="([^"]+)"/);
      const filename = m ? m[1] : `mor-summary-${periodStart}-to-${periodEnd}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      periodError = `Could not generate: ${err.message}`;
    } finally {
      generating = false;
    }
  }

  // ── Worst-clock chip helpers for SLA breach rendering ─────────────────────
  function slaChipClass(status) {
    if (status === 'breach')   return 'bg-red-700/60 text-red-100 border-red-600';
    if (status === 'critical') return 'bg-red-900/40 text-red-200 border-red-700';
    return 'bg-amber-900/40 text-amber-200 border-amber-700';
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
                   {cl ? clockBgClass(cl.status) : 'bg-slate-700/40 border-slate-600'}"
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
                <p class="text-sm {clockTextClass(cl.status)}">{cl.label}</p>
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

  <!-- ── Needs my attention ─────────────────────────────────────────────── -->
  {#if userId && (awaitingMyApproval.length > 0 || myProposalsAwaiting.length > 0 || myOpenCases.length > 0)}
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-slate-300 mb-4">
        Needs my attention
        <span class="text-xs text-slate-500 font-normal ml-1">
          — cases tied to your sign-in
        </span>
      </h3>

      <div class="space-y-3">
        {#if awaitingMyApproval.length > 0}
          <div>
            <p class="text-xs uppercase tracking-wide text-emerald-300 mb-1">
              Awaiting your approval ({awaitingMyApproval.length})
            </p>
            <div class="space-y-1.5">
              {#each awaitingMyApproval as c (c.id)}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div class="flex items-center gap-3 p-2.5 rounded-lg bg-slate-700/40 border border-slate-600/40
                            hover:border-slate-500 cursor-pointer transition-colors"
                     on:click={() => dispatch('selectCase', c)}>
                  <span class="font-mono text-sm text-white">{c.reference}</span>
                  <span class="text-xs text-slate-400 truncate flex-1">{c.description}</span>
                  <span class="text-xs text-slate-500 shrink-0">Proposed by {c.decision_proposed_by_profile?.full_name ?? 'someone else'}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if myProposalsAwaiting.length > 0}
          <div>
            <p class="text-xs uppercase tracking-wide text-amber-300 mb-1">
              Your proposals awaiting another approver ({myProposalsAwaiting.length})
            </p>
            <div class="space-y-1.5">
              {#each myProposalsAwaiting as c (c.id)}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div class="flex items-center gap-3 p-2.5 rounded-lg bg-slate-700/40 border border-slate-600/40
                            hover:border-slate-500 cursor-pointer transition-colors"
                     on:click={() => dispatch('selectCase', c)}>
                  <span class="font-mono text-sm text-white">{c.reference}</span>
                  <span class="text-xs text-slate-400 truncate flex-1">{c.description}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if myOpenCases.length > 0}
          <div>
            <p class="text-xs uppercase tracking-wide text-blue-300 mb-1">
              Cases you logged that are still open ({myOpenCases.length})
            </p>
            <div class="space-y-1.5">
              {#each myOpenCases.slice(0, 6) as c (c.id)}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div class="flex items-center gap-3 p-2.5 rounded-lg bg-slate-700/40 border border-slate-600/40
                            hover:border-slate-500 cursor-pointer transition-colors"
                     on:click={() => dispatch('selectCase', c)}>
                  <span class="font-mono text-sm text-white">{c.reference}</span>
                  <Badge bgClass={STATUS_COLOUR[c.status] ?? 'bg-slate-600'}>
                    {STATUS_LABEL[c.status]}
                  </Badge>
                  <span class="text-xs text-slate-400 truncate flex-1">{c.description}</span>
                </div>
              {/each}
              {#if myOpenCases.length > 6}
                <p class="text-xs text-slate-500 italic">…and {myOpenCases.length - 6} more.</p>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ── SLA breach view ───────────────────────────────────────────────── -->
  {#if slaBreaches.length > 0}
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-slate-300 mb-4">
        Cases breaching or near-breaching internal SLAs
        <span class="text-xs text-slate-500 font-normal ml-1">
          — acknowledge (24h), triage (24h), decision (5d). The statutory 10-day BSR clock is shown above.
        </span>
      </h3>

      <div class="space-y-2">
        {#each slaBreaches.slice(0, 12) as { c, summary } (c.id)}
          {@const worst = summary.worst}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors
                      {clockBgClass(worst.clock.status)}"
               on:click={() => dispatch('selectCase', c)}>
            <span class="font-mono text-sm text-white">{c.reference}</span>
            <Badge bgClass={STATUS_COLOUR[c.status] ?? 'bg-slate-600'}>
              {STATUS_LABEL[c.status]}
            </Badge>
            <span class="text-xs text-slate-300 truncate flex-1">{c.description}</span>
            <div class="flex flex-wrap gap-1 shrink-0">
              {#each summary.breached as cl}
                <span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border {slaChipClass('breach')}">
                  {cl.label} breached
                </span>
              {/each}
              {#each summary.critical as cl}
                <span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border {slaChipClass('critical')}">
                  {cl.label} critical
                </span>
              {/each}
            </div>
          </div>
        {/each}
        {#if slaBreaches.length > 12}
          <p class="text-xs text-slate-500 italic">…and {slaBreaches.length - 12} more.</p>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ── Reporter-contact backlog ──────────────────────────────────────── -->
  {#if contactBacklogTotal > 0}
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-slate-300 mb-4">
        Reporter contact backlog
        <span class="text-xs text-slate-500 font-normal ml-1">
          — {contactBacklogTotal} case{contactBacklogTotal === 1 ? '' : 's'} with an outstanding reporter-contact step
        </span>
      </h3>

      <div class="space-y-3">
        {#if contactBacklogBsr.length > 0}
          <div>
            <p class="text-xs uppercase tracking-wide text-amber-300 mb-1">
              Awaiting BSR-escalation letter ({contactBacklogBsr.length})
            </p>
            {#each contactBacklogBsr.slice(0, 5) as c (c.id)}
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <div class="flex items-center gap-3 p-2 rounded bg-amber-900/20 border border-amber-700/40
                          hover:border-amber-600/60 cursor-pointer transition-colors mb-1"
                   on:click={() => dispatch('selectCase', c)}>
                <span class="font-mono text-sm text-white">{c.reference}</span>
                <span class="text-xs text-amber-200/80 truncate flex-1">{c.description}</span>
              </div>
            {/each}
          </div>
        {/if}

        {#if contactBacklogClosure.length > 0}
          <div>
            <p class="text-xs uppercase tracking-wide text-emerald-300 mb-1">
              Closure letters outstanding ({contactBacklogClosure.length})
            </p>
            {#each contactBacklogClosure.slice(0, 5) as { c, n } (c.id)}
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <div class="flex items-center gap-3 p-2 rounded bg-emerald-900/20 border border-emerald-700/40
                          hover:border-emerald-600/60 cursor-pointer transition-colors mb-1"
                   on:click={() => dispatch('selectCase', c)}>
                <span class="font-mono text-sm text-white">{c.reference}</span>
                <span class="text-xs text-emerald-200/80 truncate flex-1">{c.description}</span>
                <span class="text-[10px] uppercase tracking-wide bg-emerald-800/50 px-1.5 py-0.5 rounded text-emerald-100">
                  {n.reporter && n.residents ? 'reporter + residents' : n.reporter ? 'reporter' : 'residents'}
                </span>
              </div>
            {/each}
          </div>
        {/if}

        {#if contactBacklogStale.length > 0}
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-300 mb-1">
              No reporter contact in 14+ days ({contactBacklogStale.length})
            </p>
            {#each contactBacklogStale.slice(0, 5) as c (c.id)}
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <div class="flex items-center gap-3 p-2 rounded bg-slate-700/40 border border-slate-600
                          hover:border-slate-500 cursor-pointer transition-colors mb-1"
                   on:click={() => dispatch('selectCase', c)}>
                <span class="font-mono text-sm text-white">{c.reference}</span>
                <Badge bgClass={STATUS_COLOUR[c.status] ?? 'bg-slate-600'}>
                  {STATUS_LABEL[c.status]}
                </Badge>
                <span class="text-xs text-slate-400 truncate flex-1">{c.description}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
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
                <div class="w-2 h-2 rounded-full {STATUS_COLOUR[row.status] ?? 'bg-slate-600'}"></div>
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

  <!-- ── Period summary report (Phase 3a) ───────────────────────────────── -->
  <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
    <h3 class="text-sm font-semibold text-slate-300 mb-1">Period summary report</h3>
    <p class="text-xs text-slate-500 mb-4">
      Generate a Word document summarising MOR activity over a date range
      — useful for safety case reviews, board updates, and BSR enquiries.
      Defaults to the start of the current quarter.
    </p>

    <div class="flex flex-wrap items-end gap-3">
      <div>
        <label for="period-start" class="block text-xs text-slate-400 mb-1">Start date</label>
        <input id="period-start" type="date" bind:value={periodStart}
          class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                 focus:outline-none focus:ring-2 focus:ring-purple-500" />
      </div>
      <div>
        <label for="period-end" class="block text-xs text-slate-400 mb-1">End date</label>
        <input id="period-end" type="date" bind:value={periodEnd}
          class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                 focus:outline-none focus:ring-2 focus:ring-purple-500" />
      </div>
      <Button variant="primary" size="medium" disabled={generating} on:click={generatePeriodReport}>
        {generating ? 'Generating…' : '📄 Generate report'}
      </Button>
    </div>

    {#if periodError}
      <p class="text-red-400 text-xs mt-3">{periodError}</p>
    {/if}
  </div>

</div>
