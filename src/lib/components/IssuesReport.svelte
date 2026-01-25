<!-- src/lib/components/issues/IssuesReport.svelte -->
<script>
  import { formatDate, isOverdue } from '$lib/utils/dates';
  import { getPriorityLabel } from '$lib/utils/priorities';
  import { ACTION_STATUS, ISSUE_STATUS } from '$lib/utils/constants';
  import Icon from '$lib/components/icons/Icon.svelte';

  export let show = false;
  export let issues = [];

  let includeCurrent = true;
  let includeParked = false;
  let includeCompleted = false;

  // Get filtered issues based on checkboxes
  $: filteredIssues = issues
    .filter(issue => {
      const status = issue.status || 'current'; // Default to current for backward compatibility
      if (status === 'current' && includeCurrent) return true;
      if (status === 'parked' && includeParked) return true;
      if (status === 'completed' && includeCompleted) return true;
      return false;
    })
    .map(issue => {
      const outstandingActions = (issue.actions || []).filter(
        action => action.status !== ACTION_STATUS.COMPLETED
      );
      return {
        ...issue,
        outstandingActions
      };
    })
    .sort((a, b) => {
      // Sort by priority first (lower number = higher priority)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then by original date (older first)
      return new Date(a.original_date) - new Date(b.original_date);
    });

  // Group issues by status for display
  $: groupedIssues = {
    current: filteredIssues.filter(i => (i.status || 'current') === 'current'),
    parked: filteredIssues.filter(i => i.status === 'parked'),
    completed: filteredIssues.filter(i => i.status === 'completed')
  };

  // Calculate total outstanding actions across all filtered issues
  $: totalOutstandingActions = filteredIssues.reduce((sum, issue) => sum + issue.outstandingActions.length, 0);
  
  // Calculate total overdue actions across all filtered issues  
  $: totalOverdueActions = filteredIssues.reduce((sum, issue) => 
    sum + issue.outstandingActions.filter(a => a.date_deadline && isOverdue(a.date_deadline)).length, 0
  );

  function close() {
    show = false;
  }

  function printReport() {
    window.print();
  }

  function getTodayDate() {
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
    <div class="bg-white w-full max-w-5xl h-[90vh] flex flex-col rounded-lg shadow-2xl">
      <!-- Header - Hidden when printing -->
      <div class="flex justify-between items-center p-6 border-b border-gray-300 print:hidden bg-slate-800 text-white rounded-t-lg">
        <div>
          <h2 class="text-2xl font-bold mb-3">Issues Report</h2>
          <!-- Filter Checkboxes -->
          <div class="flex gap-4 text-sm">
            <label class="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                bind:checked={includeCurrent}
                class="w-4 h-4 rounded border-gray-400 text-blue-600 focus:ring-blue-500"
              />
              <span>Current</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                bind:checked={includeParked}
                class="w-4 h-4 rounded border-gray-400 text-amber-600 focus:ring-amber-500"
              />
              <span>Parked</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                bind:checked={includeCompleted}
                class="w-4 h-4 rounded border-gray-400 text-green-600 focus:ring-green-500"
              />
              <span>Completed</span>
            </label>
          </div>
        </div>
        <div class="flex space-x-2">
          <button
            on:click={printReport}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
            </svg>
            Print/Save as PDF
          </button>
          <button
            on:click={close}
            class="p-2 hover:bg-slate-700 rounded"
          >
            <Icon name="close" size={6} />
          </button>
        </div>
      </div>

      <!-- Report Content - Scrollable -->
      <div class="flex-1 overflow-y-auto p-8 bg-white text-gray-900">
        <!-- Print Header -->
        <div class="hidden print:block mb-8">
          <h1 class="text-3xl font-bold text-gray-900 mb-2">Issues Report</h1>
          <p class="text-gray-600">Generated: {getTodayDate()}</p>
          <p class="text-gray-600 text-sm mt-1">
            Showing: 
            {#if includeCurrent}Current{/if}
            {#if includeParked}{includeCurrent ? ', ' : ''}Parked{/if}
            {#if includeCompleted}{(includeCurrent || includeParked) ? ', ' : ''}Completed{/if}
          </p>
          <div class="border-b-2 border-gray-300 mt-4"></div>
        </div>

        {#if filteredIssues.length === 0}
          <div class="text-center py-12">
            <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <p class="text-xl text-gray-600">No issues found!</p>
            <p class="text-gray-500 mt-2">Try selecting different status filters.</p>
          </div>
        {:else}
          <!-- Summary Stats -->
          <div class="grid grid-cols-3 gap-4 mb-8 print:mb-6">
            <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div class="text-2xl font-bold text-blue-700">
                {filteredIssues.length}
              </div>
              <div class="text-sm text-blue-600">Total Issues</div>
            </div>
            <div class="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <div class="text-2xl font-bold text-orange-700">
                {totalOutstandingActions}
              </div>
              <div class="text-sm text-orange-600">Outstanding Actions</div>
            </div>
            <div class="bg-red-50 p-4 rounded-lg border border-red-200">
              <div class="text-2xl font-bold text-red-700">
                {totalOverdueActions}
              </div>
              <div class="text-sm text-red-600">Overdue Actions</div>
            </div>
          </div>

          <!-- Issues List -->
          <div class="space-y-8">
            <!-- Current Issues -->
            {#if includeCurrent && groupedIssues.current.length > 0}
              <div>
                <h2 class="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-500">
                  Current Issues ({groupedIssues.current.length})
                </h2>
                <div class="space-y-4">
                  {#each groupedIssues.current as issue, index}
                    <div class="border border-gray-300 rounded-lg overflow-hidden break-inside-avoid">
                      <div class="bg-gray-100 p-4 border-b border-gray-300">
                        <div class="flex items-start justify-between">
                          <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2">
                              <span class="text-lg font-bold text-gray-900">{index + 1}.</span>
                              <h3 class="text-lg font-bold text-gray-900">{issue.name}</h3>
                              <span class="px-2 py-1 text-xs font-semibold text-white rounded {getPriorityLabel(issue.priority).color}">
                                {getPriorityLabel(issue.priority).label}
                              </span>
                            </div>
                            {#if issue.description}
                              <p class="text-gray-700 text-sm whitespace-pre-wrap mb-2">{issue.description}</p>
                            {/if}
                            <div class="text-xs text-gray-600">
                              Created: {formatDate(issue.original_date)} • 
                              Priority: {issue.priority}
                              {#if issue.outstandingActions.length > 0}
                                • {issue.outstandingActions.length} outstanding {issue.outstandingActions.length === 1 ? 'action' : 'actions'}
                              {/if}
                            </div>
                          </div>
                        </div>
                      </div>
                      {#if issue.outstandingActions.length > 0}
                        <div class="p-4 bg-white">
                          <h4 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                            </svg>
                            Outstanding Actions:
                          </h4>
                          <div class="space-y-2">
                            {#each issue.outstandingActions as action}
                              <div class="flex items-start gap-3 p-3 bg-gray-50 rounded border border-gray-200">
                                <div class="flex-shrink-0 mt-1">
                                  <div class="w-5 h-5 border-2 border-gray-400 rounded"></div>
                                </div>
                                <div class="flex-1 min-w-0">
                                  <p class="text-gray-900 font-medium whitespace-pre-wrap">{action.action_text}</p>
                                  <div class="flex flex-wrap gap-2 mt-2">
                                    {#if action.name_text}
                                      <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded border border-blue-200">
                                        👤 {action.name_text}
                                      </span>
                                    {/if}
                                    {#if action.date_deadline}
                                      <span class="text-xs px-2 py-1 rounded border {
                                        isOverdue(action.date_deadline) 
                                          ? 'bg-red-100 text-red-700 border-red-300 font-semibold' 
                                          : 'bg-orange-100 text-orange-700 border-orange-200'
                                      }">
                                        📅 Due: {formatDate(action.date_deadline)}
                                        {#if isOverdue(action.date_deadline)}⚠️{/if}
                                      </span>
                                    {/if}
                                    <span class="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded border border-purple-200 capitalize">
                                      {action.status}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {:else}
                        <div class="p-4 bg-white">
                          <p class="text-gray-500 text-sm italic">No outstanding actions</p>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Parked Issues -->
            {#if includeParked && groupedIssues.parked.length > 0}
              <div>
                <h2 class="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-amber-500">
                  Parked Issues ({groupedIssues.parked.length})
                </h2>
                <div class="space-y-4">
                  {#each groupedIssues.parked as issue, index}
                    <div class="border border-gray-300 rounded-lg overflow-hidden break-inside-avoid">
                      <div class="bg-amber-50 p-4 border-b border-amber-200">
                        <div class="flex items-start justify-between">
                          <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2">
                              <span class="text-lg font-bold text-gray-900">{index + 1}.</span>
                              <h3 class="text-lg font-bold text-gray-900">{issue.name}</h3>
                              <span class="px-2 py-1 text-xs font-semibold text-white rounded {getPriorityLabel(issue.priority).color}">
                                {getPriorityLabel(issue.priority).label}
                              </span>
                              <span class="px-2 py-1 text-xs font-semibold bg-amber-600 text-white rounded">
                                🅿️ Parked
                              </span>
                            </div>
                            {#if issue.description}
                              <p class="text-gray-700 text-sm whitespace-pre-wrap mb-2">{issue.description}</p>
                            {/if}
                            <div class="text-xs text-gray-600">
                              Created: {formatDate(issue.original_date)} • 
                              Priority: {issue.priority}
                              {#if issue.outstandingActions.length > 0}
                                • {issue.outstandingActions.length} outstanding {issue.outstandingActions.length === 1 ? 'action' : 'actions'}
                              {/if}
                            </div>
                          </div>
                        </div>
                      </div>
                      {#if issue.outstandingActions.length > 0}
                        <div class="p-4 bg-white">
                          <h4 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                            </svg>
                            Outstanding Actions:
                          </h4>
                          <div class="space-y-2">
                            {#each issue.outstandingActions as action}
                              <div class="flex items-start gap-3 p-3 bg-gray-50 rounded border border-gray-200">
                                <div class="flex-shrink-0 mt-1">
                                  <div class="w-5 h-5 border-2 border-gray-400 rounded"></div>
                                </div>
                                <div class="flex-1 min-w-0">
                                  <p class="text-gray-900 font-medium whitespace-pre-wrap">{action.action_text}</p>
                                  <div class="flex flex-wrap gap-2 mt-2">
                                    {#if action.name_text}
                                      <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded border border-blue-200">
                                        👤 {action.name_text}
                                      </span>
                                    {/if}
                                    {#if action.date_deadline}
                                      <span class="text-xs px-2 py-1 rounded border {
                                        isOverdue(action.date_deadline) 
                                          ? 'bg-red-100 text-red-700 border-red-300 font-semibold' 
                                          : 'bg-orange-100 text-orange-700 border-orange-200'
                                      }">
                                        📅 Due: {formatDate(action.date_deadline)}
                                        {#if isOverdue(action.date_deadline)}⚠️{/if}
                                      </span>
                                    {/if}
                                    <span class="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded border border-purple-200 capitalize">
                                      {action.status}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {:else}
                        <div class="p-4 bg-white">
                          <p class="text-gray-500 text-sm italic">No outstanding actions</p>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Completed Issues -->
            {#if includeCompleted && groupedIssues.completed.length > 0}
              <div>
                <h2 class="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-green-500">
                  Completed Issues ({groupedIssues.completed.length})
                </h2>
                <div class="space-y-4">
                  {#each groupedIssues.completed as issue, index}
                    <div class="border border-gray-300 rounded-lg overflow-hidden break-inside-avoid opacity-75">
                      <div class="bg-green-50 p-4 border-b border-green-200">
                        <div class="flex items-start justify-between">
                          <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2">
                              <span class="text-lg font-bold text-gray-900">{index + 1}.</span>
                              <h3 class="text-lg font-bold text-gray-900">{issue.name}</h3>
                              <span class="px-2 py-1 text-xs font-semibold text-white rounded {getPriorityLabel(issue.priority).color}">
                                {getPriorityLabel(issue.priority).label}
                              </span>
                              <span class="px-2 py-1 text-xs font-semibold bg-green-600 text-white rounded">
                                ✓ Completed
                              </span>
                            </div>
                            {#if issue.description}
                              <p class="text-gray-700 text-sm whitespace-pre-wrap mb-2">{issue.description}</p>
                            {/if}
                            <div class="text-xs text-gray-600">
                              Created: {formatDate(issue.original_date)} • 
                              Priority: {issue.priority}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div class="p-4 bg-white">
                        <p class="text-gray-500 text-sm italic">Issue completed</p>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>

          <!-- Footer -->
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
    
    body {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
</style>
