<!-- src/lib/apps/issues/IssuesTrackerApp.svelte -->
<!-- Updated to use ErrorDisplay and LoadingSpinner components -->
<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { permissions } from '$lib/stores/permissions';
  import { auth } from '$lib/stores/auth';
  import { fmtDate } from '$lib/utils/dates';
  import { getLogger } from '$lib/utils/logger';
  import { issuesStore }   from './stores/issuesStore';
  import { meetingsStore } from './stores/meetingsStore';
  import IssueFilters from './components/IssueFilters.svelte';
  import IssueCard from './components/IssueCard.svelte';
  import IssueForm from './components/IssueForm.svelte';
  import IssuesReport from './components/reports/IssuesReport.svelte';
  import ActionsReport from './components/reports/ActionsReport.svelte';
  import MeetingBanner from './components/meetings/MeetingBanner.svelte';
  import MeetingsModal from './components/meetings/MeetingsModal.svelte';
  import MeetingForm   from './components/meetings/MeetingForm.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import { ISSUE_STATUS } from '$lib/utils/constants';

  const logger = getLogger('IssuesTrackerApp');

  let searchTerm = '';
  let statusFilter = ISSUE_STATUS.CURRENT;
  let showNewIssueModal = false;
  let editingIssue = null;
  let showReport = false;
  let showActionsReport = false;

  // -- Meetings -----------------------------------------------------
  let showMeetingsModal       = false;
  let showMeetingForm         = false;
  let editingMeeting          = null;
  let meetingFormSaving       = false;
  let meetingFormError        = '';
  // When set, scope the issues list to items tagged to this meeting.
  let meetingFilterId         = null;

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

  // -- Filter issues ------------------------------------------------
  // The meeting filter is intersected with the search/status filter:
  // we keep an issue if it's tagged to the meeting OR any of its
  // comments / actions are tagged to it. This matches "show me what
  // happened in that meeting" rather than "show me only issues created
  // there".
  $: filteredMeeting = $meetingsStore.list.find(m => m.id === meetingFilterId) ?? null;

  $: filteredIssues = issues
    .filter(issue => {
      const matchesSearch = issue.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           issue.description?.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesStatus = false;
      if (statusFilter === ISSUE_STATUS.CURRENT) {
        matchesStatus = (issue.status === ISSUE_STATUS.CURRENT || !issue.status);
      } else if (statusFilter === ISSUE_STATUS.PARKED) {
        matchesStatus = issue.status === ISSUE_STATUS.PARKED;
      } else if (statusFilter === ISSUE_STATUS.COMPLETED) {
        matchesStatus = issue.status === ISSUE_STATUS.COMPLETED;
      }

      let matchesMeeting = true;
      if (meetingFilterId) {
        matchesMeeting =
          issue.meeting_id === meetingFilterId ||
          (issue.comments || []).some(c => c.meeting_id === meetingFilterId) ||
          (issue.actions  || []).some(a => a.meeting_id === meetingFilterId);
      }

      return matchesSearch && matchesStatus && matchesMeeting;
    });

  function clearMeetingFilter() {
    meetingFilterId = null;
  }

  // -- Meeting handlers --------------------------------------------
  function openMeetingsModal()        { showMeetingsModal = true; }
  function handleViewItems({ detail }) {
    meetingFilterId = detail.meetingId;
    showMeetingsModal = false;
  }
  function openEditMeeting(meeting) {
    editingMeeting    = meeting;
    showMeetingForm   = true;
    showMeetingsModal = false;   // close the list while editing
  }
  function closeMeetingForm() {
    showMeetingForm = false;
    editingMeeting  = null;
    meetingFormError = '';
  }
  async function handleMeetingFormSubmit({ detail }) {
    meetingFormSaving = true;
    meetingFormError  = '';
    const result = editingMeeting
      ? await meetingsStore.update(editingMeeting.id, detail)
      : await meetingsStore.create(detail);
    meetingFormSaving = false;
    if (!result.success) { meetingFormError = result.error ?? 'Failed to save meeting'; return; }
    closeMeetingForm();
  }

  onMount(async () => {
    if ($auth.user) {
      await permissions.init($auth.user.id, 'issues');
    }

    issuesStore.fetchIssues();
    issuesStore.initializeRealtime();

    meetingsStore.load();
    meetingsStore.initializeRealtime();
  });

  onDestroy(() => {
    issuesStore.cleanup();
    meetingsStore.cleanup();
  });

  async function handleNewIssue(event) {
    logger('handleNewIssue called');
    await issuesStore.addIssue(event.detail);
  }

  async function handleEditIssue(event) {
    logger('handleEditIssue called');
    await issuesStore.updateIssue(editingIssue.id, event.detail);
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
    logger('Toggle section called:', issueId, section);
    if (!expandedSections[issueId]) {
      expandedSections[issueId] = { comments: false, actions: false };
    }
    expandedSections[issueId][section] = !expandedSections[issueId][section];
    expandedSections = expandedSections;
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

<div class="app-container" bind:this={containerElement}>
  <!-- Header -->
  <div class="flex-start mb-4">
    <div>
      <h2 class="heading-page">Issues Tracker</h2>
      <p class="text-muted">Manage current issues, actions, and comments</p>
    </div>
    <div class="flex space-x-2">
      <Button
        variant="secondary"
        size="large"
        icon="calendar"
        on:click={openMeetingsModal}
      >
        Meetings{$meetingsStore.current ? ' • 1 open' : ''}
      </Button>
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
      <Button
        variant="primary"
        size="large"
        icon="plus"
        on:click={() => showNewIssueModal = true}
      >
        New Issue
      </Button>
    </div>
  </div>

  <!-- Active-meeting banner (only when a meeting is open) -->
  <MeetingBanner
    issues={filteredIssues}
    on:viewItems={handleViewItems}
    on:edit={(e) => openEditMeeting(e.detail)}
  />

  <!-- Meeting-filter chip — visible only while a filter is active -->
  {#if filteredMeeting}
    <div class="rounded-lg bg-purple-500/10 border border-purple-500/40 px-4 py-2 mb-4
                flex items-center justify-between gap-3 flex-wrap">
      <p class="text-sm text-purple-200">
        Filtering to meeting: <span class="font-semibold">{filteredMeeting.title}</span>
        <span class="text-xs text-purple-300/70">({fmtDate(filteredMeeting.meeting_date)} · {filteredMeeting.meeting_type})</span>
      </p>
      <Button variant="secondary" size="small" icon="close" on:click={clearMeetingFilter}>
        Clear filter
      </Button>
    </div>
  {/if}

  <!-- Filters with Expand/Collapse Toggle -->
  <div class="mb-4">
    <IssueFilters
      bind:searchTerm
      bind:statusFilter
      resultCount={filteredIssues.length}
      showExpandToggle={filteredIssues.length > 0}
      allExpanded={filteredIssues.every(issue =>
        expandedSections[issue.id]?.comments && expandedSections[issue.id]?.actions
      )}
      on:toggleExpand={(e) => e.detail ? expandAll() : collapseAll()}
    />
  </div>

  <!-- Error Display -->
  <ErrorDisplay 
    message={error} 
    onDismiss={() => issuesStore.clearError()}
  />

  <!-- Loading State -->
  {#if loading}
    <LoadingSpinner />

  <!-- Empty State -->
  {:else if filteredIssues.length === 0}
    <div class="empty-state">
      No issues found. {searchTerm ? 'Try a different search.' : 'Click "New Issue" to create one.'}
    </div>

  <!-- Issues List -->
  {:else}
    <div class="section-spacing">
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

<!-- Meetings list modal -->
<MeetingsModal
  bind:show={showMeetingsModal}
  {issues}
  on:viewItems={handleViewItems}
/>

<!-- Meeting form (used by both the banner's Edit and any direct edit) -->
<MeetingForm
  bind:show={showMeetingForm}
  meeting={editingMeeting}
  saving={meetingFormSaving}
  on:submit={handleMeetingFormSubmit}
  on:close={closeMeetingForm}
/>
