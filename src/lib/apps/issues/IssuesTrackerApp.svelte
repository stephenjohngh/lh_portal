<!-- src/lib/apps/issues/IssuesTrackerApp.svelte -->
<!-- UPDATED: Now uses ProtectedButton for read-only user support -->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { issuesStore } from './stores/issuesStore';
  import { permissions, isReadOnlyUser } from '$lib/stores/permissions';
  
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  
  import IssueCard from './components/IssueCard.svelte';
  import IssueForm from './components/IssueForm.svelte';
  import IssueFilters from './components/IssueFilters.svelte';

  let showNewIssueModal = false;
  let searchTerm = '';
  let statusFilter = 'current';
  let priorityFilter = 'all';

  $: ({ issues, loading, error } = $issuesStore);
  
  // Filtered issues
  $: filteredIssues = issues.filter(issue => {
    const matchesSearch = issue.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         issue.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || issue.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || issue.priority === parseInt(priorityFilter);
    return matchesSearch && matchesStatus && matchesPriority;
  });

  onMount(() => {
    issuesStore.fetchIssues();
    issuesStore.initializeRealtime();
  });

  onDestroy(() => {
    issuesStore.cleanup();
  });

  async function handleNewIssue(event) {
    await issuesStore.addIssue(event.detail);
  }
</script>

<div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-3xl font-bold mb-2">Issues Tracker</h2>
        <p class="text-gray-400">Track and manage project issues</p>
      </div>
      
      <!-- Permission level indicator -->
      {#if $permissions.level && !$permissions.loading}
        <Badge 
          variant={$permissions.isAdmin ? 'primary' : $permissions.isReadOnly ? 'secondary' : 'success'} 
          size="medium"
        >
          {$permissions.isAdmin ? 'Admin' : $permissions.isReadOnly ? 'Viewer' : 'Editor'}
        </Badge>
      {/if}
    </div>
  </div>

  <!-- Read-Only Banner -->
  {#if $isReadOnlyUser}
    <div class="mb-6 bg-gray-700/50 border-l-4 border-gray-500 p-4 rounded">
      <div class="flex items-center space-x-3">
        <Icon name="user" size={5} className="text-gray-400 flex-shrink-0" />
        <div>
          <p class="font-medium text-white">Read-Only Access</p>
          <p class="text-sm text-gray-400">
            You can view issues but cannot create, edit, or delete them. Contact your administrator for full access.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Filters and Search -->
  <IssueFilters 
    bind:searchTerm 
    bind:statusFilter 
    bind:priorityFilter
  />

  <!-- Action Buttons -->
  <div class="mb-6 flex justify-between items-center">
    <div class="text-sm text-gray-400">
      {filteredIssues.length} {filteredIssues.length === 1 ? 'issue' : 'issues'} found
    </div>
    
    <div class="flex space-x-2">
      <!-- Create button - hides for read-only users -->
      <ProtectedButton
        action="modify"
        variant="primary"
        size="large"
        icon="plus"
        on:click={() => showNewIssueModal = true}
      >
        New Issue
      </ProtectedButton>
    </div>
  </div>

  <!-- Error Display -->
  {#if error}
    <div class="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
      <p class="text-red-400">{error}</p>
    </div>
  {/if}

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center items-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
    </div>
  
  <!-- Empty State -->
  {:else if filteredIssues.length === 0}
    <div class="text-center py-12">
      <Icon name="clipboard" size={16} className="text-gray-600 mx-auto mb-4" />
      <p class="text-gray-400 mb-2">
        {searchTerm || statusFilter !== 'all' || priorityFilter !== 'all'
          ? 'No issues match your filters' 
          : 'No issues found'}
      </p>
      
      <!-- Create first issue button - hides for read-only users -->
      {#if !searchTerm && statusFilter === 'all' && priorityFilter === 'all'}
        <ProtectedButton
          action="modify"
          variant="primary"
          size="medium"
          icon="plus"
          className="mt-4"
          on:click={() => showNewIssueModal = true}
        >
          Create First Issue
        </ProtectedButton>
      {/if}
    </div>

  <!-- Issues List -->
  {:else}
    <div class="space-y-4">
      {#each filteredIssues as issue (issue.id)}
        <IssueCard {issue} />
      {/each}
    </div>
  {/if}

  <!-- Stats Footer -->
  {#if !loading && issues.length > 0}
    <div class="mt-6 pt-6 border-t border-slate-700">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-purple-400">{issues.length}</div>
          <div class="text-sm text-gray-400">Total Issues</div>
        </div>
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-blue-400">
            {issues.filter(i => i.status === 'current').length}
          </div>
          <div class="text-sm text-gray-400">Current</div>
        </div>
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-green-400">
            {issues.filter(i => i.status === 'completed').length}
          </div>
          <div class="text-sm text-gray-400">Completed</div>
        </div>
        <div class="bg-slate-700/30 rounded-lg p-3">
          <div class="text-2xl font-bold text-amber-400">
            {issues.filter(i => i.status === 'parked').length}
          </div>
          <div class="text-sm text-gray-400">Parked</div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- New Issue Modal -->
<IssueForm 
  show={showNewIssueModal}
  on:submit={handleNewIssue}
  on:close={() => showNewIssueModal = false}
/>
