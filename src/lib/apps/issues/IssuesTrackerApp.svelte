<!-- src/lib/apps/issues/IssuesTrackerApp.svelte -->
<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { issuesStore } from './stores/issuesStore';
  import IssueFilters from './components/IssueFilters.svelte';
  import IssueCard from './components/IssueCard.svelte';
  import IssueForm from './components/IssueForm.svelte';
  import IssuesReport from './components/reports/IssuesReport.svelte';
  import ActionsReport from './components/reports/ActionsReport.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import { ISSUE_STATUS } from '$lib/utils/constants';

  let searchTerm = '';
  let statusFilter = ISSUE_STATUS.CURRENT;
  let showNewIssueModal = false;
  let showEditModal = false;
  let editingIssue = null;
  let showReport = false;
  let showActionsReport = false;
  
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
      
      // Filter by status (current, parked, or completed)
      let matchesStatus = false;
      if (statusFilter === ISSUE_STATUS.CURRENT) {
        matchesStatus = (issue.status === ISSUE_STATUS.CURRENT || !issue.status); // Show current issues (including null/undefined for backward compatibility)
      } else if (statusFilter === ISSUE_STATUS.PARKED) {
        matchesStatus = issue.status === ISSUE_STATUS.PARKED;
      } else if (statusFilter === ISSUE_STATUS.COMPLETED) {
        matchesStatus = issue.status === ISSUE_STATUS.COMPLETED;
      }
      
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
    console.log('handleNewIssue called');
    await issuesStore.addIssue(event.detail);
    showNewIssueModal = false;
  }

  async function handleEditIssue(event) {
    console.log('handleEditIssue called');
    await issuesStore.updateIssue(editingIssue.id, event.detail);
    showEditModal = false;
    editingIssue = null;
  }

  async function handleDeleteIssue(event) {
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
    console.log('Toggle section called:', issueId, section);
    if (!expandedSections[issueId]) {
      expandedSections[issueId] = { comments: false, actions: false };
    }
    expandedSections[issueId][section] = !expandedSections[issueId][section];
    // Force Svelte to detect the change
    expandedSections = expandedSections;
  }

  function expandAll() {
    console.log('Expand all called');
    filteredIssues.forEach(issue => {
      expandedSections[issue.id] = { comments: true, actions: true };
    });
    // Force Svelte to detect the change
    expandedSections = expandedSections;
  }

  function collapseAll() {
    console.log('Collapse all called');
    filteredIssues.forEach(issue => {
      expandedSections[issue.id] = { comments: false, actions: false };
    });
    // Force Svelte to detect the change
    expandedSections = expandedSections;
  }
</script>

<div class="bg-slate-800 rounded-xl p-6 border border-slate-700" bind:this={containerElement}>
  <!-- Header -->
  <div class="flex justify-between items-start mb-4">
    <div>
      <h2 class="text-3xl font-bold mb-1">Issues Tracker</h2>
      <p class="text-gray-400">Manage current issues, actions, and comments</p>
    </div>
    <div class="flex space-x-2">
      <Button
        variant="primary"
        size="large"
        icon="chart"
        on:click={() => showReport = true}
      >
        Issues Report
      </Button>
      <Button
        variant="primary"
        size="large"
        icon="clipboard"
        on:click={() => showActionsReport = true}
      >
        Actions Report
      </Button>
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

  <!-- Filters -->
  <div class="mb-4">
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
    <div class="flex space-x-2 mb-3">
      <Button
        variant="secondary"
        size="medium"
        on:click={expandAll}
      >
        Expand All
      </Button>
      <Button
        variant="secondary"
        size="medium"
        on:click={collapseAll}
      >
        Collapse All
      </Button>
    </div>
  {/if}

  <!-- Error Display -->
  {#if error}
    <div class="mb-3 p-3 bg-red-500/10 border border-red-500/50 rounded-lg flex justify-between items-center">
      <p class="text-red-400">{error}</p>
      <Button
        variant="danger"
        size="small"
        icon="close"
        iconPosition="only"
        on:click={() => issuesStore.clearError()}
        title="Dismiss error"
      />
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
    <div class="space-y-3">
      {#each filteredIssues as issue (issue.id)}
        <IssueCard 
          {issue}
          showComments={expandedSections[issue.id]?.comments || false}
          showActions={expandedSections[issue.id]?.actions || false}
          on:toggleComments={() => toggleSection(issue.id, 'comments')}
          on:toggleActions={() => toggleSection(issue.id, 'actions')}
          on:edit={(e) => { editingIssue = e.detail; showEditModal = true; }}
          on:toggleStatus={handleToggleStatus}
          on:delete={handleDeleteIssue}
        />
      {/each}
    </div>
  {/if}
</div>

<!-- New Issue Modal -->
<IssueForm 
  bind:show={showNewIssueModal}
  on:submit={handleNewIssue}
  on:close={() => showNewIssueModal = false}
/>

<!-- Edit Issue Modal -->
<IssueForm 
  bind:show={showEditModal}
  issue={editingIssue}
  on:submit={handleEditIssue}
  on:close={() => { showEditModal = false; editingIssue = null; }}
/>

<!-- Outstanding Actions Report -->
<IssuesReport 
  bind:show={showReport}
  {issues}
/>

<!-- Actions Report -->
<ActionsReport 
  bind:show={showActionsReport}
  {issues}
/>
