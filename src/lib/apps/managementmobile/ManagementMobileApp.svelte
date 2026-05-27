<script>
  // src/lib/apps/managementmobile/ManagementMobileApp.svelte
  // Mobile-first read-only issues viewer.
  // Screen states: 'list' → 'detail'
  // Reuses issuesStore (singleton) — no mutations.

  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { issuesStore } from '../management/stores/issuesStore.js';
  import IssueList       from './components/IssueList.svelte';
  import IssueDetailScreen from './components/IssueDetailScreen.svelte';

  const dispatch = createEventDispatcher();

  // -- Navigation -------------------------------------------------------
  let screen        = 'list';   // 'list' | 'detail'
  let selectedIssue = null;

  // -- Store state ------------------------------------------------------
  let issues  = [];
  let loading = false;
  let error   = '';

  const unsub = issuesStore.subscribe(s => {
    issues  = s.issues;
    loading = s.loading;
    error   = s.error;
    // Keep selected issue in sync with realtime updates
    if (selectedIssue) {
      const updated = s.issues.find(i => i.id === selectedIssue.id);
      if (updated) {
        selectedIssue = updated;
      } else if (!s.loading) {
        // Issue was deleted while viewing — return to list
        goBack();
      }
    }
  });

  onMount(async () => {
    if ($auth.user) {
      await permissions.init($auth.user.id, 'managementmobile');
    }
    issuesStore.fetchIssues();
    issuesStore.initializeRealtime();
  });

  onDestroy(() => {
    unsub();
    issuesStore.cleanup();
  });

  // -- Navigation handlers ----------------------------------------------

  function openIssue(e) {
    selectedIssue = e.detail;
    screen = 'detail';
  }

  function goBack() {
    selectedIssue = null;
    screen = 'list';
  }

  function goHome() {
    dispatch('navigate', 'home');
  }
</script>

<div class="app-shell">
  {#if screen === 'list'}
    <IssueList
      {issues}
      {loading}
      {error}
      on:select={openIssue}
      on:home={goHome}
    />
  {:else if screen === 'detail' && selectedIssue}
    <IssueDetailScreen
      issue={selectedIssue}
      on:back={goBack}
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
