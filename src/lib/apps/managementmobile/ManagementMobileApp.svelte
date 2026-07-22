<script>
  // src/lib/apps/managementmobile/ManagementMobileApp.svelte
  // Mobile-first read-only viewer for issues AND team meetings.
  // Screens: 'list' → 'detail'  ·  'meetings' → 'meeting'
  // Reuses issuesStore + meetingsStore (singletons) — no mutations.

  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { issuesStore }   from '../management/stores/issuesStore.js';
  import { meetingsStore } from '../management/stores/meetingsStore.js';
  import IssueList        from './components/IssueList.svelte';
  import IssueDetailScreen from './components/IssueDetailScreen.svelte';
  import MeetingsScreen   from './components/MeetingsScreen.svelte';
  import MeetingScreen    from './components/MeetingScreen.svelte';

  const dispatch = createEventDispatcher();

  // -- Navigation -------------------------------------------------------
  let screen         = 'list';   // 'list' | 'detail' | 'meetings' | 'meeting'
  let selectedIssue  = null;
  let selectedMeeting = null;
  let detailFrom     = 'list';   // where the issue detail's back returns to
  let meetingFrom    = 'list';   // where the meeting screen's back returns to

  // -- Store state ------------------------------------------------------
  let issues  = [];
  let loading = false;
  let error   = '';
  let meetings = [];
  let currentMeeting = null;

  const unsub = issuesStore.subscribe(s => {
    issues  = s.issues;
    loading = s.loading;
    error   = s.error;
    if (selectedIssue) {
      const updated = s.issues.find(i => i.id === selectedIssue.id);
      if (updated) selectedIssue = updated;
      else if (!s.loading && screen === 'detail') goList();   // deleted while viewing
    }
  });

  const unsubMeetings = meetingsStore.subscribe(s => {
    meetings = s.list;
    currentMeeting = s.current;
    if (selectedMeeting) {
      selectedMeeting = s.list.find(m => m.id === selectedMeeting.id) ?? selectedMeeting;
    }
  });

  onMount(async () => {
    if ($auth.user) {
      await permissions.init($auth.user.id, 'managementmobile');
    }
    issuesStore.fetchIssues();
    issuesStore.initializeRealtime();
    meetingsStore.load();
    meetingsStore.initializeRealtime();
  });

  onDestroy(() => {
    unsub();
    unsubMeetings();
    issuesStore.cleanup();
    meetingsStore.cleanup();
  });

  // -- Navigation handlers ----------------------------------------------

  function openIssue(issue, from = 'list') {
    selectedIssue = issue;
    detailFrom    = from;
    screen        = 'detail';
  }
  function openMeetings() { screen = 'meetings'; }
  function openMeeting(meetingId, from = 'list') {
    const m = meetings.find(x => x.id === meetingId);
    if (!m) return;
    selectedMeeting = m;
    meetingFrom     = from;
    screen          = 'meeting';
  }

  function goList()     { selectedIssue = null; screen = 'list'; }
  function backDetail() { screen = detailFrom; if (detailFrom !== 'meeting') selectedIssue = null; }
  function backMeeting(){ screen = meetingFrom; }

  function goHome() { dispatch('navigate', 'home'); }
</script>

<div class="app-shell">
  {#if screen === 'list'}
    <IssueList
      {issues} {loading} {error} {meetings} {currentMeeting}
      on:select={(e) => openIssue(e.detail, 'list')}
      on:openMeeting={(e) => openMeeting(e.detail, 'list')}
      on:meetings={openMeetings}
      on:home={goHome}
    />
  {:else if screen === 'detail' && selectedIssue}
    <IssueDetailScreen
      issue={selectedIssue} {meetings}
      on:openMeeting={(e) => openMeeting(e.detail, 'detail')}
      on:back={backDetail}
    />
  {:else if screen === 'meetings'}
    <MeetingsScreen
      {meetings} {issues}
      on:select={(e) => openMeeting(e.detail.id, 'meetings')}
      on:back={goList}
    />
  {:else if screen === 'meeting' && selectedMeeting}
    <MeetingScreen
      meeting={selectedMeeting} {issues}
      on:openIssue={(e) => openIssue(e.detail, 'meeting')}
      on:back={backMeeting}
    />
  {/if}
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&display=swap');

  :global(body) {
    background: #0d0d14;
    margin: 0;
    padding: 0;
  }

  .app-shell {
    position: fixed;
    inset: 0;
    background: #0d0d14;
    font-family: 'DM Mono', monospace;
    color: #e2e8f0;
    overflow: hidden;
    z-index: 100;
    display: flex;
    flex-direction: column;
  }
</style>
