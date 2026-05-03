<!-- src/lib/apps/issues/components/reports/IssuesReportPanel.svelte -->
<script>
  import Checkbox      from '$lib/components/common/Checkbox.svelte';
  import Button        from '$lib/components/common/Button.svelte';
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

  let includeCurrent   = true;
  let includeParked    = false;
  let includeCompleted = false;
  let filterDate       = getDefaultFilterDate();
  let filterMeetingId  = '';

  let isGenerating  = false;
  let downloadError = '';

  $: filteredByMeeting = filterMeetingId
    ? issues.filter(issue =>
        issue.meeting_id === filterMeetingId ||
        (issue.comments || []).some(c => c.meeting_id === filterMeetingId) ||
        (issue.actions  || []).some(a => a.meeting_id === filterMeetingId)
      )
    : issues;

  $: filteredIssues = filterIssues(filteredByMeeting, filterDate);
  $: groupedIssues  = groupIssuesByStatus(filteredIssues);

  $: displayedIssues = [
    ...(includeCurrent   ? groupedIssues.current   : []),
    ...(includeParked    ? groupedIssues.parked     : []),
    ...(includeCompleted ? groupedIssues.completed  : []),
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

    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-3">Status</p>
      <div class="flex flex-col gap-2">
        <Checkbox bind:checked={includeCurrent}   color="blue"   label="Current" />
        <Checkbox bind:checked={includeParked}    color="purple" label="Parked" />
        <Checkbox bind:checked={includeCompleted} color="green"  label="Completed" />
      </div>
    </div>

    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Activity since</p>
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
            {[
              includeCurrent   && 'Current',
              includeParked    && 'Parked',
              includeCompleted && 'Completed'
            ].filter(Boolean).join(', ')}
            {#if filterDate} · changes since {fmtDate(new Date(filterDate).toISOString())}{/if}
            {#if filterMeetingId} · meeting filter active{/if}
            · {displayedIssues.length} {displayedIssues.length === 1 ? 'issue' : 'issues'}
          </p>
        </div>

        <div class="space-y-6">
          {#if includeCurrent && groupedIssues.current.length > 0}
            <h2 class="text-xl font-bold text-gray-700 pb-1 border-b-2 border-blue-300">
              Current Issues ({groupedIssues.current.length})
            </h2>
            <div class="space-y-4">
              {#each groupedIssues.current as issue (issue.id)}
                <ReportIssueCard {issue} statusType="current" />
              {/each}
            </div>
          {/if}

          {#if includeParked && groupedIssues.parked.length > 0}
            <h2 class="text-xl font-bold text-gray-700 pb-1 border-b-2 border-amber-400">
              Parked Issues ({groupedIssues.parked.length})
            </h2>
            <div class="space-y-4">
              {#each groupedIssues.parked as issue (issue.id)}
                <ReportIssueCard {issue} statusType="parked" />
              {/each}
            </div>
          {/if}

          {#if includeCompleted && groupedIssues.completed.length > 0}
            <h2 class="text-xl font-bold text-gray-700 pb-1 border-b-2 border-green-400">
              Completed Issues ({groupedIssues.completed.length})
            </h2>
            <div class="space-y-4">
              {#each groupedIssues.completed as issue (issue.id)}
                <ReportIssueCard {issue} statusType="completed" />
              {/each}
            </div>
          {/if}
        </div>

        <p class="text-center text-gray-400 text-sm mt-10 pt-6 border-t border-gray-200 italic">
          End of Report
        </p>
      {/if}
    </div>
  </div>
</div>
