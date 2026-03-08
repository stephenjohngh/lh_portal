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
  import WalkSessionStart   from './components/WalkSessionStart.svelte';
  import WalkSession        from './components/WalkSession.svelte';

  const logger = getLogger('WalkApp');

  // Screen: 'home' | 'start' | 'walk' | 'summary'
  let screen         = 'home';
  let summarySession = null;
  let loading        = true;
  let initError      = null;

  $: canEdit    = $permissions.isAdmin || $permissions.canModify;

  onMount(async () => {
    logger('Walk app mounting');
    try {
      if ($auth.user) {
        await permissions.init($auth.user.id, 'walk');
      }
      await walkStore.loadPlans();
      await walkStore.loadSessions();

      const state = getState();
      const openSession = state.sessions.find(s => s.status === 'open');
      if (openSession) {
        await walkStore.resumeSession(openSession);
        screen = 'walk';
      }
    } catch (error) {
      logger('❌ Init error:', error.message);
console.error('WALK INIT ERROR:', error);  // add this
  alert('Init error: ' + error.message);  
      initError = error.message;
    } finally {
      loading = false;
    }
  });

  function getState() {
    let s; walkStore.subscribe(v => { s = v; })(); return s;
  }

  async function handleResume(event) {
    try {
      await walkStore.resumeSession(event.detail.session);
      screen = 'walk';
    } catch (err) {
      logger('❌ Resume failed:', err.message);
    }
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
      <div class="walk-spinner"></div>
      <p>Loading…</p>
    </div>

  {:else if initError}
    <div class="walk-error">
      <div class="walk-error-icon">⚠</div>
      <p>{initError}</p>
    </div>

  {:else if screen === 'home'}
    <WalkHome
      {canEdit}
      on:startNew={() => screen = 'start'}
      on:resume={handleResume}
      on:viewSummary={handleViewSummary}
    />

  {:else if screen === 'start'}
    <WalkSessionStart
      on:started={() => screen = 'walk'}
      on:cancel={() => screen = 'home'}
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
    min-height: 100vh;
    background: #0d0d14;
    color: #f0f0f0;
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
    color: #bbb;
    font-size: 0.875rem;
    letter-spacing: 0.05em;
  }

  .walk-spinner {
    width: 32px; height: 32px;
    border: 2px solid #2e2e42;
    border-top-color: #fb923c;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .walk-error-icon { font-size: 2rem; color: #f87171; }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
