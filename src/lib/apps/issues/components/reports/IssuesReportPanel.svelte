<!-- src/lib/apps/issues/components/reports/IssuesReportPanel.svelte -->
<script>
  import Checkbox        from '$lib/components/common/Checkbox.svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import ReportIssueCard from './ReportIssueCard.svelte';
  import { meetingsStore } from '../../stores/meetingsStore';
  import {
    filterIssues, groupIssuesByStatus, getDefaultFilterDate, getTodayDate
  } from './reportUtils';
  import { downloadResponse } from '$lib/utils/download';
  import { getLogger }        from '$lib/utils/logger';
  import { fmtDate }          from '$lib/utils/dates';

  const logger = getLogger('IssuesReportPanel');

  export let issues = [];

  // ── Status checkboxes ─────────────────────────────────────────────────────
  let includeCurrent   = true;
  let includeParked    = false;
  let includeCompleted = false;

  // ── Date filter ───────────────────────────────────────────────────────────
  let filterDate      = getDefaultFilterDate();

  // ── Meeting filter ────────────────────────────────────────────────────────
  let filterMeetingId = '';

  // ── Content options ───────────────────────────────────────────────────────
  let includeHistoric         = false;
  let includeCompletedActions = false;

  // ── Sort order ────────────────────────────────────────────────────────────
  let sortOrder = 'desc'; // 'desc' = latest first (default), 'asc' = oldest first

  // ── Issue number drill-down ───────────────────────────────────────────────
  let issueNumberInput = '';
  $: issueNumbers = issueNumberInput
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isInteger(n) && n > 0);

  let isGenerating  = false;
  let downloadError = '';

  // ── Derived ───────────────────────────────────────────────────────────────
  // When issue numbers are specified we bypass the meeting filter too —
  // the user just wants to find those specific issues.
  $: sourceIssues = issueNumbers.length > 0
    ? issues
    : (filterMeetingId
        ? issues.filter(issue =>
            issue.meeting_id === filterMeetingId ||
            (issue.activities || []).some(a => a.meeting_id === filterMeetingId) ||
            (issue.actions   || []).some(a => a.meeting_id === filterMeetingId)
          )
        : issues);

  $: filteredIssues = filterIssues(sourceIssues, filterDate, {
    includeHistoric,
    includeCompletedActions,
    issueNumbers
  });

  $: groupedIssues = groupIssuesByStatus(filteredIssues);

  // When issue numbers are specified the status checkboxes are bypassed —
  // show all matching issues regardless of status.
  $: displayedIssues = issueNumbers.length > 0
    ? filteredIssues
    : [
        ...(includeCurrent   ? groupedIssues.current   : []),
        ...(includeParked    ? groupedIssues.parked     : []),
        ...(includeCompleted ? groupedIssues.completed  : [])
      ];

  async function downloadWord() {
    isGenerating  = true;
    downloadError = '';
    try {
      const response = await fetch('/api/reports/generate-docx', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issues: displayedIssues,
          filterDate,
          includeCurrent,
          includeParked,
          includeCompleted
        })
      });
      if (!response.ok) {
        const ct = response.headers.get('content-type');
        if (ct?.includes('application/json')) {
          const { error } = await response.json();
          throw new Error(error || 'Failed to generate document');
        }
        throw new Error(`Server error: ${response.status}`);
      }
      const filename = `Issues_Report_${new Date().toISOString().split('T')[0]}.docx`;
      await downloadResponse(response, filename);
      logger('✅ Downloaded:', filename);
    } catch (err) {
      logger('❌', err.message);
      downloadError = err.message;
    } finally {
      isGenerating = false;
    }
  }
</script>

<div class="flex h-full">

  <!-- ── Filter panel ── -->
  <aside class="w-64 shrink-0 border-r border-slate-700 bg-slate-800/60 p-5 flex flex-col gap-5 overflow-y-auto">

    <!-- Status -->
    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-3">Status</p>
      <div class="flex flex-col gap-2">
        <Checkbox bind:checked={includeCurrent}   color="blue"   label="Current" />
        <Checkbox bind:checked={includeParked}    color="purple" label="Parked" />
        <Checkbox bind:checked={includeCompleted} color="green"  label="Completed" />
      </div>
    </div>

    <!-- Content options -->
    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-3">Content</p>
      <div class="flex flex-col gap-2">
        <Checkbox bind:checked={includeHistoric}         color="blue" label="Include historic" />
        <Checkbox bind:checked={includeCompletedActions} color="blue" label="Include completed actions" />
      </div>
    </div>

    <!-- Date filter -->
    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Created since</p>
      <input
        type="date"
        bind:value={filterDate}
        class="w-full px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm"
      />
      {#if filterDate}
        <button
          type="button"
          class="mt-1.5 text-xs text-slate-400 hover:text-slate-200 underline"
          on:click={() => filterDate = ''}
        >
          Show all dates
        </button>
      {/if}
    </div>

    <!-- Meeting filter -->
    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Meeting</p>
      <select
        bind:value={filterMeetingId}
        class="w-full px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm"
      >
        <option value="">All meetings</option>
        {#each $meetingsStore.list as m (m.id)}
          <option value={m.id}>{m.title} ({fmtDate(m.meeting_date)})</option>
        {/each}
      </select>
    </div>

    <!-- Issue number drill-down -->
    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Issue numbers</p>
      <input
        type="text"
        bind:value={issueNumberInput}
        placeholder="e.g. 1, 3, 5"
        class="w-full px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm placeholder-slate-500"
      />
      {#if issueNumbers.length > 0}
        <p class="mt-1.5 text-[11px] text-amber-300/80 leading-tight">
          Showing only #{issueNumbers.join(', #')} — other filters bypassed
        </p>
      {/if}
    </div>

    <!-- Sort order -->
    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Sort items</p>
      <div class="flex flex-col gap-1.5">
        <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
          <input type="radio" bind:group={sortOrder} value="desc" class="accent-purple-400" />
          Latest first
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
          <input type="radio" bind:group={sortOrder} value="asc" class="accent-purple-400" />
          Oldest first
        </label>
      </div>
    </div>

    <!-- Download -->
    <div class="mt-auto pt-4 border-t border-slate-700">
      <p class="text-xs text-slate-500 mb-3">
        {displayedIssues.length} issue{displayedIssues.length === 1 ? '' : 's'}
      </p>
      <Button
        variant="primary"
        size="medium"
        icon="download"
        disabled={isGenerating || displayedIssues.length === 0}
        on:click={downloadWord}
      >
        {isGenerating ? 'Generating…' : 'Download Word doc'}
      </Button>
      {#if downloadError}
        <p class="text-xs text-red-400 mt-2 break-words">{downloadError}</p>
      {/if}
    </div>
  </aside>

  <!-- ── Live preview ── -->
  <div class="flex-1 overflow-y-auto bg-white text-gray-900">
    <div class="max-w-4xl mx-auto p-8">

      {#if displayedIssues.length === 0}
        <div class="text-center py-16 text-gray-400">
          <p class="text-lg font-medium">No issues match the current filters.</p>
          <p class="text-sm mt-1">Adjust the status or date filters to see results.</p>
        </div>

      {:else}
        <div class="mb-8 pb-5 border-b border-gray-200">
          <h1 class="text-3xl font-bold text-gray-900 mb-1">Issues Report</h1>
          <p class="text-gray-500 text-sm">Generated {getTodayDate()}</p>
          <p class="text-gray-400 text-xs mt-1">
            {#if issueNumbers.length > 0}
              Issue{issueNumbers.length === 1 ? '' : 's'} #{issueNumbers.join(', #')}
            {:else}
              {[
                includeCurrent   && 'Current',
                includeParked    && 'Parked',
                includeCompleted && 'Completed'
              ].filter(Boolean).join(', ')}
              {#if filterDate} · created since {fmtDate(new Date(filterDate).toISOString())}{/if}
              {#if filterMeetingId} · meeting filter active{/if}
            {/if}
            {#if includeHistoric} · incl. historic{/if}
            {#if includeCompletedActions} · incl. completed actions{/if}
            · {displayedIssues.length} {displayedIssues.length === 1 ? 'issue' : 'issues'}
          </p>
        </div>

        {#if issueNumbers.length > 0}
          <!-- Issue number mode: render flat list regardless of status grouping -->
          <div class="space-y-4">
            {#each displayedIssues as issue (issue.id)}
              <ReportIssueCard
                {issue}
                {sortOrder}
                statusType={issue.status === 'completed' ? 'completed' : issue.status === 'parked' ? 'parked' : 'current'}
              />
            {/each}
          </div>

        {:else}
          <div class="space-y-6">
            {#if includeCurrent && groupedIssues.current.length > 0}
              <h2 class="text-xl font-bold text-gray-700 pb-1 border-b-2 border-blue-300">
                Current Issues ({groupedIssues.current.length})
              </h2>
              <div class="space-y-4">
                {#each groupedIssues.current as issue (issue.id)}
                  <ReportIssueCard {issue} {sortOrder} statusType="current" />
                {/each}
              </div>
            {/if}

            {#if includeParked && groupedIssues.parked.length > 0}
              <h2 class="text-xl font-bold text-gray-700 pb-1 border-b-2 border-amber-400">
                Parked Issues ({groupedIssues.parked.length})
              </h2>
              <div class="space-y-4">
                {#each groupedIssues.parked as issue (issue.id)}
                  <ReportIssueCard {issue} {sortOrder} statusType="parked" />
                {/each}
              </div>
            {/if}

            {#if includeCompleted && groupedIssues.completed.length > 0}
              <h2 class="text-xl font-bold text-gray-700 pb-1 border-b-2 border-green-400">
                Completed Issues ({groupedIssues.completed.length})
              </h2>
              <div class="space-y-4">
                {#each groupedIssues.completed as issue (issue.id)}
                  <ReportIssueCard {issue} {sortOrder} statusType="completed" />
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <p class="text-center text-gray-400 text-sm mt-10 pt-6 border-t border-gray-200 italic">
          End of Report
        </p>
      {/if}
    </div>
  </div>
</div>
