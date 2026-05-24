<!-- src/lib/apps/maintenance/components/SchedulerPanel.svelte -->
<!-- Admin-only: bulk job generator from regime tasks, plus schedule report download. -->
<script>
  import { maintenanceStore } from '../stores/maintenanceStore.js';
  import { frequencyLabel, scopeTypeLabel, toDateString, addDays, today } from '../utils/maintenanceHelpers.js';
  import { fmtDate, fmtToday } from '$lib/utils/dates.js';
  import { downloadResponse } from '$lib/utils/download.js';
  import Button from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let jobs = [];   // store.jobs — for computing last/next dates

  $: store = $maintenanceStore;
  $: regime = store.regime;
  $: types  = store.types;

  // -- Regime table computed data -----------------------------------------------
  $: regimeRows = regime.map(r => {
    const type = types.find(t => t.id === r.type_id);
    const typeName   = type?.name ?? 'Building-wide';
    const scopeType  = r.type_id ? 'type' : 'building';
    const scopeId    = r.type_id ?? null;
    const scopeLabel = typeName;

    // Last job for this regime
    const regimeJobs = jobs
      .filter(j => j.regime_id === r.id)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

    const lastJob      = regimeJobs[regimeJobs.length - 1] ?? null;
    const lastDate     = lastJob?.scheduled_date ?? null;
    const nextCalcDate = lastDate
      ? toDateString(addDays(new Date(lastDate + 'T00:00:00'), r.frequency_days))
      : today();

    return { ...r, typeName, scopeType, scopeId, scopeLabel, lastJob, lastDate, nextCalcDate };
  });

  // -- Selection state ----------------------------------------------------------
  let selected = {};   // { [regime_id]: bool }

  $: allSelected = regime.length > 0 && regime.every(r => selected[r.id]);

  function toggleAll() {
    if (allSelected) {
      selected = {};
    } else {
      const next = {};
      for (const r of regime) next[r.id] = true;
      selected = next;
    }
  }

  $: selectedRegimeRows = regimeRows.filter(r => selected[r.id]);

  // -- Date range for generation ------------------------------------------------
  // Default: today → today + 12 months
  const todayStr = today();
  const defaultTo = toDateString(addDays(new Date(todayStr + 'T00:00:00'), 365));
  let fromDate = todayStr;
  let toDate   = defaultTo;

  // -- Preview count ------------------------------------------------------------
  function countJobsForRow(row, from, to) {
    if (!row.regime_id) return 0;
    const existingDates = new Set(
      jobs
        .filter(j => j.regime_id === row.id && j.scope_type === row.scopeType && j.scope_id === row.scopeId)
        .map(j => j.scheduled_date)
    );
    const existingArr = [...existingDates].sort();
    let nextDate = from;
    if (existingArr.length > 0) {
      const afterLast = toDateString(addDays(new Date(existingArr[existingArr.length - 1] + 'T00:00:00'), row.frequency_days));
      if (afterLast > nextDate) nextDate = afterLast;
    }
    let count = 0;
    while (nextDate <= to) {
      if (!existingDates.has(nextDate)) count++;
      nextDate = toDateString(addDays(new Date(nextDate + 'T00:00:00'), row.frequency_days));
    }
    return count;
  }

  $: previewCount = selectedRegimeRows.reduce(
    (sum, row) => sum + countJobsForRow(row, fromDate, toDate),
    0
  );

  // -- Generate -----------------------------------------------------------------
  let generating = false;
  let generateResult = null;   // { count, error }

  async function handleGenerate() {
    if (selectedRegimeRows.length === 0) return;
    generating = true; generateResult = null;
    try {
      const selections = selectedRegimeRows.map(r => ({
        regime_id:   r.id,
        title:       r.task_name,
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
        headers: { 'Content-Type': 'application/json' },
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
        Select regime tasks and a date range. Jobs are created at each frequency interval, skipping dates that already have a job.
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

    <!-- Regime table -->
    {#if regimeRows.length === 0}
      <p class="text-sm text-slate-500 italic py-4">
        No maintenance regime tasks configured. Add them in Building Assets → Type Browser.
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
          <div>Task</div>
          <div>Type / scope</div>
          <div>Frequency</div>
          <div>Last job</div>
          <div>Next due</div>
        </div>

        <!-- Rows -->
        <div class="divide-y divide-slate-700/40">
          {#each regimeRows as row (row.id)}
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
                <span class="text-sm text-slate-200">{row.task_name}</span>
                {#if preview > 0 && selected[row.id]}
                  <span class="ml-2 text-xs text-purple-400">+{preview}</span>
                {/if}
              </div>
              <div class="text-xs text-slate-400">
                {row.scopeType === 'building' ? 'Building-wide' : row.typeName}
              </div>
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
          {selectedRegimeRows.length === 0
            ? 'Select regime tasks above'
            : `${selectedRegimeRows.length} task${selectedRegimeRows.length === 1 ? '' : 's'} selected — will create ${previewCount} job${previewCount === 1 ? '' : 's'}`}
        </div>
        <Button variant="primary" size="small"
          on:click={handleGenerate}
          disabled={generating || selectedRegimeRows.length === 0 || previewCount === 0}>
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
