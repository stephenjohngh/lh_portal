<!-- src/lib/components/issues/IssuesTrackerApp.svelte -->
<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { issuesStore } from './issuesStore';
  import IssueFilters from './IssueFilters.svelte';
  import IssueCard from './IssueCard.svelte';
  import IssueForm from './IssueForm.svelte';
  import { ISSUE_STATUS } from '$lib/utils/constants';

  let searchTerm = '';
  let statusFilter = ISSUE_STATUS.CURRENT;
  let showNewIssueModal = false;
  let editingIssue = null;
  
  // Persist UI state across data refreshes
  let expandedSections = {}; // { issueId: { comments: bool, actions: bool } }
  let scrollPosition = 0;
  let containerElement;

  $: ({ issues, loading, error } = $issuesStore);

  // Save scroll position before data refresh
  $: if (loading && containerElement) {
    scrollPosition = window.scrollY;
  }

  // Restore scroll position after data refresh
  $: if (!loading && scrollPosition > 0) {
    tick().then(() => {
      window.scrollTo({ top: scrollPosition, behavior: 'instant' });
      scrollPosition = 0;
    });
  }

  // Filter issues
  $: filteredIssues = issues
    .filter(issue => {
      const matchesSearch = issue.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           issue.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filter by status (current or completed)
      const matchesStatus = statusFilter === ISSUE_STATUS.CURRENT
        ? (issue.status === ISSUE_STATUS.CURRENT || !issue.status) // Show current issues (including null/undefined for backward compatibility)
        : issue.status === ISSUE_STATUS.COMPLETED;
      
      return matchesSearch && matchesStatus;
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

  async function handleEditIssue(event) {
    await issuesStore.updateIssue(editingIssue.id, event.detail);
  }

  async function handleDeleteIssue(event) {
    if (!confirm('Are you sure you want to delete this issue and all its comments and actions?')) return;
    await issuesStore.deleteIssue(event.detail);
  }
  
  async function handleToggleStatus(event) {
    const issue = event.detail;
    const newStatus = issue.status === ISSUE_STATUS.COMPLETED ? ISSUE_STATUS.CURRENT : ISSUE_STATUS.COMPLETED;
    await issuesStore.updateIssue(issue.id, {
      name: issue.name,
      description: issue.description,
      priority: issue.priority,
      status: newStatus
    });
  }
  
  function toggleSection(issueId, section) {
    if (!expandedSections[issueId]) {
      expandedSections[issueId] = { comments: false, actions: false };
    }
    expandedSections[issueId][section] = !expandedSections[issueId][section];
    expandedSections = expandedSections; // Trigger reactivity
  }

  function expandAll() {
    filteredIssues.forEach(issue => {
      expandedSections[issue.id] = { comments: true, actions: true };
    });
    expandedSections = expandedSections;
  }

  function collapseAll() {
    filteredIssues.forEach(issue => {
      expandedSections[issue.id] = { comments: false, actions: false };
    });
    expandedSections = expandedSections;
  }
</script>

<div class="bg-slate-800 rounded-xl p-8 border border-slate-700" bind:this={containerElement}>
  <!-- Header -->
  <div class="flex justify-between items-start mb-6">
    <div>
      <h2 class="text-3xl font-bold mb-2">Issues Tracker</h2>
      <p class="text-gray-400">Manage current issues, actions, and comments</p>
    </div>
    <button
      on:click={() => showNewIssueModal = true}
      class="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
      </svg>
      <span>New Issue</span>
    </button>
  </div>

  <!-- Filters -->
  <div class="mb-6">
    <IssueFilters 
      bind:searchTerm
      bind:statusFilter
      onRefresh={() => issuesStore.fetchIssues()}
      {loading}
      resultCount={filteredIssues.length}
    />
  </div>

  <!-- Expand/Collapse All -->
  {#if filteredIssues.length > 0}
    <div class="flex space-x-2 mb-4">
      <button
        on:click={expandAll}
        class="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-sm"
      >
        Expand All
      </button>
      <button
        on:click={collapseAll}
        class="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-sm"
      >
        Collapse All
      </button>
    </div>
  {/if}

  <!-- Error Display -->
  {#if error}
    <div class="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex justify-between items-center">
      <p class="text-red-400">{error}</p>
      <button on:click={() => issuesStore.clearError()} class="text-red-400 hover:text-red-300">
        ✕
      </button>
    </div>
  {/if}

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
    </div>

  <!-- Empty State -->
  {:else if filteredIssues.length === 0}
    <div class="text-center py-12 text-gray-400">
      No issues found. {searchTerm ? 'Try a different search.' : 'Click "New Issue" to create one.'}
    </div>

  <!-- Issues List -->
  {:else}
    <div class="space-y-4">
      {#each filteredIssues as issue (issue.id)}
        <IssueCard 
          {issue}
          showComments={expandedSections[issue.id]?.comments || false}
          showActions={expandedSections[issue.id]?.actions || false}
          on:toggleComments={() => toggleSection(issue.id, 'comments')}
          on:toggleActions={() => toggleSection(issue.id, 'actions')}
          on:edit={(e) => editingIssue = e.detail}
          on:toggleStatus={handleToggleStatus}
          on:delete={handleDeleteIssue}
        />
      {/each}
    </div>
  {/if}
</div>

<!-- New Issue Modal -->
<IssueForm 
  show={showNewIssueModal}
  on:submit={handleNewIssue}
  on:close={() => showNewIssueModal = false}
/>

<!-- Edit Issue Modal -->
<IssueForm 
  show={editingIssue !== null}
  issue={editingIssue}
  on:submit={handleEditIssue}
  on:close={() => editingIssue = null}
/>
