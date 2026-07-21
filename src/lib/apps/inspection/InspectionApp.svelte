<!-- src/lib/apps/inspection/InspectionApp.svelte -->
<!-- Inspection App — mobile-first inspection tool operating on the components data model -->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { get }           from 'svelte/store';
  import { getLogger }  from '$lib/utils/logger';
  import { permissions } from '$lib/stores/permissions';
  import { auth }       from '$lib/stores/auth';
  import { inspectionStore } from './stores/inspectionStore.js';
  import { startSync, stopSync } from './utils/syncRunner.js';
  import InspectionHome           from './components/InspectionHome.svelte';
  import InspectionSessionStart   from './components/InspectionSessionStart.svelte';
  import InspectionRepairStart    from './components/InspectionRepairStart.svelte';
  import InspectionSession        from './components/InspectionSession.svelte';
  import InspectionSessionSummary from './components/InspectionSessionSummary.svelte';
  import WalkError            from '$lib/apps/inspection/components/common/WalkError.svelte';


  const logger = getLogger('InspectionApp');

  // Screens: 'home' | 'start_session' | 'start_repair' | 'walk' | 'summary'
  let screen         = 'home';
  let sessionType    = 'test';    // passed to InspectionSessionStart
  let summarySession = null;
  let loading        = true;
  let initError      = null;

  $: canEdit = $permissions.isAdmin || $permissions.canModify;

  onMount(async () => {
    // Start the offline sync runner first: it wires the online/offline listener
    // and drains any inspections queued in a previous (offline) session as soon
    // as we're connected — independent of whether load() below succeeds.
    startSync();
    try {
      if ($auth.user) {
        await permissions.init($auth.user.id, 'inspection');
      }
      await inspectionStore.load();
      await inspectionStore.loadSessions();
    } catch (err) {
      logger('❌ Init error:', err.message);
      initError = err.message;
    } finally {
      loading = false;
    }
  });

  onDestroy(() => stopSync());

  async function handleResume(e) {
    try {
      await inspectionStore.resumeSession(e.detail.session);
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
    await inspectionStore.loadSessions();
    screen = 'home';
  }

  async function handleSessionPaused() {
    await inspectionStore.loadSessions();
    screen = 'home';
  }

  async function handleFinishRepair() {
    try {
      const state = get(inspectionStore);
      if (state.activeSession?.status === 'open') {
        await inspectionStore.closeSession(state.activeSession.id);
      }
    } catch (err) {
      logger('❌ Close repair session (non-fatal):', err.message);
    }
    await inspectionStore.loadSessions();
    screen = 'home';
  }

  async function handleBackToRepair() {
    await inspectionStore.load();
    screen = 'start_repair';
  }
</script>

<div class="inspection-app">
  {#if loading}
    <div class="inspection-loading">
      <div class="inspection-spinner"></div>
      <p>Loading…</p>
    </div>

  {:else if initError}
    <WalkError message={initError} />

  {:else if screen === 'home'}
    <InspectionHome
      {canEdit}
      on:startTest={() => { sessionType = 'test'; screen = 'start_session'; }}
      on:startInspection={() => { sessionType = 'inspection'; screen = 'start_session'; }}
      on:startRepair={() => screen = 'start_repair'}
      on:resume={handleResume}
      on:viewSummary={handleViewSummary}
    />

  {:else if screen === 'start_session'}
    <InspectionSessionStart
      {sessionType}
      on:started={() => screen = 'walk'}
      on:cancel={() => screen = 'home'}
    />

  {:else if screen === 'start_repair'}
    <InspectionRepairStart
      on:started={() => screen = 'walk'}
      on:finish={handleFinishRepair}
      on:back={() => screen = 'home'}
    />

  {:else if screen === 'walk'}
    <InspectionSession
      {canEdit}
      on:paused={handleSessionPaused}
      on:closed={handleSessionClosed}
      on:backtorepair={handleBackToRepair}
    />

  {:else if screen === 'summary' && summarySession}
    <InspectionSessionSummary
      session={summarySession}
      on:back={() => { summarySession = null; screen = 'home'; }}
    />
  {/if}
</div>

<style>
  .inspection-app {
    min-height: 100vh;
    background: #0d0d14;
    color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
    display: flex;
    flex-direction: column;
    max-width: 480px;
    margin: 0 auto;
  }

  .inspection-loading {
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

  .inspection-spinner {
    width: 32px; height: 32px;
    border: 2px solid #2e2e42;
    border-top-color: #fb923c;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
