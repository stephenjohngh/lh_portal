<!-- src/lib/apps/maintenance/components/TenYearPlanTab.svelte -->
<!-- 10-year capital plan.
     Top: a year-by-year capex forecast + cumulative reserve, derived from each
     group's renewal cycle (last renewal + lifetime + cost) over a chosen window.
     Bottom: the per-group setup/assumptions table, where every figure that drives
     the forecast is editable (R0 — derivation assists, the planner decides). -->
<script>
  import { onMount } from 'svelte';
  import { maintenanceGroupsStore } from '../stores/maintenanceGroupsStore.js';
  import { buildTenYearForecast, renewalOccurrences } from '../utils/tenYearPlan.js';
  import { makeGroupMembershipResolver } from '../utils/groupMembership.js';
  import { suggestLastRenewal }     from '../utils/jobHistorySuggest.js';
  import { buildPlanReportPayload } from '../utils/planReport.js';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import { fmtDate, fmtToday } from '$lib/utils/dates.js';
  import { authHeaders }   from '$lib/utils/authHeaders.js';
  import { downloadResponse } from '$lib/utils/download.js';

  // Building-assets reference data (from AdminApp) — drives the live membership
  // roll-up. All optional: with none loaded, every group reads as a manual line.
  export let components     = [];   // components[] (with current status)
  export let types          = [];   // component_types[]
  export let spaces         = [];   // spaces[]
  export let spaceOverrides = [];   // space_component_overrides[]
  export let plans          = [];   // plans[]

  $: ({ groups, loading, error } = $maintenanceGroupsStore);
  $: jobHistory = $maintenanceGroupsStore.jobHistory ?? [];

  // Completed job history drives the last-renewal suggestions (R2). Read-only,
  // non-fatal if it fails.
  onMount(() => { maintenanceGroupsStore.loadJobHistory(); });

  // ── Live membership + condition roll-up (R1 — context only) ───────────
  $: resolveMembership = makeGroupMembershipResolver({ components, types, spaces, spaceOverrides, plans });
  $: membership = Object.fromEntries(groups.map(g => [g.id, resolveMembership(g)]));

  // type_attributes scope_id may be a component_types.id — map it back to a code.
  $: typeIdToCode = new Map(types.map(t => [t.id, t.code]));

  // Renewal-date suggestions for the group currently open in the edit modal (R2).
  // Suggestion only — clicking a candidate fills the input; nothing auto-saves.
  $: editGroup = groups.find(g => g.id === editId) ?? null;
  $: editSuggestions = editGroup
    ? suggestLastRenewal(
        {
          systemIds:    editGroup.system_ids,
          typeCodes:    editGroup.type_codes,
          componentIds: membership[editId]?.componentIds,
        },
        jobHistory,
        { typeIdToCode })
    : { candidates: [], best: null };

  // ── Horizon control ───────────────────────────────────────────────────
  let startYear = new Date().getFullYear();
  let horizon   = 10;                       // years
  $: horizon    = Math.min(30, Math.max(1, Math.floor(Number(horizon) || 1)));

  // ── Derived forecast (R3) ─────────────────────────────────────────────
  $: forecast = buildTenYearForecast(groups, { startYear: Number(startYear), years: horizon });

  // ── Edit modal state ──────────────────────────────────────────────────
  let showModal  = false;
  let saving     = false;
  let modalError = '';
  let editId     = null;

  let editLastRenewal  = '';    // YYYY-MM-DD string
  let editLifetime     = '';    // string — numeric input
  let editCost         = '';    // string — numeric input
  let editNotes        = '';
  let overrideInputs   = {};    // { [year]: string } — per-year override amounts

  // Derived (pre-override) spend per year for the group being edited — shown next
  // to each override input so the planner sees what they're overriding.
  function deriveByYear(group, years) {
    if (!group || years.length === 0) return {};
    const occ = renewalOccurrences(group, years[0], years[years.length - 1]);
    const by  = Object.fromEntries(years.map(y => [y, 0]));
    for (const o of occ) by[o.year] += o.cost;
    return by;
  }
  $: editDerived = editGroup ? deriveByYear(editGroup, forecast.years) : {};

  function openEdit(g) {
    editId          = g.id;
    editLastRenewal = g.last_renewal_date ?? '';
    editLifetime    = g.lifetime_years    != null ? String(g.lifetime_years) : '';
    editCost        = g.expected_cost     != null ? String(g.expected_cost)  : '';
    editNotes       = g.notes             ?? '';
    overrideInputs  = Object.fromEntries(
      Object.entries(g.plan_overrides ?? {}).map(([y, amt]) => [y, String(amt)]));
    modalError      = '';
    showModal       = true;
  }

  async function handleSave() {
    saving = true; modalError = '';
    try {
      // Build plan_overrides from the non-blank inputs (blank = use derived).
      const plan_overrides = {};
      for (const [y, val] of Object.entries(overrideInputs)) {
        const s = String(val ?? '').trim();
        if (s === '') continue;
        const n = Number(s);
        if (Number.isFinite(n) && n >= 0) plan_overrides[y] = n;
      }
      await maintenanceGroupsStore.savePlan(editId, {
        last_renewal_date: editLastRenewal || null,
        lifetime_years:    editLifetime !== '' ? parseFloat(editLifetime) : null,
        expected_cost:     editCost     !== '' ? parseFloat(editCost)     : null,
        notes:             editNotes,
        plan_overrides,
      });
      showModal = false;
    } catch (err) {
      modalError = err.message;
    } finally {
      saving = false;
    }
  }

  // ── Calculated fields (setup table) ───────────────────────────────────
  function expectedRenewal(lastDate, lifetimeYears) {
    if (!lastDate || lifetimeYears == null) return null;
    const d = new Date(lastDate + 'T00:00:00');
    const yrs   = Math.floor(lifetimeYears);
    const extra = Math.round((lifetimeYears - yrs) * 12);   // fractional → months
    d.setFullYear(d.getFullYear() + yrs);
    d.setMonth(d.getMonth() + extra);
    return d.toISOString().split('T')[0];
  }

  function renewalStatus(renewalDate) {
    if (!renewalDate) return 'none';
    const now  = new Date();
    const due  = new Date(renewalDate + 'T00:00:00');
    const days = Math.ceil((due - now) / 86400000);
    if (days < 0)   return 'overdue';
    if (days < 365) return 'soon';
    return 'ok';
  }

  const statusCfg = {
    none:    { label: '—',       cls: 'text-slate-600' },
    ok:      { label: '',        cls: 'text-emerald-400' },
    soon:    { label: '< 1 yr',  cls: 'text-amber-400' },
    overdue: { label: 'OVERDUE', cls: 'text-red-400 font-semibold' },
  };

  // Full currency (totals, tooltips).
  function fmtCost(v) {
    if (v == null) return '—';
    return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  // Compact currency for the narrow year cells: 50000 → £50k, 1200 → £1.2k.
  function fmtK(v) {
    if (!v) return '';
    if (v < 1000) return '£' + v;
    const k = v / 1000;
    return '£' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k';
  }

  // ── Export the plan document (R4) ─────────────────────────────────────
  let exporting   = false;
  let exportError = '';
  async function downloadPlan() {
    exporting = true; exportError = '';
    try {
      const payload = buildPlanReportPayload(forecast, membership, groups, {
        building:    'Lonsdale House',
        generatedAt: fmtToday(),
      });
      const res = await fetch('/api/reports/generate-ten-year-plan', {
        method:  'POST',
        headers: await authHeaders(),
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const date = new Date().toISOString().slice(0, 10);
      await downloadResponse(res, `10_Year_Capital_Plan_${date}.docx`);
    } catch (err) {
      exportError = 'Export failed: ' + err.message;
    } finally {
      exporting = false;
    }
  }

  $: groupsWithData = groups.filter(g => g.last_renewal_date || g.lifetime_years || g.expected_cost);
  // Peak-spend year in the window (for the header summary).
  $: peakYear = forecast.years.reduce(
    (best, y) => (forecast.perYear[y] > (forecast.perYear[best] ?? -1) ? y : best),
    forecast.years[0]
  );
</script>

<!-- ── Header ──────────────────────────────────────────────────────────── -->
<div class="flex-between mb-4">
  <div>
    <h3 class="text-lg font-semibold text-white">10-Year Capital Plan</h3>
    <p class="text-muted-sm mt-0.5">
      Forecast capital renewal spend across the plan window. Figures derive from each
      group's renewal cycle below — edit any assumption to re-shape the forecast.
    </p>
  </div>
  <div class="flex items-center gap-4">
    {#if forecast.grandTotal > 0}
      <div class="text-right">
        <p class="text-xs text-slate-500">Forecast total ({forecast.startYear}–{forecast.years[forecast.years.length - 1]})</p>
        <p class="text-xl font-bold text-purple-400">{fmtCost(forecast.grandTotal)}</p>
      </div>
    {/if}
    <Button variant="secondary" size="medium" icon="download"
            disabled={exporting || groups.length === 0}
            on:click={downloadPlan}>
      {exporting ? 'Exporting…' : 'Export Word'}
    </Button>
  </div>
</div>

{#if exportError}
  <div class="alert-error mb-4 text-sm">{exportError}</div>
{/if}

<ErrorDisplay message={error} onDismiss={() => maintenanceGroupsStore.load()} />

{#if loading}
  <LoadingSpinner />

{:else if groups.length === 0}
  <div class="empty-state">
    No groups found. Create groups in the Maint. Groups tab first.
  </div>

{:else}
  <!-- ── Horizon control ─────────────────────────────────────────────────── -->
  <div class="flex items-end gap-4 mb-4">
    <div class="flex flex-col gap-1">
      <label for="tp-start" class="text-label">Start year</label>
      <input id="tp-start" type="number" min="2000" max="2100" step="1"
             bind:value={startYear} class="input w-28" />
    </div>
    <div class="flex flex-col gap-1">
      <label for="tp-horizon" class="text-label">Horizon (years)</label>
      <input id="tp-horizon" type="number" min="1" max="30" step="1"
             bind:value={horizon} class="input w-28" />
    </div>
    {#if forecast.grandTotal > 0}
      <p class="text-xs text-slate-500 pb-2">
        Peak spend <span class="text-slate-300 font-semibold">{peakYear}</span>
        ({fmtCost(forecast.perYear[peakYear])})
      </p>
    {/if}
  </div>

  <!-- ── Forecast table ──────────────────────────────────────────────────── -->
  {#if forecast.rows.length > 0}
    <div class="bg-slate-800/50 border border-slate-700 rounded-xl overflow-x-auto mb-6">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-slate-700 text-left">
            <th class="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide sticky left-0 bg-slate-800/90">Group</th>
            {#each forecast.years as y}
              <th class="px-2 py-2.5 text-xs font-semibold text-slate-400 text-right whitespace-nowrap">{y}</th>
            {/each}
            <th class="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right whitespace-nowrap">Total</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-700/60">
          {#each forecast.rows as row (row.id)}
            <tr class="hover:bg-slate-700/30 transition-colors">
              <td class="px-3 py-2.5 font-medium text-white sticky left-0 bg-slate-800/60 whitespace-nowrap">
                {#if membership[row.id]?.attention}
                  <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 align-middle"
                        title="{membership[row.id].attention} component(s) flagged problem/failed — consider reviewing renewal timing"></span>
                {/if}{row.name}
              </td>
              {#each forecast.years as y}
                {@const overdueHere = row.occurrences.some(o => o.year === y && o.overdue)}
                {@const overridden  = !!row.overrides && (y in row.overrides)}
                <td class="px-2 py-2.5 text-right font-mono whitespace-nowrap
                           {overridden ? 'text-sky-300' : row.byYear[y] ? (overdueHere ? 'text-red-300' : 'text-purple-300') : 'text-slate-700'}"
                    title={overridden
                             ? `Manually set: ${fmtCost(row.byYear[y])} (derived ${fmtCost(row.derivedByYear[y])})`
                             : row.byYear[y] ? fmtCost(row.byYear[y]) + (overdueHere ? ' — includes an overdue renewal' : '') : ''}>
                  {#if overridden}<span class="text-sky-500">*</span>{/if}{row.byYear[y] ? fmtK(row.byYear[y]) : '·'}
                </td>
              {/each}
              <td class="px-3 py-2.5 text-right font-mono font-semibold text-purple-200 whitespace-nowrap">{fmtCost(row.total)}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <!-- Per-year capex -->
          <tr class="border-t-2 border-slate-600 bg-slate-800/70">
            <td class="px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide sticky left-0 bg-slate-800/90 whitespace-nowrap">Per-year capex</td>
            {#each forecast.years as y}
              <td class="px-2 py-2.5 text-right font-mono font-semibold text-slate-200 whitespace-nowrap">
                {forecast.perYear[y] ? fmtK(forecast.perYear[y]) : '·'}
              </td>
            {/each}
            <td class="px-3 py-2.5 text-right font-mono font-bold text-purple-300 whitespace-nowrap">{fmtCost(forecast.grandTotal)}</td>
          </tr>
          <!-- Cumulative reserve requirement -->
          <tr class="bg-slate-800/50">
            <td class="px-3 py-2 text-xs font-semibold text-slate-500 sticky left-0 bg-slate-800/90 whitespace-nowrap">Cumulative reserve</td>
            {#each forecast.years as y}
              <td class="px-2 py-2 text-right font-mono text-xs text-slate-400 whitespace-nowrap">
                {forecast.cumulative[y] ? fmtK(forecast.cumulative[y]) : '·'}
              </td>
            {/each}
            <td class="px-3 py-2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    {#if forecast.rows.some(r => r.overrides && Object.keys(r.overrides).length > 0)}
      <p class="text-xs text-slate-500 -mt-4 mb-6">
        <span class="text-sky-400 font-mono">*</span> manually set — a per-year override that wins over the derived figure.
      </p>
    {/if}
  {:else}
    <div class="card-info mb-6">
      <p class="text-sm text-blue-300">
        No renewals fall within {forecast.startYear}–{forecast.years[forecast.years.length - 1]}.
        Add renewal cycles below, or widen the horizon.
      </p>
    </div>
  {/if}

  {#if forecast.incomplete.length > 0}
    <p class="text-xs text-slate-500 mb-6 -mt-4">
      {forecast.incomplete.length} group{forecast.incomplete.length === 1 ? '' : 's'}
      with planning data fall outside this window or need a complete cycle
      (last renewal + lifetime + cost):
      <span class="text-slate-400">{forecast.incomplete.map(g => g.name).join(', ')}</span>
    </p>
  {/if}

  <!-- ── Group setup / assumptions ───────────────────────────────────────── -->
  <h4 class="text-sm font-semibold text-slate-300 mb-2">Group setup &amp; assumptions</h4>
  <div class="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-700 text-left">
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Group</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Assets &amp; condition</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Last Renewal</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Lifetime (yr)</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Next Renewal</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Cost / cycle</th>
          <th class="px-4 py-2.5 w-20"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-700/60">
        {#each groups as g (g.id)}
          {@const renewal  = expectedRenewal(g.last_renewal_date, g.lifetime_years)}
          {@const status   = renewalStatus(renewal)}
          {@const scfg     = statusCfg[status]}
          {@const m        = membership[g.id]}
          <tr class="hover:bg-slate-700/30 transition-colors {!g.last_renewal_date ? 'opacity-60' : ''}">
            <td class="px-4 py-3 font-medium text-white">
              {g.name}
              {#if g.notes}
                <p class="text-xs text-slate-500 mt-0.5 font-normal truncate max-w-[200px]">{g.notes}</p>
              {/if}
            </td>
            <td class="px-4 py-3">
              {#if !m || m.manual}
                <span class="text-xs text-slate-600">Manual line</span>
              {:else if m.total === 0}
                <span class="text-xs text-slate-600">No live assets</span>
              {:else}
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-sm text-slate-300">{m.total}</span>
                  <span class="text-xs text-slate-500">component{m.total === 1 ? '' : 's'}</span>
                  {#if m.byStatus.failed}
                    <span class="px-1.5 py-0.5 text-xs rounded bg-red-900/40 text-red-300 border border-red-800/50">{m.byStatus.failed} failed</span>
                  {/if}
                  {#if m.byStatus.problem}
                    <span class="px-1.5 py-0.5 text-xs rounded bg-amber-900/40 text-amber-300 border border-amber-800/50">{m.byStatus.problem} problem</span>
                  {/if}
                  {#if !m.attention}
                    <span class="text-xs text-emerald-500" title="No components flagged">✓</span>
                  {/if}
                </div>
              {/if}
            </td>
            <td class="px-4 py-3 text-slate-300">
              {fmtDate(g.last_renewal_date)}
            </td>
            <td class="px-4 py-3 text-center text-slate-300">
              {g.lifetime_years != null ? g.lifetime_years : '—'}
            </td>
            <td class="px-4 py-3">
              {#if renewal}
                <span class={scfg.cls}>
                  {fmtDate(renewal)}
                  {#if scfg.label}
                    <span class="ml-1 text-xs">({scfg.label})</span>
                  {/if}
                </span>
              {:else}
                <span class="text-slate-600">—</span>
              {/if}
            </td>
            <td class="px-4 py-3 text-right font-mono {g.expected_cost ? 'text-purple-300' : 'text-slate-600'}">
              {fmtCost(g.expected_cost)}
            </td>
            <td class="px-4 py-3 text-right">
              <button
                on:click={() => openEdit(g)}
                class="px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >Edit</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="text-xs text-slate-500 mt-2">
    Assets &amp; condition reflect each group's live components and their current status.
    They are shown for context only — a flagged component never changes a renewal date;
    review it and adjust the assumptions yourself if warranted.
  </p>

  <!-- Summary card if no data at all -->
  {#if groupsWithData.length === 0}
    <div class="card-info mt-4">
      <p class="text-sm text-blue-300">
        No planning data yet. Click <strong>Edit</strong> on any row to add renewal dates and costs.
      </p>
    </div>
  {/if}
{/if}

<!-- ── Plan edit modal ────────────────────────────────────────────────────── -->
{#if showModal}
  {@const g = groups.find(x => x.id === editId)}
  <Modal bind:show={showModal} size="medium" title="Edit Plan — {g?.name ?? ''}">

    {#if modalError}
      <div class="alert-error mb-4 text-sm">{modalError}</div>
    {/if}

    <div class="form-spacing">

      <div class="flex flex-col gap-1">
        <label for="tp-last" class="text-label">Last Renewal Date</label>
        <input id="tp-last" type="date" bind:value={editLastRenewal} class="input" />
      </div>

      <!-- Renewal-date suggestions from completed job history (R2 — offer only) -->
      {#if editSuggestions.candidates.length > 0}
        <div class="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700">
          <p class="text-xs text-slate-400 mb-1.5">Recent maintenance for this group — click a date to use it:</p>
          <div class="flex flex-col gap-1">
            {#each editSuggestions.candidates as job (job.id)}
              <button type="button"
                      on:click={() => editLastRenewal = job.completed_date}
                      class="flex items-baseline gap-2 text-left px-2 py-1 rounded hover:bg-slate-700/60 transition-colors
                             {editLastRenewal === job.completed_date ? 'bg-purple-900/30' : ''}">
                <span class="font-mono text-xs text-purple-300 whitespace-nowrap">{fmtDate(job.completed_date)}</span>
                <span class="text-xs text-slate-300 truncate">{job.title}</span>
              </button>
            {/each}
          </div>
          <p class="text-[11px] text-slate-500 mt-1.5">
            A suggestion only — check it was a renewal, not a routine service. Nothing is saved until you press Save.
          </p>
        </div>
      {/if}

      <div class="flex flex-col gap-1">
        <label for="tp-life" class="text-label">Lifetime (years)</label>
        <input
          id="tp-life"
          type="number"
          min="0.5"
          max="50"
          step="0.5"
          bind:value={editLifetime}
          placeholder="e.g. 10"
          class="input"
        />
        <p class="text-muted-sm">Fractional years supported, e.g. 7.5 = 7 yr 6 mo</p>
      </div>

      <!-- Expected renewal (calculated, read-only preview) -->
      {#if editLastRenewal && editLifetime}
        {@const preview = expectedRenewal(editLastRenewal, parseFloat(editLifetime) || 0)}
        {#if preview}
          <div class="px-3 py-2 rounded-lg bg-purple-900/20 border border-purple-700/30">
            <p class="text-xs text-slate-400">Expected renewal date</p>
            <p class="text-sm font-semibold text-purple-300">{fmtDate(preview)}</p>
          </div>
        {/if}
      {/if}

      <div class="flex flex-col gap-1">
        <label for="tp-cost" class="text-label">Estimated Cost (£)</label>
        <input
          id="tp-cost"
          type="number"
          min="0"
          step="100"
          bind:value={editCost}
          placeholder="e.g. 25000"
          class="input"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label for="tp-notes" class="text-label">Notes</label>
        <textarea
          id="tp-notes"
          rows="2"
          bind:value={editNotes}
          placeholder="Scope, assumptions, contractor…"
          class="textarea"
        ></textarea>
      </div>

      <!-- Per-year adjustments (finer R0 — override the forecast for specific years) -->
      <div class="flex flex-col gap-1">
        <p class="text-label">
          Per-year adjustments
          <span class="text-slate-500 font-normal">— optional; override the forecast for a specific year</span>
        </p>
        <div class="rounded-lg border border-slate-700 bg-slate-800/40 divide-y divide-slate-700/50 max-h-52 overflow-y-auto">
          {#each forecast.years as y}
            <div class="flex items-center gap-3 px-3 py-1.5">
              <span class="text-sm font-mono text-slate-300 w-12">{y}</span>
              <span class="text-xs text-slate-500 w-28">derived {editDerived[y] ? fmtCost(editDerived[y]) : '—'}</span>
              <input type="number" min="0" step="100" placeholder="—"
                     bind:value={overrideInputs[y]}
                     class="input flex-1 text-sm" />
            </div>
          {/each}
        </div>
        <p class="text-muted-sm">
          Leave blank to use the derived figure. Enter <strong>0</strong> to defer (nothing that year).
          To move a renewal, set its year to 0 and enter the amount in the target year.
        </p>
      </div>

    </div>

    <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
      <Button variant="secondary" on:click={() => showModal = false} disabled={saving}>
        Cancel
      </Button>
      <Button variant="primary" on:click={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>

  </Modal>
{/if}
