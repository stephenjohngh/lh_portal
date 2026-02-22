<!-- src/lib/apps/walk/WalkApp.svelte -->
<!-- Walk App — resume open session or start a new one. Reporting is in Plans > Inspections. -->
<script>
  import { onMount }       from 'svelte';
  import { getLogger }     from '$lib/utils/logger';
  import { permissions }   from '$lib/stores/permissions';
  import { auth }          from '$lib/stores/auth';
  import { walkStore }     from './stores/walkStore.js';
  import WalkSessionStart  from './components/WalkSessionStart.svelte';
  import WalkSession       from './components/WalkSession.svelte';

  const logger = getLogger('WalkApp');

  let screen    = 'loading';   // 'loading' | 'idle' | 'start' | 'walk'
  let initError = null;

  $: canEdit    = $permissions.isAdmin || $permissions.canModify;
  $: openSession = $walkStore.sessions.find(s => s.status === 'open') ?? null;

  onMount(async () => {
    try {
      if ($auth.user) await permissions.init($auth.user.id, 'walk');
      await walkStore.loadPlans();
      await walkStore.loadSessions();

      const state = getState();
      const open  = state.sessions.find(s => s.status === 'open');
      if (open) {
        await walkStore.resumeSession(open);
        screen = 'walk';
      } else {
        screen = 'idle';
      }
    } catch (err) {
      logger('Init error:', err.message);
      initError = err.message;
      screen = 'idle';
    }
  });

  function getState() {
    let s; walkStore.subscribe(v => { s = v; })(); return s;
  }

  async function handleResume() {
    const state = getState();
    const open  = state.sessions.find(s => s.status === 'open');
    if (!open) return;
    try {
      await walkStore.resumeSession(open);
      screen = 'walk';
    } catch (err) {
      initError = err.message;
    }
  }

  function handleSessionStarted() { screen = 'walk'; }
  function handleCancelStart()    { screen = 'idle'; }

  async function handleSessionClosed() {
    await walkStore.loadSessions();
    screen = 'idle';
  }
</script>

<div class="wa">

  {#if screen === 'loading'}
    <div class="wa-center">
      <div class="spinner"></div>
      <p class="wa-muted">Loading…</p>
    </div>

  {:else if screen === 'idle'}
    <div class="wa-idle">

      <div class="wa-head">
        <div class="wa-logo">◈ WALK</div>
        <div class="wa-sub">Building Inspection</div>
      </div>

      {#if initError}
        <div class="wa-error">⚠ {initError}</div>
      {/if}

      {#if openSession}
        <!-- Resume banner -->
        <div class="resume-card">
          <div class="resume-pulse"></div>
          <div class="resume-info">
            <div class="resume-label">SESSION IN PROGRESS</div>
            <div class="resume-detail">{openSession.building} · Floor {openSession.floor_level}</div>
            {#if openSession.session_name}
              <div class="resume-name">{openSession.session_name}</div>
            {/if}
          </div>
          <button class="resume-btn" on:click={handleResume}>RESUME →</button>
        </div>

      {:else if canEdit}
        <button class="start-card" on:click={() => screen = 'start'}>
          <span class="start-plus">+</span>
          <span class="start-label">START NEW SESSION</span>
          <span class="start-sub">Select floor and element type to begin</span>
        </button>

      {:else}
        <div class="wa-center wa-muted">
          <p>No active session.</p>
          <p class="wa-hint">Contact an admin to start a walk.</p>
        </div>
      {/if}

      <p class="wa-footer">Inspection history → Floor Plans app → Inspections</p>
    </div>

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
  {/if}

</div>

<style>
  .wa {
    font-family: 'DM Mono', 'Courier New', monospace;
    max-width: 480px;
    margin: 0 auto;
    min-height: calc(100vh - 64px);
    background: #0d0d14;
    color: #f0f0f0;
    display: flex;
    flex-direction: column;
  }

  /* ── Loading / error centred states ──────────────────────────────────── */
  .wa-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem 1.5rem;
  }

  .wa-muted { color: #888; font-size: 0.875rem; }
  .wa-hint  { color: #666; font-size: 0.8rem; margin-top: 0.25rem; }

  .spinner {
    width: 28px; height: 28px;
    border: 2px solid #2a2a3a;
    border-top-color: #fb923c;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Idle screen ──────────────────────────────────────────────────────── */
  .wa-idle {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 0 2rem;
  }

  .wa-head {
    padding: 2.5rem 1.5rem 1.5rem;
    border-bottom: 1px solid #1e1e2e;
  }
  .wa-logo {
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: #fb923c;
  }
  .wa-sub {
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    color: #888;
    text-transform: uppercase;
    margin-top: 0.25rem;
  }

  .wa-error {
    margin: 1rem 1.25rem 0;
    font-size: 0.825rem;
    color: #fca5a5;
    padding: 0.875rem 1rem;
    background: #2a0000;
    border: 1px solid #ef4444;
    border-radius: 8px;
  }

  /* ── Resume card ──────────────────────────────────────────────────────── */
  .resume-card {
    margin: 1.25rem 1.25rem 0;
    background: #0d1f0d;
    border: 2px solid #22c55e;
    border-radius: 10px;
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.875rem;
  }

  .resume-pulse {
    width: 10px; height: 10px;
    border-radius: 50%;
    background: #22c55e;
    flex-shrink: 0;
    animation: pulse 1.5s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.4; transform: scale(0.85); }
  }

  .resume-info { flex: 1; min-width: 0; }
  .resume-label {
    font-size: 0.6rem;
    letter-spacing: 0.15em;
    color: #22c55e;
    margin-bottom: 0.2rem;
  }
  .resume-detail { font-size: 0.9rem; color: #f0f0f0; font-weight: 600; }
  .resume-name   { font-size: 0.72rem; color: #aaa; margin-top: 0.1rem;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .resume-btn {
    background: #22c55e;
    color: #0a0a0f;
    border: none;
    border-radius: 8px;
    padding: 0.6rem 1rem;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .resume-btn:hover { background: #16a34a; }

  /* ── Start card ───────────────────────────────────────────────────────── */
  .start-card {
    margin: 1.25rem 1.25rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 2rem 1rem;
    background: transparent;
    border: 2px solid #fb923c;
    border-radius: 10px;
    color: #fb923c;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s;
  }
  .start-card:hover { background: #fb923c; color: #0a0a0f; }

  .start-plus  { font-size: 2rem; font-weight: 300; line-height: 1; }
  .start-label { font-size: 0.85rem; font-weight: 700; letter-spacing: 0.15em; }
  .start-sub   { font-size: 0.72rem; opacity: 0.75; letter-spacing: 0.05em; }

  /* ── Footer hint ──────────────────────────────────────────────────────── */
  .wa-footer {
    margin-top: auto;
    padding: 1.5rem 1.25rem 0;
    font-size: 0.68rem;
    color: #444;
    letter-spacing: 0.03em;
    text-align: center;
  }
</style>
