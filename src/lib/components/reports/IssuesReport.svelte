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
    @page {
      margin: 1cm;
      size: A4;
    }
    
    /* Hide the modal overlay and make content flow normally */
    :global(.fixed.inset-0.bg-black\/80) {
      position: static !important;
      background: white !important;
      display: block !important;
      padding: 0 !important;
    }
    
    /* Make the modal content fill the page */
    :global(.bg-white.w-full.max-w-5xl) {
      max-width: 100% !important;
      width: 100% !important;
      height: auto !important;
      max-height: none !important;
      display: block !important;
      flex-direction: column !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    
    /* Hide the filters/controls bar */
    :global(.flex.justify-between.items-center.p-4.bg-gray-100) {
      display: none !important;
    }
    
    /* Make content scrollable area fill page */
    :global(.flex-1.overflow-y-auto) {
      overflow: visible !important;
      height: auto !important;
      flex: none !important;
    }
    
    /* Ensure body uses print colors */
    :global(body) {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
      background: white !important;
    }
    
    /* Prevent page breaks inside issue cards */
    :global(.border.border-gray-300.rounded-lg) {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    
    /* Allow page breaks between issues but not inside */
    :global(.space-y-4 > *) {
      page-break-inside: avoid;
      break-inside: avoid;
      margin-bottom: 1rem;
    }
    
    /* Keep header at top of first page only */
    :global(.mb-8) {
      page-break-after: avoid;
      break-after: avoid;
    }
    
    /* Prevent orphan headers */
    h1, h2, h3, h4 {
      page-break-after: avoid;
      break-after: avoid;
    }
  }
</style>
