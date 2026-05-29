<!-- src/lib/apps/management/ManagementApp.svelte -->
<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { get }            from 'svelte/store';
  import { permissions }    from '$lib/stores/permissions';
  import { auth }           from '$lib/stores/auth';
  import { getLogger }      from '$lib/utils/logger';
  import { issuesStore }    from './stores/issuesStore';
  import { meetingsStore }  from './stores/meetingsStore';
  import { issuesUiState }  from './stores/issuesUiStore';
  import IssueCard          from './components/IssueCard.svelte';
  import IssueForm          from './components/IssueForm.svelte';
  import ReportsTab         from './components/reports/ReportsTab.svelte';
  import MeetingsTab        from './components/meetings/MeetingsTab.svelte';
  import Button             from '$lib/components/common/Button.svelte';
  import ErrorDisplay       from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner     from '$lib/components/common/LoadingSpinner.svelte';
  import { ISSUE_STATUS, STATUS_FILTERS } from '$lib/utils/constants';

  const logger = getLogger('ManagementApp');

  // -- Tab state --------------------------------------------------------
  let activeTab           = 'issues';   // 'issues' | 'meetings' | 'reports'
  // When a MeetingBadge is clicked on an issue card, we switch to the
  // Meetings tab and auto-select that meeting.
  let meetingTabTargetId  = null;

  // Saved scroll position for the Issues tab — restored when the user
  // switches back from another tab (internal Management tab switch).
  let issuesScrollY = 0;

  function setTab(tab) {
    if (activeTab === 'issues') {
      issuesScrollY = window.scrollY;
      // Flush the debounced scroll-state save immediately so we don't lose
      // position if the user switches away before the debounce fires.
      flushScrollState();
    }
    activeTab = tab;
    if (tab === 'issues' && issuesScrollY > 0) {
      tick().then(() => window.scrollTo({ top: issuesScrollY, behavior: 'instant' }));
    }
  }

  // -- Issues tab state -------------------------------------------------
  let searchTerm          = '';
  let statusFilter        = ISSUE_STATUS.CURRENT;
  let showNewIssueModal   = false;
  let editingIssue        = null;

  // -- Jump-to-issue state ----------------------------------------------
  let jumpToIssueId = '';
  // Issues matching the current status tab, sorted by number, for the jump dropdown.
  $: jumpIssues = [...issues]
    .filter(issue => {
      if (statusFilter === ISSUE_STATUS.CURRENT)
        return issue.status === ISSUE_STATUS.CURRENT || !issue.status;
      return issue.status === statusFilter;
    })
    .sort((a, b) => (a.issue_number ?? 0) - (b.issue_number ?? 0));

  // -- Scroll preservation ----------------------------------------------
  // issuesUiState (module-level singleton) persists scroll pos + expanded
  // sections across app switches.  We cannot rely on onDestroy to save
  // position: in Svelte 5 the DOM is removed *before* onDestroy fires, so
  // window.scrollY is already 0 and querySelectorAll finds nothing.
  // Solution: save on every scroll event (debounced 150ms) so the state is
  // already up-to-date before the component is ever destroyed.
  let expandedSections    = {};
  let scrollPosition      = 0;   // used for scroll preservation during data refetches
  let containerElement;
  let scrollSaveTimer     = null;

  function flushScrollState() {
    if (activeTab !== 'issues') return;
    issuesUiState.update(s => ({
      ...s,
      scrollY:          window.scrollY,
      topIssueId:       getTopIssueId(),
      expandedSections,
    }));
  }

  function onIssuesScroll() {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(flushScrollState, 150);
  }

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
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      issue.name?.toLowerCase().includes(term) ||
      issue.description?.toLowerCase().includes(term) ||
      (issue.activities || []).some(a =>
        a.body?.toLowerCase().includes(term) ||
        Object.values(a.fields || {}).some(v => typeof v === 'string' && v.toLowerCase().includes(term))
      );

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
    setTab('meetings');
  }

  onMount(async () => {
    // Restore UI state persisted from the last visit (survives app switches).
    const saved = get(issuesUiState);
    expandedSections = saved.expandedSections;
    issuesScrollY    = saved.scrollY;

    if ($auth.user) {
      await permissions.init($auth.user.id, 'management');
    }
    await issuesStore.fetchIssues();

    if (saved.topIssueId || saved.scrollY > 0) {
      // Two ticks: first flushes Svelte's store-triggered DOM updates (renders
      // the {#each} list); second flushes any child-component reactive updates.
      // rAF then waits for the browser to finish layout so getBoundingClientRect
      // and scrollTo operate on fully-laid-out content.
      await tick();
      await tick();
      await new Promise(r => requestAnimationFrame(r));

      if (saved.topIssueId) {
        const el = document.getElementById(`issue-${saved.topIssueId}`);
        if (el) {
          const stickyBar = containerElement?.querySelector('.sticky');
          const stickyH   = stickyBar ? stickyBar.getBoundingClientRect().height : 76;
          const top = window.scrollY + el.getBoundingClientRect().top - 64 - stickyH - 8;
          window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        } else if (saved.scrollY > 0) {
          // Issue no longer in filtered list — fall back to raw pixel position.
          window.scrollTo({ top: saved.scrollY, behavior: 'instant' });
        }
      } else {
        window.scrollTo({ top: saved.scrollY, behavior: 'instant' });
      }
    }

    issuesStore.initializeRealtime();
    meetingsStore.load();
    meetingsStore.initializeRealtime();

    // Start tracking scroll position.  Must be added after the restore scroll
    // above so the restore itself doesn't trigger a spurious save.
    window.addEventListener('scroll', onIssuesScroll, { passive: true });
  });

  onDestroy(() => {
    // Stop tracking scroll.
    window.removeEventListener('scroll', onIssuesScroll);
    clearTimeout(scrollSaveTimer);
    // scrollY and topIssueId were saved continuously by the scroll listener.
    // expandedSections is a local var — still valid here — merge it in.
    issuesUiState.update(s => ({ ...s, expandedSections }));
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

  function toggleSection(issueId, section) {
    if (!expandedSections[issueId]) {
      expandedSections[issueId] = { activities: false, actions: false };
    }
    expandedSections[issueId][section] = !expandedSections[issueId][section];
    expandedSections = expandedSections;
  }

  async function handleJumpToIssue(issueId) {
    const issue = issues.find(i => i.id === issueId);
    if (!issue) return;
    // Switch to the status tab the issue lives in, clear any search
    statusFilter = issue.status || ISSUE_STATUS.CURRENT;
    searchTerm   = '';
    // Expand the issue so its activity log and actions are visible
    expandedSections[issueId] = { activities: true, actions: true };
    expandedSections = expandedSections;
    // Wait for the filtered list and expanded sections to re-render before scrolling
    await tick();
    await tick();
    const el = document.getElementById(`issue-${issueId}`);
    if (!el) return;
    // Scroll so the issue title sits just below the sticky header.
    // Offset = fixed nav (64px) + sticky tab+toolbar bar (≈76px) + 8px breathing room.
    const stickyBar = containerElement?.querySelector('.sticky');
    const stickyH   = stickyBar ? stickyBar.getBoundingClientRect().height : 76;
    const top = window.scrollY + el.getBoundingClientRect().top - 64 - stickyH - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    el.classList.add('ring-2', 'ring-purple-400', 'lh-jump-highlight');
    document.addEventListener(
      'click',
      () => el.classList.remove('ring-2', 'ring-purple-400', 'lh-jump-highlight'),
      { once: true, capture: true }
    );
  }

  async function handleJumpSelect() {
    if (!jumpToIssueId) return;
    await handleJumpToIssue(jumpToIssueId);
  }

  // Returns the id of the first issue element whose bottom edge is below the
  // sticky toolbar — i.e. the issue that's currently at the top of the view.
  // Uses document.querySelectorAll deliberately — containerElement may already
  // be null in onDestroy (Svelte 5 clears bind:this before lifecycle hooks run).
  function getTopIssueId() {
    // Fixed nav: 64px.  Sticky toolbar: ~76px.  Buffer: 8px.
    const threshold = 148;
    const els = document.querySelectorAll('[id^="issue-"]');
    for (const el of els) {
      if (el.getBoundingClientRect().bottom > threshold) {
        return el.id.replace('issue-', '');
      }
    }
    return null;
  }
</script>

<div class="app-container" bind:this={containerElement}>

  <!-- ─── Sticky header: tab bar + compact issues toolbar ──────────────── -->
  <!-- -mx-4 px-4 cancels exactly the px-4 on the outer <main> — no bleed on mobile -->
  <div class="sticky top-16 z-20 bg-slate-800 -mx-4 px-4 border-b border-slate-700/60 mb-4">

    <!-- Tab row -->
    <div class="flex items-stretch">
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
               {activeTab === 'issues'
                 ? 'text-white border-purple-500'
                 : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'}"
        on:click={() => setTab('issues')}
      >Issues</button>
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
               {activeTab === 'meetings'
                 ? 'text-white border-purple-500'
                 : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'}"
        on:click={() => { meetingTabTargetId = null; setTab('meetings'); }}
      >Team Meetings</button>
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
               {activeTab === 'reports'
                 ? 'text-white border-purple-500'
                 : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'}"
        on:click={() => setTab('reports')}
      >Reports</button>

      <!-- Active meeting indicator — right-aligned in the tab row -->
      {#if $meetingsStore.current}
        <div class="ml-auto flex items-center gap-1.5 self-center px-2.5 py-1 rounded
                    bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0"></span>
          <span class="text-amber-400/80">Team Meeting in Progress</span>
          <span class="font-medium truncate max-w-[18rem]">{$meetingsStore.current.title}</span>
        </div>
      {/if}
    </div>

    <!-- Toolbar (issues tab only) -->
    {#if activeTab === 'issues'}
      <!-- Desktop: single row (sm and above) -->
      <div class="hidden sm:flex items-center gap-2 py-2">
        <span class="text-xs text-slate-400 shrink-0 whitespace-nowrap">
          {filteredIssues.length} {filteredIssues.length === 1 ? 'issue' : 'issues'}
        </span>
        <select
          bind:value={statusFilter}
          class="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white
                 focus:outline-none focus:ring-1 focus:ring-purple-500 shrink-0"
        >
          {#each STATUS_FILTERS as f}
            <option value={f.value}>{f.label}</option>
          {/each}
        </select>
        <select
          bind:value={jumpToIssueId}
          on:change={handleJumpSelect}
          class="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white
                 focus:outline-none focus:ring-1 focus:ring-purple-500 flex-1 min-w-0"
        >
          <option value="">Jump to issue…</option>
          {#each jumpIssues as issue (issue.id)}
            <option value={issue.id}>{#if issue.issue_number}#{issue.issue_number} — {/if}{issue.name}</option>
          {/each}
        </select>
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Search…"
          class="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white
                 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500
                 flex-1 min-w-0"
        />
        <Button variant="primary" size="small" icon="plus"
          on:click={() => showNewIssueModal = true}>New Issue</Button>
      </div>

      <!-- Mobile: two rows (below sm) -->
      <div class="sm:hidden py-2 space-y-2">
        <!-- Row 1: count · status filter · New Issue -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400 shrink-0 whitespace-nowrap">
            {filteredIssues.length} {filteredIssues.length === 1 ? 'issue' : 'issues'}
          </span>
          <select
            bind:value={statusFilter}
            class="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white
                   focus:outline-none focus:ring-1 focus:ring-purple-500 shrink-0"
          >
            {#each STATUS_FILTERS as f}
              <option value={f.value}>{f.label}</option>
            {/each}
          </select>
          <span class="flex-1"></span>
          <Button variant="primary" size="small" icon="plus"
            on:click={() => showNewIssueModal = true}>New Issue</Button>
        </div>
        <!-- Row 2: jump-to issue · search -->
        <div class="flex items-center gap-2">
          <select
            bind:value={jumpToIssueId}
            on:change={handleJumpSelect}
            class="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white
                   focus:outline-none focus:ring-1 focus:ring-purple-500 flex-1 min-w-0"
          >
            <option value="">Jump to issue…</option>
            {#each jumpIssues as issue (issue.id)}
              <option value={issue.id}>{#if issue.issue_number}#{issue.issue_number} — {/if}{issue.name}</option>
            {/each}
          </select>
          <input
            type="text"
            bind:value={searchTerm}
            placeholder="Search…"
            class="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white
                   placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500
                   flex-1 min-w-0"
          />
        </div>
      </div>
    {/if}
  </div>

  <!-- ─── ISSUES TAB ──────────────────────────────────────────────────── -->
  {#if activeTab === 'issues'}

    <ErrorDisplay message={error} onDismiss={() => issuesStore.clearError()} />

    {#if loading}
      <LoadingSpinner />
    {:else if filteredIssues.length === 0}
      <div class="empty-state">
        No issues found. {searchTerm ? 'Try a different search.' : 'Click "New Issue" to create one.'}
      </div>
    {:else}
      <div class="section-spacing">
        {#each filteredIssues as issue (issue.id)}
          <div id="issue-{issue.id}">
          <IssueCard
            {issue}
            showActivity={expandedSections[issue.id]?.activities || false}
            showActions={expandedSections[issue.id]?.actions   || false}
            on:toggleActivity={() => toggleSection(issue.id, 'activities')}
            on:toggleActions={() => toggleSection(issue.id, 'actions')}
            on:edit={(e) => editingIssue = e.detail}
            on:delete={handleDeleteIssue}
            on:meetingFilter={handleMeetingBadgeClick}
          />
          </div>
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

