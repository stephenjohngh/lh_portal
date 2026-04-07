<!-- src/lib/apps/v2walk/V2WalkApp.svelte -->
<!-- V2 Walk App — mobile-first inspection tool using the v2 component data model -->
<script>
  import { onMount } from 'svelte';
  import { getLogger }  from '$lib/utils/logger';
  import { permissions } from '$lib/stores/permissions';
  import { auth }       from '$lib/stores/auth';
  import { v2walkStore } from './stores/v2walkStore.js';
  import V2WalkHome           from './components/V2WalkHome.svelte';
  import V2WalkSessionStart   from './components/V2WalkSessionStart.svelte';
  import V2WalkRepairStart    from './components/V2WalkRepairStart.svelte';
  import V2WalkSession        from './components/V2WalkSession.svelte';
  import V2WalkSessionSummary from './components/V2WalkSessionSummary.svelte';
  import WalkError            from '$lib/apps/v2walk/components/common/WalkError.svelte';


  const logger = getLogger('V2WalkApp');

  // Screens: 'home' | 'start_session' | 'start_repair' | 'walk' | 'summary'
  let screen         = 'home';
  let sessionType    = 'test';    // passed to V2WalkSessionStart
  let summarySession = null;
  let loading        = true;
  let initError      = null;

  $: canEdit = $permissions.isAdmin || $permissions.canModify;

  onMount(async () => {
    try {
      if ($auth.user) {
        await permissions.init($auth.user.id, 'v2walk');
      }
      await v2walkStore.load();
      await v2walkStore.loadSessions();
    } catch (err) {
      logger('❌ Init error:', err.message);
      initError = err.message;
    } finally {
      loading = false;
    }
  });

  async function handleResume(e) {
    try {
      await v2walkStore.resumeSession(e.detail.session);
      screen = 'walk';
    } catch (err) {
      logger('❌ Resume failed:', err.message);
    }
  }

  function handleViewSummary(e) {
    summarySession = e.detail.session;
    screen = 'summary';
  }

  async function handleSessionClosed() {
    await v2walkStore.loadSessions();
    screen = 'home';
  }

  async function handleSessionPaused() {
    await v2walkStore.loadSessions();
    screen = 'home';
  }

  async function handleFinishRepair() {
    try {
      const state = (() => { let s; v2walkStore.subscribe(v => { s = v; })(); return s; })();
      if (state.activeSession?.status === 'open') {
        await v2walkStore.closeSession(state.activeSession.id);
      }
    } catch (err) {
      logger('❌ Close repair session (non-fatal):', err.message);
    }
    await v2walkStore.loadSessions();
    screen = 'home';
  }

  async function handleBackToRepair() {
    await v2walkStore.load();
    screen = 'start_repair';
  }
</script>

<div class="v2walk-app">
  {#if loading}
    <div class="v2walk-loading">
      <div class="v2walk-spinner"></div>
      <p>Loading…</p>
    </div>

  {:else if initError}
    <WalkError message={initError} />

  {:else if screen === 'home'}
    <V2WalkHome
      {canEdit}
      on:startTest={() => { sessionType = 'test'; screen = 'start_session'; }}
      on:startInspection={() => { sessionType = 'inspection'; screen = 'start_session'; }}
      on:startRepair={() => screen = 'start_repair'}
      on:resume={handleResume}
      on:viewSummary={handleViewSummary}
    />

  {:else if screen === 'start_session'}
    <V2WalkSessionStart
      {sessionType}
      on:started={() => screen = 'walk'}
      on:cancel={() => screen = 'home'}
    />

  {:else if screen === 'start_repair'}
    <V2WalkRepairStart
      on:started={() => screen = 'walk'}
      on:finish={handleFinishRepair}
      on:back={() => screen = 'home'}
    />

  {:else if screen === 'walk'}
    <V2WalkSession
      {canEdit}
      on:paused={handleSessionPaused}
      on:closed={handleSessionClosed}
      on:backtorepair={handleBackToRepair}
    />

  {:else if screen === 'summary' && summarySession}
    <V2WalkSessionSummary
      session={summarySession}
      on:back={() => { summarySession = null; screen = 'home'; }}
    />
  {/if}
</div>

<style>
  .v2walk-app {
    min-height: 100vh;
    background: #0d0d14;
    color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
    display: flex;
    flex-direction: column;
    max-width: 480px;
    margin: 0 auto;
  }

  .v2walk-loading {
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

  .v2walk-spinner {
    width: 32px; height: 32px;
    border: 2px solid #2e2e42;
    border-top-color: #fb923c;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
