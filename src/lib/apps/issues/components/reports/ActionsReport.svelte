<!-- src/lib/apps/issues/components/reports/ActionsReport.svelte -->
<!-- UPDATED: New action sorting logic -->
<script>
  import { onMount } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import { supabase } from '$lib/supabaseClient';
  import { formatDate, isOverdue } from '$lib/utils/dates';
  import { getLogger } from '$lib/utils/logger';
  import { sortActions } from '$lib/utils/actionSort';

  const logger = getLogger('ActionsReport');

  export let show = false;
  export let issues = [];

  let profiles = [];
  let selectedUser = 'all';
  let isGenerating = false;
  let downloadError = '';

  onMount(async () => {
    await loadProfiles();
  });

  async function loadProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name')
      .order('full_name');
    
    if (error) {
      logger('❌ Error loading profiles:', error.message);
      profiles = [];
    } else {
      profiles = data || [];
    }
  }

  $: allActions = issues.flatMap(issue => 
    (issue.actions || [])
      .filter(action => 
        action.status === 'in-progress' || action.status === 'pending'
      )
      .map(action => ({
        ...action,
        issue_name: issue.name,
        issue_priority: issue.priority,
        issue_status: issue.status
      }))
  );

  $: filteredActions = selectedUser === 'all' 
    ? allActions 
    : selectedUser === 'unallocated'
    ? allActions.filter(action => !action.name_text || action.name_text.trim() === '')
    : allActions.filter(action => action.name_text === selectedUser);

  // NEW SORTING: Status → Deadline → Created
  $: sortedActions = sortActions(filteredActions);

  function close() {
    show = false;
  }

  async function downloadWord() {
    logger('Download Actions Report clicked');
    
    isGenerating = true;
    
    try {
      logger('Preparing data');
      logger('Selected user:', selectedUser);
      logger('Sorted actions count:', sortedActions.length);
      
      const requestBody = {
        actions: sortedActions,
        selectedUser,
        userName: selectedUser === 'all' ? 'All Users' : selectedUser === 'unallocated' ? 'Unallocated' : selectedUser
      };
      
      logger('Request body size:', JSON.stringify(requestBody).length, 'characters');
      
      logger('Sending request');
      const response = await fetch('/api/reports/generate-actions-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      logger('Response received:', response.status, response.statusText);

      if (!response.ok) {
        logger('❌ Response not OK');
        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          logger('Error data:', errorData);
          throw new Error(errorData.error || 'Failed to generate report');
        } else {
          const errorText = await response.text();
          logger('Error text:', errorText);
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
      }

      logger('Creating blob');
      const blob = await response.blob();
      logger('Blob created, size:', blob.size, 'bytes (', (blob.size / 1024).toFixed(2), 'KB)');

      if (blob.size === 0) {
        logger('❌ Generated document is empty');
        throw new Error('Generated document is empty');
      }

      logger('Creating download URL');
      const url = window.URL.createObjectURL(blob);
      
      const fileName = selectedUser === 'all' 
        ? `Actions_Report_All_Users_${new Date().toISOString().split('T')[0]}.docx`
        : selectedUser === 'unallocated'
        ? `Actions_Report_Unallocated_${new Date().toISOString().split('T')[0]}.docx`
        : `Actions_Report_${selectedUser.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.docx`;
      
      logger('Filename:', fileName);
      
      logger('Triggering download');
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      logger('Cleaning up');
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      logger('✅ Download complete');
      
    } catch (err) {
      logger('❌ Error downloading report:', err.message);
      downloadError = `Failed to generate report: ${err.message}. Check browser console (F12) for details.`;
    } finally {
      isGenerating = false;
    }
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
      
      <!-- Header -->
      <div class="bg-slate-800 text-white p-4 rounded-t-lg border-b border-slate-700">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">Actions Report</h2>
          <Button
            variant="secondary"
            size="medium"
            icon="close"
            iconPosition="only"
            on:click={close}
            title="Close report"
          />
        </div>

        <!-- User Filter -->
        <div class="flex items-center gap-4">
          <label for="user-filter" class="text-sm font-medium">Filter by User:</label>
          <select
            id="user-filter"
            bind:value={selectedUser}
            class="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          >
            <option value="all">All Users</option>
            <option value="unallocated">Unallocated</option>
            {#each profiles as profile}
              <option value={profile.full_name}>{profile.full_name}</option>
            {/each}
            <option value="External">External</option>
          </select>

          <Button
            variant="primary"
            size="large"
            icon="download"
            disabled={isGenerating || sortedActions.length === 0}
            on:click={downloadWord}
            className="ml-auto"
          >
            {isGenerating ? 'Generating...' : 'Download'}
          </Button>
        </div>
      </div>

      {#if downloadError}
        <div class="px-8 pt-4">
          <ErrorDisplay message={downloadError} onDismiss={() => downloadError = ''} />
        </div>
      {/if}

      <!-- Report Content -->
      <div class="flex-1 overflow-y-auto p-8 bg-white text-gray-900">
        {#if sortedActions.length === 0}
          <!-- Empty State -->
          <div class="text-center py-12">
            <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <p class="text-xl text-gray-600">No actions found!</p>
            <p class="text-gray-500 mt-2">
              {#if selectedUser === 'all'}
                No in-progress or pending actions across all issues.
              {:else if selectedUser === 'unallocated'}
                No Unallocated in-progress or pending actions.
              {:else}
                No in-progress or pending actions for {selectedUser}.
              {/if}
            </p>
          </div>
        {:else}
          <!-- Report Header -->
          <div class="mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-2">Actions Report</h1>
            <p class="text-gray-600 text-sm">Generated {getTodayDate()}</p>
            <div class="mt-2 text-sm text-gray-500">
              Showing: {selectedUser === 'all' ? 'All Users' : selectedUser === 'unallocated' ? 'Unallocated' : selectedUser}
              • {sortedActions.length} {sortedActions.length === 1 ? 'action' : 'actions'}
              (In-Progress, Pending)
            </div>
            <div class="mt-1 text-xs text-gray-400">
              Sorted by: Status → Deadline → Created Date
            </div>
          </div>

          <!-- Actions List -->
          <div class="space-y-4">
            {#each sortedActions as action, index}
              <div class="border border-gray-300 rounded-lg overflow-hidden">
                <!-- Action Header -->
                <div class="bg-gray-100 p-4 border-b border-gray-300">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-2">
                        <span class="text-lg font-bold text-gray-900">{index + 1}.</span>
                        <h3 class="text-lg font-bold text-gray-900">{action.action_text}</h3>
                      </div>
                      <p class="text-sm text-gray-600">
                        Issue: <span class="font-medium">{action.issue_name}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Action Details -->
                <div class="p-4 bg-white">
                  <div class="flex flex-wrap gap-2 mb-3">
                    {#if action.name_text}
                      <Badge variant="info" icon="👤" outline>
                        {action.name_text}
                      </Badge>
                    {/if}
                    {#if action.date_deadline}
                      <Badge variant={isOverdue(action.date_deadline) ? 'danger' : 'warning'} icon="📅" outline>
                        Due: {formatDate(action.date_deadline)}
                        {#if isOverdue(action.date_deadline)} ⚠️{/if}
                      </Badge>
                    {/if}
                    <Badge variant="primary" outline className="capitalize">
                      {action.status}
                    </Badge>
                    {#if action.issue_status === 'parked'}
                      <Badge variant="warning" icon="🅿️" outline>
                        Issue Parked
                      </Badge>
                    {:else if action.issue_status === 'completed'}
                      <Badge variant="success" icon="✓" outline>
                        Issue Completed
                      </Badge>
                    {/if}
                  </div>
                  <p class="text-xs text-gray-500">
                    Added: {formatDate(action.created_at)}
                    {#if action.updated_at && new Date(action.updated_at).getTime() - new Date(action.created_at).getTime() > 1000}
                      • Modified: {formatDate(action.updated_at)}
                    {/if}
                  </p>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
