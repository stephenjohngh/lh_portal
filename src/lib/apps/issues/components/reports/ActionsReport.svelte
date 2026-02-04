<!-- src/lib/components/reports/ActionsReport.svelte -->
<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { formatDate, isOverdue } from '$lib/utils/dates';

  export let show = false;
  export let issues = [];

  let profiles = [];
  let selectedUser = 'all'; // 'all' or specific user name
  let isGenerating = false;

  onMount(async () => {
    await loadProfiles();
  });

  async function loadProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name')
      .order('full_name');
    
    if (error) {
      console.error('Error loading profiles:', error);
      profiles = [];
    } else {
      profiles = data || [];
    }
  }

  // Get all actions that are in-progress or pending
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

  // Filter by selected user
  $: filteredActions = selectedUser === 'all' 
    ? allActions 
    : selectedUser === 'unallocated'
    ? allActions.filter(action => !action.name_text || action.name_text.trim() === '')
    : allActions.filter(action => action.name_text === selectedUser);

  // Sort by: issue name, due date, modified date
  $: sortedActions = [...filteredActions].sort((a, b) => {
    // First by issue name
    const issueCompare = a.issue_name.localeCompare(b.issue_name);
    if (issueCompare !== 0) return issueCompare;

    // Then by due date (nulls last)
    if (a.date_deadline && !b.date_deadline) return -1;
    if (!a.date_deadline && b.date_deadline) return 1;
    if (a.date_deadline && b.date_deadline) {
      const dateCompare = new Date(a.date_deadline) - new Date(b.date_deadline);
      if (dateCompare !== 0) return dateCompare;
    }

    // Finally by modified date (newest first)
    const aModified = a.updated_at || a.created_at;
    const bModified = b.updated_at || b.created_at;
    return new Date(bModified) - new Date(aModified);
  });

  function close() {
    show = false;
  }

  async function downloadWord() {
    console.log('\n========================================');
    console.log('📥 DOWNLOAD ACTIONS REPORT - CLIENT SIDE');
    console.log('Time:', new Date().toISOString());
    console.log('========================================');
    
    isGenerating = true;
    
    try {
      console.log('📋 Step 1: Preparing data...');
      console.log('   Selected user:', selectedUser);
      console.log('   Sorted actions count:', sortedActions.length);
      console.log('   First action:', sortedActions[0]);
      
      const requestBody = {
        actions: sortedActions,
        selectedUser,
        userName: selectedUser === 'all' ? 'All Users' : selectedUser === 'unallocated' ? 'Unallocated' : selectedUser
      };
      
      console.log('   Request body keys:', Object.keys(requestBody));
      console.log('   Request body size:', JSON.stringify(requestBody).length, 'characters');
      
      console.log('📡 Step 2: Sending request...');
      const response = await fetch('/api/reports/generate-actions-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📨 Step 3: Response received');
      console.log('   Status:', response.status);
      console.log('   Status text:', response.statusText);
      console.log('   Headers:', [...response.headers.entries()]);

      if (!response.ok) {
        console.error('❌ Response not OK');
        const contentType = response.headers.get('content-type');
        console.log('   Content-Type:', contentType);
        
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          console.error('   Error data:', errorData);
          throw new Error(errorData.error || 'Failed to generate report');
        } else {
          const errorText = await response.text();
          console.error('   Error text:', errorText);
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
      }

      console.log('📦 Step 4: Creating blob...');
      const blob = await response.blob();
      console.log('   Blob created');
      console.log('   Blob size:', blob.size, 'bytes');
      console.log('   Blob size:', (blob.size / 1024).toFixed(2), 'KB');
      console.log('   Blob type:', blob.type);

      if (blob.size === 0) {
        console.error('❌ Generated document is empty');
        throw new Error('Generated document is empty');
      }

      console.log('🔗 Step 5: Creating download URL...');
      const url = window.URL.createObjectURL(blob);
      console.log('   URL created:', url.substring(0, 50) + '...');
      
      console.log('📁 Step 6: Creating download link...');
      const a = document.createElement('a');
      a.href = url;
      const fileName = selectedUser === 'all' 
        ? `Actions_Report_All_Users_${new Date().toISOString().split('T')[0]}.docx`
        : selectedUser === 'unallocated'
        ? `Actions_Report_Unallocated_${new Date().toISOString().split('T')[0]}.docx`
        : `Actions_Report_${selectedUser.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.docx`;
      a.download = fileName;
      console.log('   Filename:', fileName);
      
      console.log('🖱️ Step 7: Triggering download...');
      document.body.appendChild(a);
      a.click();
      console.log('   Download clicked');
      
      console.log('🧹 Step 8: Cleaning up...');
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      console.log('   Cleanup complete');
      
      console.log('✅ SUCCESS - Download complete!');
      console.log('========================================\n');
      
    } catch (err) {
      console.error('\n========================================');
      console.error('❌ ERROR DOWNLOADING ACTIONS REPORT');
      console.error('========================================');
      console.error('Error type:', err.constructor.name);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      console.error('========================================\n');
      
      alert(`Failed to generate report:\n\n${err.message}\n\nCheck browser console (F12) for details.`);
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
          <button 
            on:click={close} 
            class="p-2 hover:bg-slate-700 rounded"
            aria-label="Close report"
            title="Close report"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
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

          <button 
            on:click={downloadWord}
            disabled={isGenerating || sortedActions.length === 0}
            class="ml-auto px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded flex items-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            {isGenerating ? 'Generating...' : 'Download'}
          </button>
        </div>
      </div>

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
                    {#if action.issue_status === 'parked'}
                      <span class="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded border border-amber-200">
                        🅿️ Issue Parked
                      </span>
                    {:else if action.issue_status === 'completed'}
                      <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded border border-green-200">
                        ✓ Issue Completed
                      </span>
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
