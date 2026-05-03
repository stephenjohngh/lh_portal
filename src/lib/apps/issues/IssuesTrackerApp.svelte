<!-- src/lib/apps/issues/IssuesTrackerApp.svelte -->
<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { permissions }    from '$lib/stores/permissions';
  import { auth }           from '$lib/stores/auth';
  import { getLogger }      from '$lib/utils/logger';
  import { issuesStore }    from './stores/issuesStore';
  import { meetingsStore }  from './stores/meetingsStore';
  import IssueFilters       from './components/IssueFilters.svelte';
  import IssueCard          from './components/IssueCard.svelte';
  import IssueForm          from './components/IssueForm.svelte';
  import ReportsTab         from './components/reports/ReportsTab.svelte';
  import MeetingBanner      from './components/meetings/MeetingBanner.svelte';
  import MeetingForm        from './components/meetings/MeetingForm.svelte';
  import MeetingsTab        from './components/meetings/MeetingsTab.svelte';
  import Button             from '$lib/components/common/Button.svelte';
  import ErrorDisplay       from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner     from '$lib/components/common/LoadingSpinner.svelte';
  import { ISSUE_STATUS }   from '$lib/utils/constants';

  const logger = getLogger('IssuesTrackerApp');

  // -- Tab state --------------------------------------------------------
  let activeTab           = 'issues';   // 'issues' | 'meetings' | 'reports'
  // When a MeetingBadge is clicked on an issue card, we switch to the
  // Meetings tab and auto-select that meeting.
  let meetingTabTargetId  = null;

  // -- Issues tab state -------------------------------------------------
  let searchTerm          = '';
  let statusFilter        = ISSUE_STATUS.CURRENT;
  let showNewIssueModal   = false;
  let editingIssue        = null;

  // -- Meeting banner edit form (banner's "Edit" dispatches here) -------
  let showMeetingForm     = false;
  let editingMeeting      = null;
  let meetingFormSaving   = false;
  let meetingFormError    = '';

  // -- Scroll preservation ----------------------------------------------
  let expandedSections    = {};
  let scrollPosition      = 0;
  let containerElement;

  $: ({ issues, loading, error } = $issuesStore);

  $: if (loading && containerElement) {
    scrollPosition = window.scrollY;
  }
  $: if (!loading && scrollPosition > 0) {
    tick().then(() => {
      window.scrollTo({ top: scrollPosition, behavior: 'instant' });
      scrollPosition = 0;
    });
  }

  // -- Filter issues (no meeting filter — that lives in the Meetings tab) -
  $: filteredIssues = issues.filter(issue => {
    const matchesSearch =
      issue.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.description?.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus = false;
    if (statusFilter === ISSUE_STATUS.CURRENT) {
      matchesStatus = issue.status === ISSUE_STATUS.CURRENT || !issue.status;
    } else if (statusFilter === ISSUE_STATUS.PARKED) {
      matchesStatus = issue.status === ISSUE_STATUS.PARKED;
    } else if (statusFilter === ISSUE_STATUS.COMPLETED) {
      matchesStatus = issue.status === ISSUE_STATUS.COMPLETED;
    }

    return matchesSearch && matchesStatus;
  });

  // -- Meeting badge click: navigate to Meetings tab and select meeting --
  function handleMeetingBadgeClick(e) {
    meetingTabTargetId = e.detail;
    activeTab          = 'meetings';
  }

  // -- Banner: edit button dispatches here (opens lightweight form modal) -
  function handleBannerEdit(e) {
    editingMeeting  = e.detail;
    showMeetingForm = true;
  }
  function closeMeetingForm() {
    showMeetingForm  = false;
    editingMeeting   = null;
    meetingFormError = '';
  }
  async function handleMeetingFormSubmit({ detail }) {
    meetingFormSaving = true;
    meetingFormError  = '';
    const result = await meetingsStore.update(editingMeeting.id, detail);
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
    await issuesStore.addIssue(event.detail);
  }

  async function handleEditIssue(event) {
    await issuesStore.updateIssue(editingIssue.id, event.detail);
  }

  async function handleDeleteIssue(event) {
    await issuesStore.deleteIssue(event.detail);
  }

  async function handleToggleStatus(event) {
    const issue     = event.detail;
    const newStatus = issue.status === ISSUE_STATUS.COMPLETED
      ? ISSUE_STATUS.CURRENT
      : ISSUE_STATUS.COMPLETED;
    await issuesStore.updateIssue(issue.id, {
      name: issue.name, description: issue.description,
      priority: issue.priority, status: newStatus
    });
  }

  function toggleSection(issueId, section) {
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

  <!-- ─── Header ──────────────────────────────────────────────────────── -->
  <div class="flex-start mb-4">
    <div>
      <h2 class="heading-page">Issues Tracker</h2>
      <p class="text-muted">Manage current issues, actions, and comments</p>
    </div>
    <div class="flex space-x-2">
      <Button variant="primary" size="large" icon="plus"
        on:click={() => showNewIssueModal = true}>
        New Issue
      </Button>
    </div>
  </div>

  <!-- ─── Tab bar ─────────────────────────────────────────────────────── -->
  <div class="flex border-b border-slate-700 mb-5">
    <button
      class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
             {activeTab === 'issues'
               ? 'text-white border-purple-500'
               : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'}"
      on:click={() => activeTab = 'issues'}
    >
      Issues
    </button>
    <button
      class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5
             {activeTab === 'meetings'
               ? 'text-white border-purple-500'
               : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'}"
      on:click={() => { meetingTabTargetId = null; activeTab = 'meetings'; }}
    >
      Meetings
      {#if $meetingsStore.current}
        <span class="text-[10px] px-1.5 py-0.5 rounded-full
                     bg-amber-500/20 text-amber-300 border border-amber-500/40 leading-none">
          open
        </span>
      {/if}
    </button>
    <button
      class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
             {activeTab === 'reports'
               ? 'text-white border-purple-500'
               : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'}"
      on:click={() => activeTab = 'reports'}
    >
      Reports
    </button>
  </div>

  <!-- ─── ISSUES TAB ──────────────────────────────────────────────────── -->
  {#if activeTab === 'issues'}

    <!-- Active-meeting banner -->
    <MeetingBanner
      {issues}
      on:edit={handleBannerEdit}
    />

    <ErrorDisplay message={error} onDismiss={() => issuesStore.clearError()} />

    <!-- Filters -->
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

    {#if loading}
      <LoadingSpinner />
    {:else if filteredIssues.length === 0}
      <div class="empty-state">
        No issues found. {searchTerm ? 'Try a different search.' : 'Click "New Issue" to create one.'}
      </div>
    {:else}
      <div class="section-spacing">
        {#each filteredIssues as issue (issue.id)}
          <IssueCard
            {issue}
            showComments={expandedSections[issue.id]?.comments || false}
            showActions={expandedSections[issue.id]?.actions   || false}
            on:toggleComments={() => toggleSection(issue.id, 'comments')}
            on:toggleActions={() => toggleSection(issue.id, 'actions')}
            on:edit={(e) => editingIssue = e.detail}
            on:toggleStatus={handleToggleStatus}
            on:delete={handleDeleteIssue}
            on:meetingFilter={handleMeetingBadgeClick}
          />
        {/each}
      </div>
    {/if}

  <!-- ─── MEETINGS TAB ────────────────────────────────────────────────── -->
  {:else if activeTab === 'meetings'}
    <MeetingsTab {issues} initialMeetingId={meetingTabTargetId} />

  <!-- ─── REPORTS TAB ─────────────────────────────────────────────────── -->
  {:else if activeTab === 'reports'}
    <ReportsTab {issues} />
  {/if}

</div>

<!-- ─── New / edit issue modals ─────────────────────────────────────── -->
<IssueForm
  show={showNewIssueModal}
  on:submit={handleNewIssue}
  on:close={() => showNewIssueModal = false}
/>
<IssueForm
  show={editingIssue !== null}
  issue={editingIssue}
  on:submit={handleEditIssue}
  on:close={() => editingIssue = null}
/>

<!-- ─── Meeting edit form (opened by banner's Edit button) ──────────── -->
<MeetingForm
  bind:show={showMeetingForm}
  meeting={editingMeeting}
  saving={meetingFormSaving}
  on:submit={handleMeetingFormSubmit}
  on:close={closeMeetingForm}
/>
