<!-- src/lib/apps/compliance/components/CompliancePositionTab.svelte -->
<!-- The compliance position, the evidence behind it, and the open faults beside it.
     M4/M7 — docs/requirements/registers/Maintenance_Review.md.

     ⭐ THIS TAB MOVED OUT OF THE MAINTENANCE APP (C3,
     docs/design/compliance_app_design.md §6.1). It reads walk sessions
     (Inspection's), jobs (Maintenance's) and applicability decisions (this
     app's) and composes a position from all three — so it was a compliance
     report living where ONE of its three sources lives, placed by adjacency
     rather than by ownership. ⛔ Moving it also ended the collision the
     vocabulary work existed to catch: the portal briefly had a Compliance app
     and a Maintenance → Compliance tab meaning different things.

     Two reports over the same data. The FILTERS define what is on screen; the
     Word export prints exactly what the filters produced, plus a few options
     that only make sense on paper. That is the same shape as the inspections
     and schedule reports, so a printed report can never disagree with the
     screen it came from.

     ⚠ CROSS-APP READS, all three gated the way Cross_App_Aggregation_Spec.md
     requires — on the READER's permission for the OWNING app, and failing
     ALONE. Losing one degrades the report and says so; it never empties it.
     ⚠ Both gates are currently moot, because this app is admin-only and admins
     bypass grants. They stay anyway: a control is not removed because today's
     configuration makes it redundant, and §5 of the design doc leaves widening
     the app open. -->
<script>
  import { onMount } from 'svelte';
  import { listWalkSessions } from '$lib/apps/inspection/public.js';
  import { listJobEvidence } from '$lib/apps/maintenance/public.js';
  // ⭐ This app's own tables. They used to be read through
  // `inspection/public.js`, which was an ownership inversion left behind by
  // migration 206 — see compliance/public.js.
  import { listPlannedObligations, listStatutoryExclusions } from '../public.js';
  import { listComponentsByStatus, listWorksLinesFor } from '$lib/apps/building_assets/public.js';
  import { correctiveSummary, faultLabel, FAULT_STATUSES } from '../utils/correctiveWork.js';
  import { permissions } from '$lib/stores/permissions';
  import { authHeaders } from '$lib/utils/authHeaders';
  import { downloadResponse } from '$lib/utils/download';
  import { walkEventsFromSessions, jobEventsFromJobs } from '$lib/utils/obligationSchedule.js';
  import {
    compliancePosition, positionSummary, filterRows, sortRows, groupRows,
    evidenceHistory, SORTS, SORT_LABEL, ROW_STATUS, ROW_STATUS_LABEL,
    HISTORY_MODES, HISTORY_MODE_LABEL,
  } from '$lib/utils/obligationReport.js';
  import {
    BASIS, BASIS_LABEL, GROUPS, GROUP_LABEL, HANDLED_BY_LABEL,
  } from '$lib/utils/statutoryTemplate.js';
  import { frequencyLabel } from '$lib/utils/inspectionSchedule';
  import { fmtDate, fmtDateTime, fmtToday } from '$lib/utils/dates.js';
  import { addDaysISO, today } from '$lib/apps/maintenance/utils/maintenanceHelpers.js';
  import Button from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';
  import { getLogger } from '$lib/utils/logger';

  const logger = getLogger('CompliancePositionTab');

  // -- Cross-app data ----------------------------------------------------------
  let obligations = [];
  let sessions = [];
  let jobs = [];
  let exclusions = [];
  let faults = [];
  let worksLines = [];
  let loading = true;
  let loadError = '';
  // ⚠ ONE fact per stream, not two: an empty note means the evidence loaded.
  // A boolean beside the sentence is a second copy that goes stale in whichever
  // place is not being edited — this file's own project has found that a dozen
  // times over.
  let walkEvidenceNote = '';
  let jobEvidenceNote = '';
  let faultsAvailable = true;

  $: canReadWalks = $permissions.isAdmin || Boolean($permissions.appPermissions?.inspection?.hasAccess);
  $: canReadJobs  = $permissions.isAdmin || Boolean($permissions.appPermissions?.maintenance?.hasAccess);
  $: canReadAssets = $permissions.isAdmin || Boolean($permissions.appPermissions?.building_assets?.hasAccess);

  onMount(async () => {
    try {
      // ALL planned obligations, not the job-evidenced subset: this report is
      // about the whole register, both evidence routes.
      obligations = await listPlannedObligations();
    } catch (/** @type {any} */ err) {
      loadError = `Could not read this building's planned obligations: ${err.message}`;
    }

    // Gate on the READER's permission for the owning app, not on the data
    // existing — the same question `planner/utils/linked.js` visibleSources()
    // asks, read from the permissions store's own state so it costs no query.
    // The Planner shipped without asking it and showed one app's records to
    // someone who had never been granted that app.
    //
    // ⚠ A UI gate, not a security boundary: these tables still read as any
    // signed-in user at RLS. What it fixes is this report PRESENTING another
    // app's records to somebody who was never given that app.
    if (canReadWalks) {
      try {
        sessions = await listWalkSessions();
      } catch (/** @type {any} */ err) {
        walkEvidenceNote = 'Inspection evidence could not be loaded, so walk-evidenced compliance obligations below show only what jobs prove.';
        logger('⚠ walk sessions unavailable:', err.message);
      }
    } else {
      walkEvidenceNote = 'You do not have the Inspection app, so walk evidence is not included. Compliance obligations discharged by an inspection walk will read as though nothing has been done.';
    }

    // ⭐ Jobs are a cross-app read NOW, and were not before. While this tab
    // lived in Maintenance they arrived free on that app's own store; here they
    // need the same gate and the same fail-alone treatment as walks. ⚠ This is
    // the larger half of the evidence: 57 of the 80 planned obligations are
    // discharged by a contractor visit against 23 by a walk.
    if (canReadJobs) {
      try {
        jobs = await listJobEvidence();
      } catch (/** @type {any} */ err) {
        jobEvidenceNote = 'Maintenance evidence could not be loaded, so compliance obligations discharged by a contractor visit show only what inspection walks prove.';
        logger('⚠ maintenance jobs unavailable:', err.message);
      }
    } else {
      jobEvidenceNote = 'You do not have the Maintenance app, so contractor-visit evidence is not included. Most of this building’s compliance obligations are discharged that way and will read as though nothing has been done.';
    }

    try {
      exclusions = await listStatutoryExclusions();
    } catch (/** @type {any} */ err) {
      logger('⚠ exclusions unavailable:', err.message);
    }

    // Open faults — the band beside the obligations, never inside them.
    if (canReadAssets) {
      try {
        faults = await listComponentsByStatus(FAULT_STATUSES);
        worksLines = faults.length ? await listWorksLinesFor(faults.map(c => c.id)) : [];
      } catch (/** @type {any} */ err) {
        faultsAvailable = false;
        logger('⚠ open faults unavailable:', err.message);
      }
    } else {
      faultsAvailable = false;
    }

    loading = false;
  });

  // -- Open faults, beside the position and never in it ------------------------
  // ⛔ `corrective` is NEVER folded into `summary`. Corrective work discharges
  // no duty, so adding it to the obligation counts would make an open fault
  // list look like compliance progress. An invisible open fault is the "reads
  // plausibly while saying something untrue" failure; a summed one is worse.
  $: corrective = correctiveSummary({ components: faults, worksItems: worksLines });
  let showFaults = false;

  // -- The two reports ---------------------------------------------------------
  $: events = [...walkEventsFromSessions(sessions), ...jobEventsFromJobs(jobs)];
  $: allRows = compliancePosition({ obligations, events, exclusions });

  let report = 'position';        // 'position' | 'history'

  // Filters — these define the on-screen report AND what gets printed.
  let fGroups = [];
  let fBases = [];
  let fStatuses = [];
  let search = '';
  let sort = 'register';
  let groupBy = 'group';

  $: rows = sortRows(filterRows(allRows, {
    groups: fGroups, bases: fBases, statuses: fStatuses, search,
  }), sort);
  $: grouped = groupRows(rows, groupBy);
  $: summary = positionSummary(allRows);

  function toggle(list, v) {
    return list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  }
  function clearFilters() { fGroups = []; fBases = []; fStatuses = []; search = ''; }

  // History window: last 12 months by default — long enough to hold one cycle
  // of every annual requirement, which is what "show me the evidence" means.
  let histFrom = addDaysISO(today(), -365);
  let histTo = today();
  let histMode = 'completed';

  $: visibleObligationIds = rows.flatMap(r => r.obligations.map(o => o.id));
  $: history = evidenceHistory({ events, obligations }, {
    from: histFrom, to: histTo, mode: histMode,
    obligationIds: visibleObligationIds,
  });

  // -- Word export -------------------------------------------------------------
  // Printable-only options. Everything else about the document comes from the
  // filters above, so what prints is what was on screen.
  let showExport = false;
  let optIncludeExcluded = true;
  let optIncludeElsewhere = true;
  let optIncludeHistory = false;
  let optNotes = '';
  let downloading = false;
  let downloadError = '';

  async function download() {
    downloading = true; downloadError = '';
    try {
      const res = await fetch('/api/maintenance/generate-compliance-report', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          building: 'Lonsdale House',
          generatedAt: fmtToday(),
          report,
          rows: rows.map(r => ({
            name: r.name, basis: r.basis, group: r.group,
            statutoryRef: r.statutoryRef, owner: r.owner,
            frequencyLabel: frequencyLabel(r.frequencyDays),
            lastCompleted: r.lastCompleted, lastAttempted: r.lastAttempted,
            lastOutcome: r.lastOutcome, nextDue: r.nextDue,
            status: r.status, statusLabel: ROW_STATUS_LABEL[r.status],
            assuranceOnly: r.assuranceOnly ?? null,
            handledBy: HANDLED_BY_LABEL[r.handledBy] ?? r.handledBy,
            intervalBreached: r.intervalBreached,
            exclusionReason: r.exclusion?.reason ?? null,
            exclusionDecidedAt: r.exclusion?.decided_at ?? null,
            exclusionReviewDue: r.exclusion?.review_due ?? null,
            retiredOn: r.retiredOn ?? null,
            retiredReason: r.retiredReason ?? null,
          })),
          history: optIncludeHistory || report === 'history' ? history : [],
          historyWindow: { from: histFrom, to: histTo, mode: histMode },
          summary,
          options: {
            includeExcluded: optIncludeExcluded,
            includeElsewhere: optIncludeElsewhere,
            includeHistory: optIncludeHistory || report === 'history',
            notes: optNotes.trim(),
            evidenceNotes: [walkEvidenceNote, jobEvidenceNote].filter(Boolean),
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await downloadResponse(res, `Compliance_Position_${today()}.docx`);
      showExport = false;
    } catch (/** @type {any} */ err) {
      downloadError = `Download failed: ${err.message}`;
    } finally {
      downloading = false;
    }
  }

  const statusCls = s => `st-${s}`;
</script>

<div class="comp">
  {#if loadError}<ErrorDisplay message={loadError} onDismiss={() => (loadError = '')} />{/if}
  {#if downloadError}<ErrorDisplay message={downloadError} onDismiss={() => (downloadError = '')} />{/if}

  {#if loading}
    <LoadingSpinner />
  {:else}
    <!-- Headline -->
    <div class="summary">
      {#each ROW_STATUS as s (s)}
        {#if summary[s] > 0}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="sum {statusCls(s)}" class:on={fStatuses.includes(s)}
               on:click={() => (fStatuses = toggle(fStatuses, s))}
               title="Filter to these">
            <span class="sum-n">{summary[s]}</span>
            <span class="sum-l">{ROW_STATUS_LABEL[s]}</span>
          </div>
        {/if}
      {/each}
    </div>

    {#if walkEvidenceNote}<p class="degraded">⚠ {walkEvidenceNote}</p>{/if}
    {#if jobEvidenceNote}<p class="degraded">⚠ {jobEvidenceNote}</p>{/if}

    <!-- ══ Open faults — ADJACENT to the position, never part of it ══════════
         ⛔ These figures are NEVER added to the ones above. Corrective work
         discharges no duty: a building with every cycle on schedule and nine
         failed components is not compliant-and-tidy, and summing the two would
         make an open fault list read as compliance progress. The band is
         styled outside the pass/fail palette for the same reason the
         `assured` pill is — it is not a third kind of compliant.
         docs/design/compliance_app_design.md §11. -->
    {#if faultsAvailable && corrective.open > 0}
      <div class="faults">
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="faults-head" on:click={() => (showFaults = !showFaults)}>
          <span class="faults-n">{corrective.open}</span>
          <span class="faults-l">
            open fault{corrective.open === 1 ? '' : 's'}
            <span class="faults-sub">
              {corrective.failed} failed · {corrective.problem} problem ·
              {corrective.covered} on an issued works schedule ·
              <strong>{corrective.uncovered} with no works schedule issued</strong>
            </span>
          </span>
          <span class="faults-toggle">{showFaults ? 'Hide' : 'Show'}</span>
        </div>
        <p class="faults-why">
          Corrective work — a component found broken. It discharges no compliance obligation,
          so it is counted here and not above. ⚠ Coverage means a works schedule that has been
          <em>issued</em>; a draft has not been sent to anybody, and a corrective maintenance job
          is not counted at all.
        </p>
        {#if showFaults}
          <div class="tbl faultlist">
            <div class="th"><div>Component</div><div>Status</div><div>Works schedule</div></div>
            {#each corrective.rows as f (f.id)}
              <div class="tr">
                <div class="c-name"><span class="nm">{faultLabel(f)}</span>
                  {#if f.type_code}<span class="ref">{f.type_code}</span>{/if}
                </div>
                <div><span class="pill {f.status === 'failed' ? 'st-breach' : 'st-attention'}">{f.status === 'failed' ? 'Failed' : 'Problem'}</span></div>
                <div>
                  {#if f.schedules.length}
                    {#each f.schedules as sched (sched.id)}
                      <span class="sched">{sched.reference ?? sched.title} · {sched.status}</span>
                    {/each}
                  {:else}
                    <span class="none">None issued</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Report switch + export -->
    <div class="bar">
      <div class="views">
        <button class="view-btn" class:on={report === 'position'} on:click={() => (report = 'position')}>Compliance position</button>
        <button class="view-btn" class:on={report === 'history'}  on:click={() => (report = 'history')}>Evidence history</button>
      </div>
      <Button variant="secondary" size="small" on:click={() => (showExport = true)}>⬇ Word report</Button>
    </div>

    <!-- Filters — these define the report, on screen and on paper -->
    <div class="filters">
      <div class="frow">
        <span class="fl">Category</span>
        {#each GROUPS as g (g)}
          <button class="chip" class:on={fGroups.includes(g)} on:click={() => (fGroups = toggle(fGroups, g))}>{GROUP_LABEL[g]}</button>
        {/each}
        <button class="chip" class:on={fGroups.includes('unlisted')} on:click={() => (fGroups = toggle(fGroups, 'unlisted'))}>Not in the register</button>
      </div>
      <div class="frow">
        <span class="fl">Source</span>
        {#each BASIS as b (b)}
          <button class="chip" class:on={fBases.includes(b)} on:click={() => (fBases = toggle(fBases, b))}>{BASIS_LABEL[b]}</button>
        {/each}
      </div>
      <div class="frow">
        <span class="fl">Sort</span>
        <select bind:value={sort} class="sel">
          {#each SORTS as s (s)}<option value={s}>{SORT_LABEL[s]}</option>{/each}
        </select>
        <span class="fl">Group by</span>
        <select bind:value={groupBy} class="sel">
          <option value="group">Category</option>
          <option value="basis">Source</option>
          <option value="status">Status</option>
          <option value="handledBy">Handled by</option>
          <option value="none">Nothing</option>
        </select>
        <input class="search" placeholder="Search name, reference, owner" bind:value={search} />
        {#if fGroups.length || fBases.length || fStatuses.length || search}
          <button class="chip clear" on:click={clearFilters}>Clear</button>
        {/if}
        <span class="count">{rows.length} of {allRows.length}</span>
      </div>
    </div>

    {#if report === 'position'}
      <!-- ══ Compliance position ═══════════════════════════════════════════ -->
      {#if rows.length === 0}
        <p class="empty">Nothing matches these filters.</p>
      {:else}
        {#each [...grouped] as [key, groupRowsList] (key)}
          {#if groupBy !== 'none'}
            <h4 class="grp">
              {groupBy === 'group' ? (GROUP_LABEL[key] ?? 'Not in the register')
                : groupBy === 'basis' ? (BASIS_LABEL[key] ?? 'Not in the register')
                : groupBy === 'status' ? ROW_STATUS_LABEL[key]
                : (HANDLED_BY_LABEL[key] ?? key)}
              <span class="grp-n">{groupRowsList.length}</span>
            </h4>
          {/if}
          <div class="tbl">
            <div class="th">
              <div>Compliance obligation</div><div>Source</div><div>Cadence</div>
              <div>Last completed</div><div>Last attempted</div><div>Next due</div><div>Status</div>
            </div>
            {#each groupRowsList as r (r.key)}
              <div class="tr {statusCls(r.status)}">
                <div class="c-name">
                  <span class="nm">{r.name}</span>
                  {#if r.statutoryRef}<span class="ref">{r.statutoryRef}</span>{/if}
                  {#if r.owner}<span class="owner">{r.owner}</span>{/if}
                  {#if r.exclusion}
                    <span class="excl">Not applicable — “{r.exclusion.reason}” ({fmtDate(r.exclusion.decided_at)})</span>
                  {/if}
                  {#if r.retiredReason}
                    <span class="excl">{r.retiredReason}{#if r.retiredOn && !r.retiredReason.includes(r.retiredOn)} · from {fmtDate(r.retiredOn)}{/if}</span>
                  {/if}
                </div>
                <div>{r.basis ? BASIS_LABEL[r.basis] : '—'}</div>
                <div>{r.frequencyDays ? frequencyLabel(r.frequencyDays) : 'On event'}</div>
                <div class:none={!r.lastCompleted}>{r.lastCompleted ? fmtDate(r.lastCompleted) : 'Never'}</div>
                <div class="c-att">
                  {#if r.lastAttempted}
                    {fmtDate(r.lastAttempted)}
                    {#if r.lastOutcome}<span class="outcome">{r.lastOutcome}</span>{/if}
                  {:else}<span class="none">—</span>{/if}
                </div>
                <div>{r.nextDue ? fmtDate(r.nextDue) : '—'}</div>
                <div>
                  <span class="pill {statusCls(r.status)}">{ROW_STATUS_LABEL[r.status]}</span>
                  {#if r.assuranceOnly}
                    <span class="assurance-note">This does not discharge the duty — that is done by {r.assuranceOnly}</span>
                  {/if}
                  {#if r.intervalBreached}<span class="pill breach">Max interval</span>{/if}
                </div>
              </div>
            {/each}
          </div>
        {/each}
      {/if}

    {:else}
      <!-- ══ Evidence history ══════════════════════════════════════════════ -->
      <div class="filters">
        <div class="frow">
          <span class="fl">From</span>
          <input type="date" class="sel" bind:value={histFrom} />
          <span class="fl">To</span>
          <input type="date" class="sel" bind:value={histTo} />
          <select bind:value={histMode} class="sel">
            {#each HISTORY_MODES as m (m)}<option value={m}>{HISTORY_MODE_LABEL[m]}</option>{/each}
          </select>
          <span class="count">{history.length} occurrence{history.length === 1 ? '' : 's'}</span>
        </div>
        <p class="hint">
          Covers the {rows.length} compliance obligation{rows.length === 1 ? '' : 's'} the filters above select.
          Switch to <em>Due in the period</em> to find work that was booked and never happened;
          it cannot show under <em>Completed</em>.
        </p>
      </div>

      {#if history.length === 0}
        <p class="empty">No occurrences in this period.</p>
      {:else}
        <div class="tbl hist">
          <div class="th">
            <div>Date</div><div>Compliance obligation</div><div>Outcome</div><div>By</div><div>Reference</div>
          </div>
          {#each history as h, i (h.sourceId ?? `${h.obligationId}-${h.at}-${i}`)}
            <div class="tr">
              <div>{fmtDateTime(h.at)}</div>
              <div class="c-name">
                <span class="nm">{h.obligationName}</span>
                {#if h.title && h.title !== h.obligationName}<span class="ref">{h.title}</span>{/if}
              </div>
              <div>
                <span class="pill {h.status === 'completed' ? 'st-ok' : h.status === 'attempted' ? 'st-attention' : 'st-elsewhere'}">
                  {h.kind === 'walk' ? 'Inspection' : 'Job'}
                </span>
                <span class="outcome">{h.outcome}</span>
              </div>
              <div>{h.by ?? '—'}</div>
              <div>
                {h.reference ?? '—'}
                {#if h.notes}<span class="outcome">{h.notes}</span>{/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<!-- Printable-only options. Everything else comes from the filters, so the
     document and the screen can never disagree. -->
<Modal show={showExport} title="Word report" size="medium" on:close={() => (showExport = false)}>
  <div class="exp">
    <p class="exp-what">
      Prints the {rows.length} compliance obligation{rows.length === 1 ? '' : 's'} currently on screen,
      in the order shown.
    </p>
    <Checkbox bind:checked={optIncludeExcluded} label="Include compliance obligations recorded as not applicable, with their reasons" />
    <p class="exp-note">
      Leave this on for anything an assessor will read. A report that quietly leaves out what you
      decided does not apply is the first thing they will ask about.
    </p>
    <Checkbox bind:checked={optIncludeElsewhere} label="Include compliance obligations tracked in another part of the portal" />
    <Checkbox bind:checked={optIncludeHistory} label="Append the evidence history for the selected period" />
    <label class="exp-lbl" for="comp-notes">Note for this report (optional)</label>
    <textarea id="comp-notes" class="exp-ta" rows="3" bind:value={optNotes}
      placeholder="e.g. Position as presented to the 14 October board meeting."></textarea>
    <div class="exp-actions">
      <Button variant="secondary" disabled={downloading} on:click={() => (showExport = false)}>Cancel</Button>
      <Button variant="primary" disabled={downloading} on:click={download}>
        {downloading ? 'Generating…' : 'Download'}
      </Button>
    </div>
  </div>
</Modal>

<style>
  .comp { display: flex; flex-direction: column; gap: 0.85rem; }

  .summary { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .sum { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.45rem 0.75rem; border-radius: 8px;
         border: 1px solid rgb(71 85 105 / 0.5); background: rgb(15 23 42 / 0.4); cursor: pointer; min-width: 92px; }
  .sum:hover { border-color: rgb(148 163 184 / 0.7); }
  .sum.on { outline: 2px solid var(--lh-accent); }
  .sum-n { font-size: 1.15rem; font-weight: 600; color: rgb(226 232 240); }
  .sum-l { font-size: 0.68rem; color: rgb(148 163 184); text-transform: uppercase; letter-spacing: 0.04em; }
  .sum.st-breach .sum-n { color: rgb(252 165 165); }
  .sum.st-gap .sum-n { color: rgb(252 211 77); }
  .sum.st-attention .sum-n { color: rgb(251 191 36); }
  .sum.st-ok .sum-n { color: rgb(134 239 172); }
  .sum.st-assured .sum-n { color: rgb(196 181 253); }
  .sum.st-superseded .sum-n, .sum.st-retired .sum-n { color: rgb(148 163 184); }

  .degraded { font-size: 0.8rem; color: rgb(252 211 77); background: rgb(251 191 36 / 0.1);
              border-radius: 6px; padding: 0.5rem 0.7rem; line-height: 1.45; }

  .bar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .views { display: flex; gap: 0.4rem; }
  .view-btn { font-size: 0.78rem; padding: 0.32rem 0.75rem; border-radius: 6px; cursor: pointer;
              border: 1px solid rgb(71 85 105 / 0.6); background: transparent; color: rgb(148 163 184); }
  .view-btn.on { background: rgb(var(--lh-accent-rgb) / 0.15); border-color: rgb(var(--lh-accent-rgb) / 0.5); color: rgb(226 232 240); }

  .filters { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.6rem 0.75rem;
             border-radius: 8px; background: rgb(15 23 42 / 0.35); border: 1px solid rgb(71 85 105 / 0.4); }
  .frow { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
  .fl { font-size: 0.7rem; color: rgb(100 116 139); text-transform: uppercase; letter-spacing: 0.05em; margin-right: 0.15rem; }
  .chip { font-size: 0.72rem; padding: 0.2rem 0.55rem; border-radius: 999px; cursor: pointer;
          border: 1px solid rgb(71 85 105 / 0.6); background: transparent; color: rgb(148 163 184); }
  .chip.on { background: rgb(var(--lh-accent-rgb) / 0.18); border-color: rgb(var(--lh-accent-rgb) / 0.5); color: rgb(226 232 240); }
  .chip.clear { color: rgb(252 165 165); border-color: rgb(248 113 113 / 0.4); }
  .sel { background: rgb(30 41 59); border: 1px solid rgb(71 85 105); border-radius: 5px;
         padding: 0.2rem 0.4rem; font-size: 0.75rem; color: rgb(226 232 240); }
  .search { background: rgb(30 41 59); border: 1px solid rgb(71 85 105); border-radius: 5px;
            padding: 0.2rem 0.5rem; font-size: 0.75rem; color: rgb(226 232 240); min-width: 200px; }
  .count { font-size: 0.72rem; color: rgb(100 116 139); margin-left: auto; }
  .hint { font-size: 0.72rem; color: rgb(100 116 139); line-height: 1.45; }

  .grp { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgb(148 163 184);
         font-weight: 600; margin-top: 0.5rem; display: flex; align-items: center; gap: 0.4rem; }
  .grp-n { font-size: 0.68rem; color: rgb(100 116 139); }


  /* Open faults — deliberately OUTSIDE the pass/fail palette. Slate, not red
     and not green: corrective work is not a third kind of compliant, and a
     reader scanning for a status colour must not find one here. Same argument
     as the violet `assured` pill. */
  .faults { border: 1px solid rgb(100 116 139 / 0.45); border-radius: 8px;
            background: rgb(51 65 85 / 0.25); padding: 0.6rem 0.75rem; margin-bottom: 0.75rem; }
  .faults-head { display: flex; align-items: baseline; gap: 0.6rem; cursor: pointer; }
  .faults-n { font-size: 1.35rem; font-weight: 700; color: rgb(226 232 240); }
  .faults-l { font-size: 0.85rem; color: rgb(203 213 225); flex: 1; }
  .faults-sub { display: block; font-size: 0.75rem; color: rgb(148 163 184); margin-top: 0.15rem; }
  .faults-sub strong { color: rgb(226 232 240); font-weight: 600; }
  .faults-toggle { font-size: 0.72rem; color: rgb(148 163 184); text-decoration: underline; }
  .faults-why { font-size: 0.72rem; color: rgb(148 163 184); margin: 0.5rem 0 0; line-height: 1.5; }
  .faults .tbl { margin-top: 0.6rem; }
  .sched { display: block; font-size: 0.72rem; color: rgb(203 213 225); }
  .tbl { border: 1px solid rgb(71 85 105 / 0.4); border-radius: 8px; overflow: hidden; }
  .th, .tr { display: grid; grid-template-columns: 2.2fr 0.9fr 0.8fr 0.9fr 1.3fr 0.9fr 1fr; gap: 0.5rem;
             padding: 0.45rem 0.7rem; font-size: 0.76rem; align-items: start; }
  .tbl.hist .th, .tbl.hist .tr { grid-template-columns: 1fr 2fr 1.6fr 1fr 1.2fr; }
  .tbl.faultlist .th, .tbl.faultlist .tr { grid-template-columns: 2.4fr 0.9fr 1.6fr; }
  .th { background: rgb(30 41 59 / 0.6); color: rgb(100 116 139); font-size: 0.68rem;
        text-transform: uppercase; letter-spacing: 0.04em; }
  .tr { border-top: 1px solid rgb(71 85 105 / 0.25); color: rgb(203 213 225); }
  .tr:hover { background: rgb(51 65 85 / 0.2); }
  .tr.st-breach { border-left: 3px solid rgb(248 113 113 / 0.8); }
  .tr.st-gap { border-left: 3px solid rgb(251 191 36 / 0.7); }
  .tr.st-excluded, .tr.st-superseded, .tr.st-retired { opacity: 0.62; }

  .c-name { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .nm { color: rgb(226 232 240); font-weight: 500; }
  .ref { font-size: 0.7rem; color: rgb(148 163 184); font-style: italic; }
  .owner { font-size: 0.7rem; color: rgb(100 116 139); }
  .excl { font-size: 0.7rem; color: rgb(148 163 184); }
  .c-att { display: flex; flex-direction: column; gap: 0.1rem; }
  .outcome { font-size: 0.7rem; color: rgb(100 116 139); display: block; }
  .none { color: rgb(100 116 139); }

  .pill { font-size: 0.64rem; padding: 0.08rem 0.4rem; border-radius: 4px; white-space: nowrap; }
  .pill.st-breach { background: rgb(248 113 113 / 0.2); color: rgb(252 165 165); }
  .pill.st-gap { background: rgb(251 191 36 / 0.18); color: rgb(252 211 77); }
  .pill.st-attention { background: rgb(251 146 60 / 0.18); color: rgb(253 186 116); }
  .pill.st-ok { background: rgb(34 197 94 / 0.16); color: rgb(134 239 172); }
  /* Violet, and deliberately outside the pass/fail palette: green would claim
     the statutory duty is met, amber would claim this control is failing.
     Neither is true — it is running, and it answers a different question. */
  .pill.st-assured { background: rgb(139 92 246 / 0.18); color: rgb(196 181 253); }
  .pill.st-elsewhere { background: rgb(56 189 248 / 0.14); color: rgb(125 211 252); }
  .assurance-note {
    display: block; margin-top: 3px; font-size: 0.68rem; line-height: 1.35;
    color: rgb(196 181 253); max-width: 46ch;
  }
  .pill.st-unhomed { background: rgb(248 113 113 / 0.25); color: rgb(254 202 202); }
  .pill.st-excluded { background: rgb(71 85 105 / 0.5); color: rgb(148 163 184); }
  .pill.st-superseded, .pill.st-retired { background: rgb(100 116 139 / 0.35); color: rgb(203 213 225); }
  .pill.breach { background: rgb(248 113 113 / 0.25); color: rgb(254 202 202); margin-left: 0.25rem; }

  .empty { font-size: 0.85rem; color: rgb(100 116 139); padding: 1.2rem 0; }

  .exp { display: flex; flex-direction: column; gap: 0.6rem; }
  .exp-what { font-size: 0.85rem; color: rgb(203 213 225); }
  .exp-note { font-size: 0.74rem; color: rgb(100 116 139); line-height: 1.45; margin-top: -0.35rem; }
  .exp-lbl { font-size: 0.75rem; color: rgb(148 163 184); }
  .exp-ta { background: rgb(30 41 59); border: 1px solid rgb(71 85 105); border-radius: 6px;
            padding: 0.45rem 0.6rem; font-size: 0.8rem; color: rgb(226 232 240); resize: vertical; }
  .exp-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.3rem; }
</style>
