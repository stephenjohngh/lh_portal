<!-- src/lib/apps/maintenance/components/SchedulerPanel.svelte -->
<!-- Admin-only: bulk job generator from the shared statutory-obligation
     library, plus schedule report download. Obligations are owned by the
     Inspection app and read through its public.js by maintenanceStore; only
     the contractor-evidenced ones with a cadence appear here. -->
<script>
  import { maintenanceStore } from '../stores/maintenanceStore.js';
  import { authHeaders } from '$lib/utils/authHeaders';
  import { frequencyLabel, scopeTypeLabel, addDaysISO, today } from '../utils/maintenanceHelpers.js';
  import { obligationJobScope, scopeSummary, plannedOccurrenceDates } from '../utils/obligationJobScope.js';
  import { planExceedsCeiling } from '$lib/utils/obligationSchedule.js';
  import { fmtDate, fmtToday } from '$lib/utils/dates.js';
  import { downloadResponse } from '$lib/utils/download.js';
  import Button from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let jobs = [];   // store.jobs — for computing last/next dates

  $: store       = $maintenanceStore;
  // Obligations come from the shared library (owned by Inspection, read through
  // its public.js by the store), filtered to the job-evidenced ones. Only those
  // with a cadence can be laid out as a series — an on-demand obligation is
  // scheduled by hand.
  $: obligations = store.obligations.filter(o => o.frequency_days);
  $: types       = store.types;
  $: systems     = store.systems;

  // -- Obligation table computed data -------------------------------------------
  $: obligationRows = obligations.map(o => {
    // The obligation's jsonb scope can cover several types, a system, or the
    // whole building, so the job scope is derived rather than copied — see
    // obligationJobScope for why a job is a visit, not a checklist.
    const { scope_type, scope_id, scope_label } = obligationJobScope(o, { types, systems });

    const obligationJobs = jobs
      .filter(j => j.obligation_id === o.id)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

    const lastJob      = obligationJobs[obligationJobs.length - 1] ?? null;
    const lastDate     = lastJob?.scheduled_date ?? null;
    const nextCalcDate = lastDate
      ? addDaysISO(lastDate, o.frequency_days)
      : today();

    return {
      ...o,
      scopeType: scope_type, scopeId: scope_id, scopeLabel: scope_label,
      scopeText: scopeSummary(o, { types, systems }),
      lastJob, lastDate, nextCalcDate,
      ceilingBreached: planExceedsCeiling(o),
    };
  });

  // -- Selection state ----------------------------------------------------------
  let selected = {};   // { [obligation id]: bool }

  $: allSelected = obligations.length > 0 && obligations.every(o => selected[o.id]);

  function toggleAll() {
    if (allSelected) {
      selected = {};
    } else {
      const next = {};
      for (const o of obligations) next[o.id] = true;
      selected = next;
    }
  }

  $: selectedRows = obligationRows.filter(r => selected[r.id]);

  // -- Date range for generation ------------------------------------------------
  // Default: today → today + 12 months
  const todayStr = today();
  const defaultTo = addDaysISO(todayStr, 365);
  let fromDate = todayStr;
  let toDate   = defaultTo;

  // -- Preview count ------------------------------------------------------------
  // Same pure walk the generator runs — see plannedOccurrenceDates. Counting
  // it here separately is how a preview starts lying about what it will do.
  function countJobsForRow(row, from, to) {
    return plannedOccurrenceDates({
      existingDates: jobs
        .filter(j => j.obligation_id === row.id && j.scope_type === row.scopeType && j.scope_id === row.scopeId)
        .map(j => j.scheduled_date),
      from, to,
      frequencyDays: row.frequency_days,
    }).length;
  }

  $: previewCount = selectedRows.reduce(
    (sum, row) => sum + countJobsForRow(row, fromDate, toDate),
    0
  );

  // -- Generate -----------------------------------------------------------------
  let generating = false;
  let generateResult = null;   // { count, error }

  async function handleGenerate() {
    if (selectedRows.length === 0) return;
    generating = true; generateResult = null;
    try {
      const selections = selectedRows.map(r => ({
        obligation_id:   r.id,
        title:       r.name,
        scope_type:  r.scopeType,
        scope_id:    r.scopeId,
        scope_label: r.scopeLabel,
      }));
      const created = await maintenanceStore.generateJobs(selections, fromDate, toDate);
      generateResult = { count: created.length };
      selected = {};   // clear selection after success
    } catch (err) {
      generateResult = { error: err.message };
    } finally {
      generating = false;
    }
  }

  // -- Schedule report ----------------------------------------------------------
  let downloading = false;
  let downloadError = '';

  async function downloadScheduleReport() {
    downloading = true;
    try {
      const payload = {
        jobs,
        building:    'Lonsdale House',
        generatedAt: fmtToday(),
      };
      const res = await fetch('/api/maintenance/generate-schedule', {
        method:  'POST',
        headers: await authHeaders(),
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const date = new Date().toISOString().slice(0, 10);
      await downloadResponse(res, `Maintenance_Schedule_${date}.docx`);
    } catch (err) {
      downloadError = 'Download failed: ' + err.message;
    } finally {
      downloading = false;
    }
  }
</script>

<div class="space-y-8">

  {#if downloadError}
    <ErrorDisplay message={downloadError} onDismiss={() => downloadError = ''} />
  {/if}

  <!-- Reports section -->
  <div class="rounded-lg border border-slate-700 p-4">
    <p class="text-sm font-semibold text-slate-300 mb-1">Download reports</p>
    <p class="text-xs text-slate-500 mb-3">
      Schedule report covers all current jobs across all statuses.
      Completion certificates are generated from individual job detail panels.
    </p>
    <Button variant="secondary" size="small"
      on:click={downloadScheduleReport}
      disabled={downloading || jobs.length === 0}>
      {downloading ? 'Generating…' : '⬇ Maintenance Schedule Report'}
    </Button>
  </div>

  <!-- Bulk generator -->
  <div class="space-y-4">
    <div>
      <p class="text-sm font-semibold text-slate-300">Bulk job generator</p>
      <p class="text-xs text-slate-500 mt-0.5">
        Select obligations and a date range. Jobs are created at each frequency interval, skipping dates that already have a job.
      </p>
    </div>

    <!-- Date range -->
    <div class="flex flex-wrap gap-4 items-end">
      <div>
        <p class="text-xs text-slate-400 mb-1">From date</p>
        <input type="date" bind:value={fromDate}
          class="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white
                 focus:outline-none focus:border-purple-500" />
      </div>
      <div>
        <p class="text-xs text-slate-400 mb-1">To date</p>
        <input type="date" bind:value={toDate}
          class="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white
                 focus:outline-none focus:border-purple-500" />
      </div>
    </div>

    <!-- Obligation table -->
    {#if obligationRows.length === 0}
      <p class="text-sm text-slate-500 italic py-4">
        No contractor-evidenced obligations with a frequency. Add them in
        Admin → Inspections, setting “How is this discharged?” to
        <span class="text-slate-400">Contractor job</span>.
      </p>
    {:else}
      <div class="rounded-lg border border-slate-700 overflow-hidden">
        <!-- Table header -->
        <div class="grid grid-cols-[32px_1fr_1fr_120px_110px_110px] gap-0 px-4 py-2
                    bg-slate-800/60 border-b border-slate-700 text-xs text-slate-500 font-medium">
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="flex items-center cursor-pointer" on:click={toggleAll}>
            <input type="checkbox" checked={allSelected} on:change={toggleAll}
              class="accent-purple-500" />
          </div>
          <div>Obligation</div>
          <div>Scope</div>
          <div>Frequency</div>
          <div>Last job</div>
          <div>Next due</div>
        </div>

        <!-- Rows -->
        <div class="divide-y divide-slate-700/40">
          {#each obligationRows as row (row.id)}
            {@const preview = countJobsForRow(row, fromDate, toDate)}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div
              class="grid grid-cols-[32px_1fr_1fr_120px_110px_110px] gap-0 px-4 py-2.5
                     hover:bg-slate-700/20 cursor-pointer transition-colors
                     {selected[row.id] ? 'bg-purple-900/10' : ''}"
              on:click={() => selected = { ...selected, [row.id]: !selected[row.id] }}
            >
              <div class="flex items-center">
                <input type="checkbox" checked={!!selected[row.id]}
                  on:change={() => selected = { ...selected, [row.id]: !selected[row.id] }}
                  on:click|stopPropagation
                  class="accent-purple-500" />
              </div>
              <div>
                <span class="text-sm text-slate-200">{row.name}</span>
                {#if preview > 0 && selected[row.id]}
                  <span class="ml-2 text-xs text-purple-400">+{preview}</span>
                {/if}
                <!-- The plan is looser than the statutory ceiling: this can read
                     as fully up to date while already in breach. -->
                {#if row.ceilingBreached}
                  <span class="ml-2 text-xs text-amber-400"
                        title="Frequency is longer than the maximum interval — generated jobs would breach the ceiling">⚠ exceeds max interval</span>
                {/if}
              </div>
              <div class="text-xs text-slate-400">{row.scopeText}</div>
              <div class="text-xs text-slate-400">{frequencyLabel(row.frequency_days)}</div>
              <div class="text-xs {row.lastDate ? 'text-slate-400' : 'text-slate-600'}">
                {row.lastDate ? fmtDate(row.lastDate) : 'Never'}
              </div>
              <div class="text-xs {row.nextCalcDate <= todayStr ? 'text-red-400' : 'text-slate-400'}">
                {fmtDate(row.nextCalcDate)}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Preview + generate -->
      <div class="flex items-center gap-4 flex-wrap">
        <div class="text-sm text-slate-400">
          {selectedRows.length === 0
            ? 'Select obligations above'
            : `${selectedRows.length} obligation${selectedRows.length === 1 ? '' : 's'} selected — will create ${previewCount} job${previewCount === 1 ? '' : 's'}`}
        </div>
        <Button variant="primary" size="small"
          on:click={handleGenerate}
          disabled={generating || selectedRows.length === 0 || previewCount === 0}>
          {generating ? 'Generating…' : 'Generate jobs'}
        </Button>
      </div>

      {#if generateResult}
        {#if generateResult.error}
          <p class="text-sm text-red-400">⚠ {generateResult.error}</p>
        {:else if generateResult.count === 0}
          <p class="text-sm text-slate-500">No new jobs needed — all periods already covered.</p>
        {:else}
          <p class="text-sm text-green-400">✓ Created {generateResult.count} job{generateResult.count === 1 ? '' : 's'}.</p>
        {/if}
      {/if}
    {/if}
  </div>

</div>
