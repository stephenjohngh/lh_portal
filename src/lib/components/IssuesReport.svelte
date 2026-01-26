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
  
  // Constants
  const ONE_MONTH_IN_MS = 30 * 24 * 60 * 60 * 1000;
  const STATUS_COLORS = {
    current: { header: 'bg-gray-100', border: 'border-gray-300', sectionBorder: 'border-gray-300', barColor: 'border-blue-500' },
    parked: { header: 'bg-amber-50', border: 'border-amber-200', sectionBorder: 'border-amber-200', barColor: 'border-amber-500' },
    completed: { header: 'bg-green-50', border: 'border-green-200', sectionBorder: 'border-green-200', barColor: 'border-green-500' }
  };
  
  // Set default date to one month ago
  const getDefaultDate = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  };
  
  let filterDate = getDefaultDate();

  // Helper functions
  const hasBeenUpdatedSince = (timestamp, filterDateTime) => {
    return timestamp && new Date(timestamp).getTime() >= filterDateTime;
  };

  const hasRecentChanges = (issue, filterDateTime) => {
    if (!filterDate) return true;
    
    const issueUpdated = hasBeenUpdatedSince(issue.updated_at, filterDateTime);
    const hasRecentComments = (issue.comments || []).some(c => 
      hasBeenUpdatedSince(c.updated_at, filterDateTime)
    );
    const hasRecentActions = (issue.actions || []).some(a => 
      hasBeenUpdatedSince(a.updated_at, filterDateTime)
    );
    
    return issueUpdated || hasRecentComments || hasRecentActions;
  };

  const shouldIncludeIssue = (issue) => {
    // Only filter by date here, NOT by checkbox state
    // Checkbox filtering happens in the template
    const filterDateTime = filterDate ? new Date(filterDate).getTime() : null;
    return !filterDateTime || hasRecentChanges(issue, filterDateTime);
  };

  const formatTimestamp = (createdAt, updatedAt) => {
    const created = formatDate(createdAt);
    const hasModification = updatedAt && 
      new Date(updatedAt).getTime() !== new Date(createdAt).getTime();
    const modified = hasModification ? ` • Modified: ${formatDate(updatedAt)}` : '';
    return created + modified;
  };

  // Computed values
  $: filteredIssues = issues
    .filter(shouldIncludeIssue)
    .map(issue => ({
      ...issue,
      outstandingActions: (issue.actions || []).filter(
        action => action.status !== ACTION_STATUS.COMPLETED
      )
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return new Date(a.created_at) - new Date(b.created_at);
    });

  $: groupedIssues = {
    current: filteredIssues.filter(i => (i.status || 'current') === 'current'),
    parked: filteredIssues.filter(i => i.status === 'parked'),
    completed: filteredIssues.filter(i => i.status === 'completed')
  };

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

  function getFilterSummary() {
    const statuses = [
      includeCurrent && 'Current',
      includeParked && 'Parked',
      includeCompleted && 'Completed'
    ].filter(Boolean).join(', ');
    
    const dateInfo = filterDate
      ? `Changes since ${new Date(filterDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`
      : 'All changes';
    
    return `Showing: ${statuses} • ${dateInfo}`;
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
    <div class="bg-white w-full max-w-5xl h-[90vh] flex flex-col rounded-lg shadow-2xl">
      <!-- Header - Hidden when printing -->
      <div class="flex justify-between items-center p-6 border-b border-gray-300 print:hidden bg-slate-800 text-white rounded-t-lg">
        <div>
          <h2 class="text-2xl font-bold mb-3">Issues Report</h2>
          <div class="flex flex-col gap-3">
            <div class="flex gap-4 text-sm">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" bind:checked={includeCurrent} class="w-4 h-4 rounded border-gray-400 text-blue-600 focus:ring-blue-500"/>
                <span>Current</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" bind:checked={includeParked} class="w-4 h-4 rounded border-gray-400 text-amber-600 focus:ring-amber-500"/>
                <span>Parked</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" bind:checked={includeCompleted} class="w-4 h-4 rounded border-gray-400 text-green-600 focus:ring-green-500"/>
                <span>Completed</span>
              </label>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <label for="filter-date" class="whitespace-nowrap">Changes since:</label>
              <input id="filter-date" type="date" bind:value={filterDate} class="px-3 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"/>
              <button on:click={() => filterDate = ''} class="px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs" title="Clear date filter">Clear</button>
            </div>
          </div>
        </div>
        <div class="flex space-x-2">
          <button on:click={printReport} class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2" title="In the print dialog, select 'Save as PDF' as the destination">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
            </svg>
            Save as PDF
          </button>
          <button on:click={close} class="p-2 hover:bg-slate-700 rounded">
            <Icon name="close" size={6} />
          </button>
        </div>
      </div>

      <!-- Report Content -->
      <div class="flex-1 overflow-y-auto p-8 bg-white text-gray-900">
        <!-- Print Header -->
        <div class="hidden print:block mb-8">
          <h1 class="text-3xl font-bold text-gray-900 mb-2">Issues Report</h1>
          <p class="text-gray-600">Generated: {getTodayDate()}</p>
          <p class="text-gray-600 text-sm mt-1">{getFilterSummary()}</p>
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
          <div class="space-y-8">
            <!-- Current Issues -->
            {#if includeCurrent && groupedIssues.current.length > 0}
              <div>
                <h2 class="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 {STATUS_COLORS.current.barColor}">
                  Current Issues ({groupedIssues.current.length})
                </h2>
                <div class="space-y-4">
                  {#each groupedIssues.current as issue, index}
                      <div class="border border-gray-300 rounded-lg overflow-hidden break-inside-avoid">
                        <!-- Issue Header -->
                        <div class="{STATUS_COLORS.current.header} p-4 border-b {STATUS_COLORS.current.border}">
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
                                Created: {formatTimestamp(issue.created_at, issue.updated_at)}
                                • Priority: {issue.priority}
                                {#if issue.outstandingActions.length > 0}
                                  • {issue.outstandingActions.length} outstanding {issue.outstandingActions.length === 1 ? 'action' : 'actions'}
                                {/if}
                              </div>
                            </div>
                          </div>
                        </div>

                        <!-- Comments Section -->
                          {#if issue.comments && issue.comments.length > 0}
                            <div class="p-4 bg-white border-t {STATUS_COLORS.current.sectionBorder}">
                              <h4 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                                </svg>
                                Comments ({issue.comments.length}):
                              </h4>
                              <div class="space-y-2">
                                {#each issue.comments as comment}
                                  <div class="p-3 bg-gray-50 rounded border border-gray-200">
                                    <p class="text-gray-900 text-sm whitespace-pre-wrap">{comment.comment_text}</p>
                                    <p class="text-xs text-gray-500 mt-1">
                                      Added: {formatTimestamp(comment.created_at, comment.updated_at)}
                                    </p>
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {/if}

                          <!-- Outstanding Actions Section -->
                          {#if issue.outstandingActions.length > 0}
                            <div class="p-4 bg-white border-t {STATUS_COLORS.current.sectionBorder}">
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
                                          <span class="text-xs px-2 py-1 rounded border {isOverdue(action.date_deadline) ? 'bg-red-100 text-red-700 border-red-300 font-semibold' : 'bg-orange-100 text-orange-700 border-orange-200'}">
                                            📅 Due: {formatDate(action.date_deadline)}
                                            {#if isOverdue(action.date_deadline)}⚠️{/if}
                                          </span>
                                        {/if}
                                        <span class="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded border border-purple-200 capitalize">
                                          {action.status}
                                        </span>
                                      </div>
                                      <p class="text-xs text-gray-500 mt-2">
                                        Added: {formatTimestamp(action.created_at, action.updated_at)}
                                      </p>
                                    </div>
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {:else}
                            <div class="p-4 bg-white border-t {STATUS_COLORS.current.sectionBorder}">
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
                    <h2 class="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 {STATUS_COLORS.parked.barColor}">
                      Parked Issues ({groupedIssues.parked.length})
                    </h2>
                    <div class="space-y-4">
                      {#each groupedIssues.parked as issue, index}
                        <div class="border border-gray-300 rounded-lg overflow-hidden break-inside-avoid">
                          <!-- Issue Header -->
                          <div class="{STATUS_COLORS.parked.header} p-4 border-b {STATUS_COLORS.parked.border}">
                            <div class="flex items-start justify-between">
                              <div class="flex-1">
                                <div class="flex items-center gap-2 mb-2">
                                  <span class="text-lg font-bold text-gray-900">{index + 1}.</span>
                                  <h3 class="text-lg font-bold text-gray-900">{issue.name}</h3>
                                  <span class="px-2 py-1 text-xs font-semibold text-white rounded {getPriorityLabel(issue.priority).color}">
                                    {getPriorityLabel(issue.priority).label}
                                  </span>
                                  <span class="px-2 py-1 text-xs font-semibold bg-amber-600 text-white rounded">🅿️ Parked</span>
                                </div>
                                {#if issue.description}
                                  <p class="text-gray-700 text-sm whitespace-pre-wrap mb-2">{issue.description}</p>
                                {/if}
                                <div class="text-xs text-gray-600">
                                  Created: {formatTimestamp(issue.created_at, issue.updated_at)}
                                  • Priority: {issue.priority}
                                  {#if issue.outstandingActions.length > 0}
                                    • {issue.outstandingActions.length} outstanding {issue.outstandingActions.length === 1 ? 'action' : 'actions'}
                                  {/if}
                                </div>
                              </div>
                            </div>
                          </div>

                          <!-- Comments Section -->
                          {#if issue.comments && issue.comments.length > 0}
                            <div class="p-4 bg-white border-t {STATUS_COLORS.parked.sectionBorder}">
                              <h4 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                                </svg>
                                Comments ({issue.comments.length}):
                              </h4>
                              <div class="space-y-2">
                                {#each issue.comments as comment}
                                  <div class="p-3 bg-gray-50 rounded border border-gray-200">
                                    <p class="text-gray-900 text-sm whitespace-pre-wrap">{comment.comment_text}</p>
                                    <p class="text-xs text-gray-500 mt-1">
                                      Added: {formatTimestamp(comment.created_at, comment.updated_at)}
                                    </p>
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {/if}

                          <!-- Outstanding Actions Section -->
                          {#if issue.outstandingActions.length > 0}
                            <div class="p-4 bg-white border-t {STATUS_COLORS.parked.sectionBorder}">
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
                                          <span class="text-xs px-2 py-1 rounded border {isOverdue(action.date_deadline) ? 'bg-red-100 text-red-700 border-red-300 font-semibold' : 'bg-orange-100 text-orange-700 border-orange-200'}">
                                            📅 Due: {formatDate(action.date_deadline)}
                                            {#if isOverdue(action.date_deadline)}⚠️{/if}
                                          </span>
                                        {/if}
                                        <span class="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded border border-purple-200 capitalize">
                                          {action.status}
                                        </span>
                                      </div>
                                      <p class="text-xs text-gray-500 mt-2">
                                        Added: {formatTimestamp(action.created_at, action.updated_at)}
                                      </p>
                                    </div>
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {:else}
                            <div class="p-4 bg-white border-t {STATUS_COLORS.parked.sectionBorder}">
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
                    <h2 class="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 {STATUS_COLORS.completed.barColor}">
                      Completed Issues ({groupedIssues.completed.length})
                    </h2>
                    <div class="space-y-4">
                      {#each groupedIssues.completed as issue, index}
                        <div class="border border-gray-300 rounded-lg overflow-hidden break-inside-avoid opacity-75">
                          <!-- Issue Header -->
                          <div class="{STATUS_COLORS.completed.header} p-4 border-b {STATUS_COLORS.completed.border}">
                            <div class="flex items-start justify-between">
                              <div class="flex-1">
                                <div class="flex items-center gap-2 mb-2">
                                  <span class="text-lg font-bold text-gray-900">{index + 1}.</span>
                                  <h3 class="text-lg font-bold text-gray-900">{issue.name}</h3>
                                  <span class="px-2 py-1 text-xs font-semibold text-white rounded {getPriorityLabel(issue.priority).color}">
                                    {getPriorityLabel(issue.priority).label}
                                  </span>
                                  <span class="px-2 py-1 text-xs font-semibold bg-green-600 text-white rounded">✓ Completed</span>
                                </div>
                                {#if issue.description}
                                  <p class="text-gray-700 text-sm whitespace-pre-wrap mb-2">{issue.description}</p>
                                {/if}
                                <div class="text-xs text-gray-600">
                                  Created: {formatTimestamp(issue.created_at, issue.updated_at)}
                                  • Priority: {issue.priority}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div class="p-4 bg-white border-t {STATUS_COLORS.completed.sectionBorder}">
                            <p class="text-gray-500 text-sm italic">Issue completed</p>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>

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
