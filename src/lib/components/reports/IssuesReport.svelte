<!-- src/lib/components/reports/IssuesReport.svelte -->
<script>
  import ReportFilters from './ReportFilters.svelte';
  import ReportIssueCard from './ReportIssueCard.svelte';
  import { 
    filterIssues, 
    groupIssuesByStatus, 
    getDefaultFilterDate,
    getTodayDate 
  } from './reportUtils';

  export let show = false;
  export let issues = [];

  // Filter state
  let includeCurrent = true;
  let includeParked = false;
  let includeCompleted = false;
  let filterDate = getDefaultFilterDate();

  // Process and group issues
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
      console.log('Generating Word document...');
      
      const response = await fetch('/api/reports/generate-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          issues: filteredIssues,
          filterDate,
          includeCurrent,
          includeParked,
          includeCompleted
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate Word document');
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Issues_Report_${new Date().toISOString().split('T')[0]}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Word document downloaded successfully');
    } catch (err) {
      console.error('Error downloading Word document:', err);
      alert('Failed to generate Word document. Please try again.');
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
              • Total: {filteredIssues.length} {filteredIssues.length === 1 ? 'issue' : 'issues'}
            </div>
          </div>

          <!-- Issues List (no section headers) -->
          <div class="space-y-4">
            {#if includeCurrent}
              {#each groupedIssues.current as issue, index}
                <ReportIssueCard 
                  {issue}
                  index={index + 1}
                  statusType="current"
                />
              {/each}
            {/if}

            {#if includeParked}
              {#each groupedIssues.parked as issue, index}
                <ReportIssueCard 
                  {issue}
                  index={includeCurrent ? groupedIssues.current.length + index + 1 : index + 1}
                  statusType="parked"
                />
              {/each}
            {/if}

            {#if includeCompleted}
              {#each groupedIssues.completed as issue, index}
                <ReportIssueCard 
                  {issue}
                  index={(includeCurrent ? groupedIssues.current.length : 0) + (includeParked ? groupedIssues.parked.length : 0) + index + 1}
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
    /* Page setup */
    @page {
      margin: 1cm;
      size: A4;
    }
    
    /* Remove modal overlay background */
    .fixed.inset-0 {
      position: static !important;
      background: white !important;
      display: block !important;
    }
    
    /* Make content flow normally */
    .overflow-y-auto {
      overflow: visible !important;
      height: auto !important;
    }
    
    /* Prevent issue cards from splitting */
    :global(.border.border-gray-300.rounded-lg) {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    
    /* Print colors */
    * {
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }
  }
</style>
