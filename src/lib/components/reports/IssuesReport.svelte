<!-- src/lib/components/reports/IssuesReport.svelte -->
<script>
  import ReportFilters from './ReportFilters.svelte';
  import ReportIssueSection from './ReportIssueSection.svelte';
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
          <!-- Issues Sections -->
          <div class="space-y-8">
            {#if includeCurrent}
              <ReportIssueSection 
                issues={groupedIssues.current}
                title="Current Issues"
                statusType="current"
              />
            {/if}

            {#if includeParked}
              <ReportIssueSection 
                issues={groupedIssues.parked}
                title="Parked Issues"
                statusType="parked"
              />
            {/if}

            {#if includeCompleted}
              <ReportIssueSection 
                issues={groupedIssues.completed}
                title="Completed Issues"
                statusType="completed"
              />
            {/if}
          </div>

          <!-- Report Footer -->
          <div class="mt-8 pt-4 border-t border-gray-300 text-center text-sm text-gray-500">
            <p>End of Report • Generated {getTodayDate()}</p>
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
    }
    
    :global(body) {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
</style>
