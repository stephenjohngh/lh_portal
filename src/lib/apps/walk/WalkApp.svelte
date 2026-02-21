<!-- src/lib/apps/walk/WalkApp.svelte -->
<!-- Walk App — mobile-first building inspection tool -->
<script>
  import { onMount } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { permissions } from '$lib/stores/permissions';
  import { auth } from '$lib/stores/auth';
  import { walkStore } from './stores/walkStore.js';
  import WalkHome           from './components/WalkHome.svelte';
  import WalkSessionSummary from './components/WalkSessionSummary.svelte';
  import WalkSessionStart from './components/WalkSessionStart.svelte';
  import WalkSession from './components/WalkSession.svelte';

  const logger = getLogger('WalkApp');

  // Screen: 'home' | 'start' | 'walk' | 'summary'
  let screen    = 'home';
  let summarySession = null;
  let loading   = true;
  let initError = null;

  $: canEdit   = $permissions.isAdmin || $permissions.canModify;
  $: isReadOnly = !$permissions.loading && !$permissions.isAdmin && !$permissions.canModify;

  onMount(async () => {
    logger('Walk app mounting');
    try {
      if ($auth.user) {
        await permissions.init($auth.user.id, 'walk');
      }
      await walkStore.loadPlans();
      await walkStore.loadSessions();

      // If there's already an open session, go straight to the walk screen
      const state = getState();
      const openSession = state.sessions.find(s => s.status === 'open');
      if (openSession) {
        await walkStore.resumeSession(openSession);
        screen = 'walk';
      }
    } catch (error) {
      logger('❌ Init error:', error.message);
      initError = error.message;
    } finally {
      loading = false;
    }
  });

  function getState() {
    let state;
    walkStore.subscribe(s => { state = s; })();
    return state;
  }

  function handleStartNew() {
    screen = 'start';
  }

  async function handleResume(event) {
    const session = event.detail.session;
    try {
      await walkStore.resumeSession(session);
      screen = 'walk';
    } catch (error) {
      logger('❌ Resume failed:', error.message);
    }
  }

  async function handleSessionStarted() {
    screen = 'walk';
  }

  function handleCancelStart() {
    screen = 'home';
  }

  function handleViewSummary(event) {
    summarySession = event.detail.session;
    screen = 'summary';
  }

  async function handleSessionClosed() {
    await walkStore.loadSessions();
    screen = 'home';
  }
</script>

<div class="walk-app">
  {#if loading}
    <div class="walk-loading">
      <div class="walk-loading-spinner"></div>
      <p>Loading...</p>
    </div>

  {:else if initError}
    <div class="walk-error">
      <div class="walk-error-icon">⚠</div>
      <p>Failed to load: {initError}</p>
    </div>

  {:else if screen === 'home'}
    <WalkHome
      {canEdit}
      on:startNew={handleStartNew}
      on:resume={handleResume}
      on:viewSummary={handleViewSummary}
    />

  {:else if screen === 'start'}
    <WalkSessionStart
      on:started={handleSessionStarted}
      on:cancel={handleCancelStart}
    />

  {:else if screen === 'walk'}
    <WalkSession
      {canEdit}
      on:closed={handleSessionClosed}
    />

  {:else if screen === 'summary' && summarySession}
    <WalkSessionSummary
      session={summarySession}
      on:back={() => { summarySession = null; screen = 'home'; }}
    />
  {/if}
</div>

<style>
  .walk-app {
    /* Full viewport on mobile, centred narrow column on desktop */
    min-height: 100vh;
    background: #0a0a0f;
    color: #e8e8e0;
    font-family: 'DM Mono', 'Courier New', monospace;
    display: flex;
    flex-direction: column;
    max-width: 480px;
    margin: 0 auto;
  }

  .walk-loading,
  .walk-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 1rem;
    color: #888;
    font-size: 0.875rem;
    letter-spacing: 0.05em;
  }

  .walk-loading-spinner {
    width: 32px;
    height: 32px;
    border: 2px solid #333;
    border-top-color: #f97316;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .walk-error-icon {
    font-size: 2rem;
    color: #ef4444;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
