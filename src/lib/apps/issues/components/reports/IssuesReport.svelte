<!-- src/lib/apps/issues/components/reports/IssuesReport.svelte -->
<!-- CLEANED: All console.log replaced with logger -->
<script>
  import ReportFilters from './ReportFilters.svelte';
  import ReportIssueCard from './ReportIssueCard.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import {
    filterIssues,
    groupIssuesByStatus,
    getDefaultFilterDate,
    getTodayDate
  } from './reportUtils';
  import { downloadResponse } from '$lib/utils/download';
  import { getLogger } from '$lib/utils/logger';

  const logger = getLogger('IssuesReport');

  export let show = false;
  export let issues = [];

  let includeCurrent = true;
  let includeParked = false;
  let includeCompleted = false;
  let filterDate = getDefaultFilterDate();
  let downloadError = '';

  $: filteredIssues = filterIssues(issues, filterDate);
  $: groupedIssues = groupIssuesByStatus(filteredIssues);

  function close() {
    show = false;
  }

  function printReport() {
    window.print();
  }

  async function downloadWord() {
    try {
      const response = await fetch('/api/reports/generate-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issues: filteredIssues,
          filterDate,
          includeCurrent,
          includeParked,
          includeCompleted
        })
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const { error } = await response.json();
          throw new Error(error || 'Failed to generate Word document');
        }
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const filename = `Issues_Report_${new Date().toISOString().split('T')[0]}.docx`;
      await downloadResponse(response, filename);
      logger('✅ Issues report downloaded:', filename);
    } catch (err) {
      logger('❌ Error downloading Word document:', err.message);
      downloadError = `Failed to generate Word document: ${err.message}.`;
    }
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
    <div class="bg-white w-full max-w-5xl h-[90vh] flex flex-col rounded-lg shadow-2xl">
      
      <!-- Filters Header -->
      <ReportFilters 
        bind:includeCurrent
        bind:includeParked
        bind:includeCompleted
        bind:filterDate
        onPrint={printReport}
        onDownloadWord={downloadWord}
        onClose={close}
      />

      {#if downloadError}
        <div class="px-8 pt-4">
          <ErrorDisplay message={downloadError} onDismiss={() => downloadError = ''} />
        </div>
      {/if}

      <!-- Report Content -->
      <div class="flex-1 overflow-y-auto p-8 bg-white text-gray-900">
        {#if filteredIssues.length === 0}
          <!-- Empty State -->
          <div class="text-center py-12">
            <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <p class="text-xl text-gray-600">No issues found!</p>
            <p class="text-gray-500 mt-2">Try selecting different status filters.</p>
          </div>
        {:else}
          <!-- Single Report Header -->
          <div class="mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-2">Issues Report</h1>
            <p class="text-gray-600 text-sm">Generated {getTodayDate()}</p>
            <div class="mt-2 text-sm text-gray-500">
              Showing: 
              {#if includeCurrent}Current{/if}
              {#if includeParked}{includeCurrent ? ', ' : ''}Parked{/if}
              {#if includeCompleted}{(includeCurrent || includeParked) ? ', ' : ''}Completed{/if}
              • Total: {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
            </div>
          </div>

          <!-- Issues List -->
          <div class="space-y-4">
            {#if includeCurrent}
              {#each groupedIssues.current as issue}
                <ReportIssueCard 
                  {issue}
                  statusType="current"
                />
              {/each}
            {/if}

            {#if includeParked}
              {#each groupedIssues.parked as issue}
                <ReportIssueCard 
                  {issue}
                  statusType="parked"
                />
              {/each}
            {/if}

            {#if includeCompleted}
              {#each groupedIssues.completed as issue}
                <ReportIssueCard 
                  {issue}
                  statusType="completed"
                />
              {/each}
            {/if}
          </div>

          <!-- Report Footer -->
          <div class="mt-8 pt-4 border-t border-gray-300 text-center text-sm text-gray-500">
            <p>End of Report</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  @media print {
    @page {
      margin: 1cm;
      size: A4;
    }
    
    .fixed.inset-0 {
      position: static !important;
      background: white !important;
      display: block !important;
    }
    
    .overflow-y-auto {
      overflow: visible !important;
      height: auto !important;
    }
    
    :global(.border.border-gray-300.rounded-lg) {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    
    * {
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }
  }
</style>
