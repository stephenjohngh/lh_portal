<!-- src/lib/apps/walk/components/WalkHome.svelte -->
<!-- Home screen: open session banner + recent sessions + start new -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { walkStore } from '../stores/walkStore.js';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';
  import { fmtDate, fmtTime } from '$lib/utils/dates';

  const dispatch = createEventDispatcher();

  export let canEdit = false;

  $: sessions       = $walkStore.sessions;
  $: openSession    = sessions.find(s => s.status === 'open');
  $: closedSessions = sessions.filter(s => s.status === 'closed').slice(0, 8);

  function typeLabel(t) { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t; }
  function typeIcon(t)  { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.icon  ?? '■'; }
</script>

<div class="home">

  <div class="home-hdr">
    <div class="home-logo">◈ WALK</div>
    <div class="home-tagline">Building Inspection</div>
  </div>

  <!-- Open session banner -->
  {#if openSession}
    <div class="open-banner">
      <div class="pulse"></div>
      <div class="open-info">
        <div class="open-label">SESSION IN PROGRESS</div>
        <div class="open-name">
          {openSession.session_name || (typeIcon(openSession.element_type) + ' ' + openSession.building + ' · F' + openSession.floor_level)}
        </div>
        <div class="open-meta">
          {#if openSession.inspector_name}
            <span class="open-inspector">{openSession.inspector_name}</span>
            <span class="dot-sep">·</span>
          {/if}
          Started {fmtDate(openSession.started_at)} at {fmtTime(openSession.started_at)}
        </div>
      </div>
      <button class="resume-btn" on:click={() => dispatch('resume', { session: openSession })}>
        RESUME →
      </button>
    </div>
  {/if}

  <!-- Start new -->
  {#if canEdit}
    <div class="sect">
      <button class="start-btn" on:click={() => dispatch('startNew')}
              disabled={!!openSession}
              title={openSession ? 'Close the active session first' : ''}>
        <span class="start-plus">+</span>
        <span>START NEW SESSION</span>
      </button>
      {#if openSession}
        <p class="start-hint">Close the active session first</p>
      {/if}
    </div>
  {/if}

  <!-- Recent sessions -->
  {#if closedSessions.length > 0}
    <div class="sect">
      <div class="sect-title">RECENT SESSIONS</div>
      <div class="session-list">
        {#each closedSessions as s (s.id)}
          <button class="scard" on:click={() => dispatch('viewSummary', { session: s })}>
            <div class="scard-icon">{typeIcon(s.element_type)}</div>
            <div class="scard-body">
              <div class="scard-name">{s.session_name || (typeLabel(s.element_type) + ' · ' + s.building)}</div>
              <div class="scard-loc">{s.building} · Floor {s.floor_level}</div>
              <div class="scard-meta">
                {fmtDate(s.started_at)}
                {#if s.closed_at}<span class="scard-arr">→</span>{fmtTime(s.closed_at)}{/if}
                {#if s.inspector_name}<span class="scard-who">· {s.inspector_name}</span>{/if}
              </div>
            </div>
            <span class="scard-chev">›</span>
          </button>
        {/each}
      </div>
    </div>
  {:else if !openSession}
    <div class="empty">
      <div class="empty-icon">◫</div>
      <div class="empty-txt">No sessions yet</div>
      <div class="empty-sub">Start a new session to begin inspecting</div>
    </div>
  {/if}

</div>

<style>
  .home {
    display: flex; flex-direction: column;
    min-height: 100vh; padding-bottom: 2rem;
    background: #0d0d14; color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
  }

  /* ── Header ───────────────────────────────────────────────────────────────*/
  .home-hdr { padding: 2.5rem 1.5rem 1.5rem; border-bottom: 1px solid #2e2e42; }
  .home-logo { font-size: 1.75rem; font-weight: 800; letter-spacing: 0.15em; color: #fb923c; }
  .home-tagline { font-size: 0.7rem; letter-spacing: 0.2em; color: #ccc; margin-top: 0.25rem; }

  /* ── Open session banner ──────────────────────────────────────────────────*/
  .open-banner {
    margin: 1.25rem 1.25rem 0;
    background: #0a1f0a; border: 2px solid #22c55e; border-radius: 10px;
    padding: 1rem 1.125rem; display: flex; align-items: center; gap: 0.875rem;
  }
  .pulse {
    width: 10px; height: 10px; border-radius: 50%; background: #22c55e; flex-shrink: 0;
    animation: pulse 1.5s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.4; transform: scale(0.85); }
  }
  .open-info { flex: 1; min-width: 0; }
  .open-label { font-size: 0.6rem; letter-spacing: 0.15em; color: #4ade80; margin-bottom: 0.25rem; }
  .open-name  { font-size: 0.9rem; color: #f0f0f0; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .open-meta  { font-size: 0.7rem; color: #ccc; margin-top: 0.2rem; }
  .open-inspector { color: #fb923c; }
  .dot-sep { margin: 0 0.25rem; color: #888; }
  .resume-btn {
    background: #22c55e; color: #0a0a0f; border: none; border-radius: 7px;
    padding: 0.6rem 1rem; font-family: inherit; font-size: 0.72rem; font-weight: 800;
    letter-spacing: 0.12em; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: background 0.15s;
  }
  .resume-btn:hover { background: #16a34a; }

  /* ── Sections ─────────────────────────────────────────────────────────────*/
  .sect       { padding: 1.25rem 1.25rem 0; }
  .sect-title { font-size: 0.65rem; letter-spacing: 0.2em; color: #ccc; margin-bottom: 0.875rem; }

  /* ── Start button ─────────────────────────────────────────────────────────*/
  .start-btn {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.75rem;
    padding: 1.25rem; background: transparent; border: 2px solid #fb923c; border-radius: 10px;
    color: #fb923c; font-family: inherit; font-size: 0.82rem; font-weight: 800;
    letter-spacing: 0.15em; cursor: pointer; transition: all 0.15s;
  }
  .start-btn:hover:not(:disabled) { background: #fb923c; color: #0a0a0f; }
  .start-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .start-plus { font-size: 1.35rem; font-weight: 300; }
  .start-hint { text-align: center; font-size: 0.72rem; color: #ccc; margin-top: 0.5rem; }

  /* ── Session cards ────────────────────────────────────────────────────────*/
  .session-list { display: flex; flex-direction: column; gap: 0.625rem; }
  .scard {
    width: 100%; display: flex; align-items: center; gap: 0.875rem;
    padding: 0.875rem 1rem; text-align: left;
    background: #111122; border: 2px solid #2e2e42; border-radius: 10px;
    cursor: pointer; font-family: inherit; transition: border-color 0.15s;
  }
  .scard:hover { border-color: #fb923c; }
  .scard-icon { font-size: 1.35rem; flex-shrink: 0; }
  .scard-body { flex: 1; min-width: 0; }
  .scard-name { font-size: 0.875rem; color: #f0f0f0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .scard-loc  { font-size: 0.75rem; color: #ccc; margin-top: 0.1rem; }
  .scard-meta { font-size: 0.7rem; color: #bbb; margin-top: 0.15rem; }
  .scard-arr  { margin: 0 0.25rem; color: #888; }
  .scard-who  { color: #fb923c; }
  .scard-chev { font-size: 1.35rem; color: #666; flex-shrink: 0; transition: color 0.15s; }
  .scard:hover .scard-chev { color: #fb923c; }

  /* ── Empty ────────────────────────────────────────────────────────────────*/
  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem 2rem; gap: 0.5rem; }
  .empty-icon { font-size: 3rem; color: #3e3e58; }
  .empty-txt  { font-size: 0.875rem; color: #ccc; letter-spacing: 0.05em; }
  .empty-sub  { font-size: 0.75rem; color: #bbb; text-align: center; }
</style>
