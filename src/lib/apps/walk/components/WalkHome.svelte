<!-- src/lib/apps/walk/components/WalkHome.svelte -->
<!-- Home screen: recent sessions + start new -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';

  const logger = getLogger('WalkHome');
  const dispatch = createEventDispatcher();

  export let canEdit = false;

  $: sessions     = $walkStore.sessions;
  $: openSession  = sessions.find(s => s.status === 'open');
  $: closedSessions = sessions.filter(s => s.status === 'closed').slice(0, 8);

  function typeLabel(type) {
    return ELEMENT_TYPE_OPTIONS.find(t => t.value === type)?.label ?? type;
  }

  function typeIcon(type) {
    return ELEMENT_TYPE_OPTIONS.find(t => t.value === type)?.icon ?? '■';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function handleStartNew() {
    dispatch('startNew');
  }

  function handleResume() {
    dispatch('resume', { session: openSession });
  }

  function handleResumeSession(session) {
    dispatch('resume', { session });
  }

  function handleViewSummary(session) {
    dispatch('viewSummary', { session });
  }
</script>

<div class="home">

  <!-- Header -->
  <div class="home-header">
    <div class="home-logo">◈ WALK</div>
    <div class="home-tagline">Building Inspection</div>
  </div>

  <!-- Open session banner -->
  {#if openSession}
    <div class="open-session-banner">
      <div class="open-session-pulse"></div>
      <div class="open-session-info">
        <div class="open-session-label">SESSION IN PROGRESS</div>
        <div class="open-session-detail">
          {typeIcon(openSession.element_type)}
          {typeLabel(openSession.element_type)} ·
          {openSession.building} · Floor {openSession.floor_level}
        </div>
        <div class="open-session-date">
          Started {formatDate(openSession.started_at)} at {formatTime(openSession.started_at)}
        </div>
      </div>
      <button class="resume-btn" on:click={handleResume}>
        RESUME →
      </button>
    </div>
  {/if}

  <!-- Start new session -->
  {#if canEdit}
    <div class="section">
      <button
        class="start-btn"
        on:click={handleStartNew}
        disabled={!!openSession}
        title={openSession ? 'Close the current session before starting a new one' : ''}
      >
        <span class="start-btn-icon">+</span>
        <span>START NEW SESSION</span>
      </button>
      {#if openSession}
        <p class="start-hint">Close the active session first</p>
      {/if}
    </div>
  {/if}

  <!-- Recent sessions -->
  {#if closedSessions.length > 0}
    <div class="section">
      <div class="section-title">RECENT SESSIONS</div>
      <div class="session-list">
        {#each closedSessions as session (session.id)}
          <button class="session-card session-card-clickable" on:click={() => handleViewSummary(session)}>
            <div class="session-card-icon">{typeIcon(session.element_type)}</div>
            <div class="session-card-body">
              <div class="session-card-type">{typeLabel(session.element_type)}</div>
              <div class="session-card-location">
                {session.building} · Floor {session.floor_level}
              </div>
              <div class="session-card-date">
                {formatDate(session.started_at)}
                {#if session.closed_at}
                  → {formatTime(session.closed_at)}
                {/if}
              </div>
            </div>
            <div class="session-card-chevron">›</div>
          </button>
        {/each}
      </div>
    </div>
  {:else if !openSession}
    <div class="empty-state">
      <div class="empty-icon">◫</div>
      <div class="empty-text">No sessions yet</div>
      <div class="empty-sub">Start a new session to begin inspecting</div>
    </div>
  {/if}

</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 64px);
    padding-bottom: 2rem;
  }

  /* ── Header ─────────────────────────────────────────────────────────── */
  .home-header {
    padding: 2.5rem 1.5rem 1.5rem;
    border-bottom: 1px solid #1e1e2a;
  }

  .home-logo {
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: #f97316;
  }

  .home-tagline {
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    color: #555;
    text-transform: uppercase;
    margin-top: 0.25rem;
  }

  /* ── Open session banner ─────────────────────────────────────────────── */
  .open-session-banner {
    margin: 1.25rem 1.25rem 0;
    background: #0f1a0f;
    border: 1px solid #22c55e;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .open-session-pulse {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #22c55e;
    flex-shrink: 0;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.4; transform: scale(0.85); }
  }

  .open-session-info { flex: 1; min-width: 0; }

  .open-session-label {
    font-size: 0.6rem;
    letter-spacing: 0.15em;
    color: #22c55e;
    margin-bottom: 0.2rem;
  }

  .open-session-detail {
    font-size: 0.85rem;
    color: #e8e8e0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .open-session-date {
    font-size: 0.7rem;
    color: #555;
    margin-top: 0.2rem;
  }

  .resume-btn {
    background: #22c55e;
    color: #0a0a0f;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 0.875rem;
    font-family: inherit;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .resume-btn:hover { background: #16a34a; }

  /* ── Sections ────────────────────────────────────────────────────────── */
  .section {
    padding: 1.25rem 1.25rem 0;
  }

  .section-title {
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    color: #444;
    margin-bottom: 0.875rem;
  }

  /* ── Start button ────────────────────────────────────────────────────── */
  .start-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1.25rem;
    background: transparent;
    border: 1px solid #f97316;
    border-radius: 8px;
    color: #f97316;
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    cursor: pointer;
    transition: all 0.15s;
  }

  .start-btn:hover:not(:disabled) {
    background: #f97316;
    color: #0a0a0f;
  }

  .start-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .start-btn-icon {
    font-size: 1.25rem;
    font-weight: 300;
  }

  .start-hint {
    text-align: center;
    font-size: 0.7rem;
    color: #444;
    margin-top: 0.5rem;
  }

  /* ── Session list ────────────────────────────────────────────────────── */
  .session-list {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .session-card {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.875rem 1rem;
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
  }

  .session-card-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .session-card-body { flex: 1; min-width: 0; }

  .session-card-type {
    font-size: 0.825rem;
    color: #e8e8e0;
    font-weight: 500;
  }

  .session-card-location {
    font-size: 0.75rem;
    color: #666;
    margin-top: 0.1rem;
  }

  .session-card-date {
    font-size: 0.7rem;
    color: #444;
    margin-top: 0.15rem;
  }

  .session-card-status {
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .session-card-clickable {
    width: 100%;
    text-align: left;
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s;
    padding: 0.875rem 1rem;
  }
  .session-card-clickable:hover { border-color: #f97316; }

  .session-card-chevron {
    font-size: 1.25rem;
    color: #333;
    flex-shrink: 0;
    transition: color 0.15s;
  }
  .session-card-clickable:hover .session-card-chevron { color: #f97316; }

  /* ── Empty state ─────────────────────────────────────────────────────── */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    gap: 0.5rem;
    color: #333;
  }

  .empty-icon { font-size: 3rem; }

  .empty-text {
    font-size: 0.875rem;
    color: #444;
    letter-spacing: 0.05em;
  }

  .empty-sub {
    font-size: 0.75rem;
    color: #333;
    text-align: center;
  }
</style>
