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
    console.log('\n========================================');
    console.log('📥 DOWNLOAD WORD CLICKED');
    console.log('Time:', new Date().toISOString());
    console.log('========================================');
    
    try {
      console.log('📊 Preparing data...');
      console.log('   Filtered issues:', filteredIssues.length);
      console.log('   Filter date:', filterDate);
      console.log('   Include current:', includeCurrent);
      console.log('   Include parked:', includeParked);
      console.log('   Include completed:', includeCompleted);
      
      // Log first issue details
      if (filteredIssues.length > 0) {
        console.log('   First issue:', {
          name: filteredIssues[0].name?.substring(0, 50),
          status: filteredIssues[0].status,
          commentsCount: filteredIssues[0].comments?.length || 0,
          actionsCount: filteredIssues[0].outstandingActions?.length || 0
        });
      }
      
      console.log('🌐 Sending request to /api/reports/generate-docx...');
      
      const requestBody = {
        issues: filteredIssues,
        filterDate,
        includeCurrent,
        includeParked,
        includeCompleted
      };
      
      console.log('📤 Request body size:', JSON.stringify(requestBody).length, 'characters');
      
      const response = await fetch('/api/reports/generate-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📨 Response received');
      console.log('   Status:', response.status);
      console.log('   Status text:', response.statusText);
      console.log('   OK:', response.ok);
      console.log('   Headers:');
      response.headers.forEach((value, key) => {
        console.log(`      ${key}: ${value}`);
      });

      if (!response.ok) {
        console.error('❌ Response not OK');
        
        // Try to get error details
        const contentType = response.headers.get('content-type');
        console.log('   Content-Type:', contentType);
        
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          console.error('   Error data:', errorData);
          throw new Error(errorData.error || 'Failed to generate Word document');
        } else {
          const errorText = await response.text();
          console.error('   Error text:', errorText);
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
      }

      console.log('📦 Converting response to blob...');
      const blob = await response.blob();
      console.log('✅ Blob created');
      console.log('   Blob size:', blob.size, 'bytes');
      console.log('   Blob size (KB):', (blob.size / 1024).toFixed(2), 'KB');
      console.log('   Blob type:', blob.type);

      if (blob.size === 0) {
        console.error('❌ Blob is empty!');
        throw new Error('Generated document is empty');
      }

      console.log('🔗 Creating download URL...');
      const url = window.URL.createObjectURL(blob);
      console.log('   URL created:', url.substring(0, 50) + '...');
      
      const filename = `Issues_Report_${new Date().toISOString().split('T')[0]}.docx`;
      console.log('   Filename:', filename);
      
      console.log('📎 Creating download link...');
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      
      console.log('🖱️ Triggering download...');
      a.click();
      
      console.log('🧹 Cleaning up...');
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('✅ Download triggered successfully!');
      console.log('   Check your Downloads folder for:', filename);
      console.log('========================================\n');
      
    } catch (err) {
      console.error('\n========================================');
      console.error('❌ ERROR DOWNLOADING WORD DOCUMENT');
      console.error('========================================');
      console.error('Error type:', err.constructor.name);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      console.error('========================================\n');
      
      alert(`Failed to generate Word document:\n\n${err.message}\n\nCheck browser console (F12) for details.`);
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
