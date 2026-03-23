<!-- src/lib/apps/walk/components/WalkHome.svelte -->
<!-- Home screen: open sessions + start buttons + recent closed sessions -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { walkStore } from '../stores/walkStore.js';
  import { fmtDate, fmtTime, fmtDuration } from '$lib/utils/dates';
  import { getTypeLabel, getTypeIcon, sessionFloorLabel } from '../utils/walkHelpers.js';

  const dispatch = createEventDispatcher();

  export let canEdit = false;

  $: sessions       = $walkStore.sessions;
  $: openSessions   = sessions.filter(s => s.status === 'open');
  $: closedSessions = sessions.filter(s => s.status === 'closed').slice(0, 6);
</script>

<div class="home">

  <div class="home-hdr">
    <div class="home-logo">◈ INSPECTION WALK</div>
    <div class="home-tagline">Building Inspection</div>
  </div>

  <!-- ── Start buttons ──────────────────────────────────────────────────────── -->
  {#if canEdit}
    <div class="sect">
      <button class="start-btn start-test" on:click={() => dispatch('startTest')}>
        <span class="start-plus">+</span>
        <div class="start-text">
          <div class="start-label">START PERIODIC TEST SESSION</div>
          <div class="start-sub">Mandatory Testing of Safety Systems</div>
        </div>
      </button>
      <button class="start-btn start-inspection" on:click={() => dispatch('startInspection')}>
        <span class="start-plus">+</span>
        <div class="start-text">
          <div class="start-label">START GENERAL INSPECTION</div>
          <div class="start-sub">Additional Checks on Building Inventory</div>
        </div>
      </button>
      <button class="start-btn start-repair" on:click={() => dispatch('startRepair')}>
        <span class="start-plus">⚙</span>
        <div class="start-text">
          <div class="start-label">START REPAIR CHECK</div>
          <div class="start-sub">Inspect Repairs to Failed Items</div>
        </div>
      </button>
    </div>
  {/if}

  <!-- ── Open sessions ──────────────────────────────────────────────────────── -->
  {#if openSessions.length > 0}
    <div class="sect">
      <div class="sect-title">OPEN SESSIONS</div>
      <div class="session-list">
        {#each openSessions as s (s.id)}
          <button class="scard scard-open" on:click={() => dispatch('resume', { session: s })}>
            <div class="pulse"></div>
            <div class="scard-body">
              <div class="scard-name-row">
                <span class="scard-type-icon">{getTypeIcon(s.element_type)}</span>
                <span class="scard-name">{s.session_name || (getTypeLabel(s.element_type) + ' · ' + s.building)}</span>
                {#if s.session_type === 'test'}
                  <span class="scard-type-badge badge-test">TEST</span>
                {:else if s.session_type === 'inspection'}
                  <span class="scard-type-badge badge-insp">INSPECTION</span>
                {:else if s.session_type === 'repair'}
                  <span class="scard-type-badge badge-repair">REPAIR</span>
                {/if}
              </div>
              <div class="scard-loc">{s.building} · {sessionFloorLabel(s)}</div>
              <div class="scard-meta">
                Started {fmtDate(s.started_at)} at {fmtTime(s.started_at)}
                {#if s.inspector_name}<span class="scard-who">· {s.inspector_name}</span>{/if}
              </div>
            </div>
            <span class="resume-label">RESUME →</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Closed sessions ────────────────────────────────────────────────────── -->
  {#if closedSessions.length > 0}
    <div class="sect">
      <div class="sect-title">RECENT SESSIONS</div>
      <div class="session-list session-list-scroll">
        {#each closedSessions as s (s.id)}
          <button class="scard" on:click={() => dispatch('viewSummary', { session: s })}>
            <div class="scard-icon">{getTypeIcon(s.element_type)}</div>
            <div class="scard-body">
              <div class="scard-name-row">
                <span class="scard-name">{s.session_name || (getTypeLabel(s.element_type) + ' · ' + s.building)}</span>
                {#if s.session_type === 'test'}
                  <span class="scard-type-badge badge-test">TEST</span>
                {:else if s.session_type === 'inspection'}
                  <span class="scard-type-badge badge-insp">INSPECTION</span>
                {:else if s.session_type === 'repair'}
                  <span class="scard-type-badge badge-repair">REPAIR</span>
                {/if}
                {#if s.status === 'closed'}
                  <span class="scard-type-badge badge-closed">✓ CLOSED</span>
                {/if}
              </div>
              <div class="scard-loc">{s.building} · {sessionFloorLabel(s)}</div>
              <div class="scard-meta">
                {fmtDate(s.started_at)}
                {#if s.closed_at}
                  <span class="scard-arr">→</span>{fmtTime(s.closed_at)}
                  <span class="scard-dur">({fmtDuration(s.started_at, s.closed_at)})</span>
                {/if}
                {#if s.inspector_name}<span class="scard-who">· {s.inspector_name}</span>{/if}
              </div>
            </div>
            <span class="scard-chev">›</span>
          </button>
        {/each}
      </div>
    </div>

  {:else if openSessions.length === 0}
    <div class="empty">
      <div class="empty-icon">◫</div>
      <div class="empty-txt">No sessions yet</div>
      <div class="empty-sub">Start a session to begin</div>
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

  /* ── Sections ─────────────────────────────────────────────────────────────*/
  .sect       { padding: 1.25rem 1.25rem 0; display: flex; flex-direction: column; gap: 0.625rem; }
  .sect-title { font-size: 0.65rem; letter-spacing: 0.2em; color: #ccc; margin-bottom: 0.25rem; }

  /* ── Start buttons ────────────────────────────────────────────────────────*/
  .start-btn {
    width: 100%; display: flex; align-items: center; gap: 0.875rem;
    padding: 1rem 1.125rem; border-radius: 10px; text-align: left;
    font-family: inherit; cursor: pointer; transition: all 0.15s;
    border: 2px solid transparent;
  }
  .start-test       { background: #111122; border-color: #3e3e58; color: #f0f0f0; }
  .start-test:hover { background: #1a1a2e; border-color: #fb923c; }

  .start-inspection       { background: #0a1420; border-color: #1e3a5f; color: #f0f0f0; }
  .start-inspection:hover { background: #0f1f35; border-color: #3b82f6; }

  .start-repair       { background: #1a0a00; border-color: #7c2d12; color: #f0f0f0; }
  .start-repair:hover { background: #250f00; border-color: #ea580c; }
  .start-repair .start-plus { color: #fb923c; }

  .start-plus { font-size: 1.5rem; font-weight: 300; color: #fb923c; flex-shrink: 0; line-height: 1; }
  .start-inspection .start-plus { color: #60a5fa; }

  .start-text  { display: flex; flex-direction: column; gap: 0.2rem; }
  .start-label { font-size: 0.8rem; font-weight: 800; letter-spacing: 0.12em; }
  .start-sub   { font-size: 0.65rem; color: #aaa; letter-spacing: 0.04em; }

  /* ── Pulse indicator ──────────────────────────────────────────────────────*/
  .pulse {
    width: 9px; height: 9px; border-radius: 50%; background: #22c55e; flex-shrink: 0;
    animation: pulse-anim 1.5s ease-in-out infinite;
  }
  @keyframes pulse-anim {
    0%,100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.4; transform: scale(0.85); }
  }

  /* ── Open session cards ───────────────────────────────────────────────────*/
  .scard-open         { background: #0a1f0a; border-color: #22c55e !important; }
  .scard-open:hover   { background: #0d2a0d; border-color: #4ade80 !important; }
  .resume-label {
    font-size: 0.68rem; font-weight: 800; letter-spacing: 0.1em;
    color: #4ade80; flex-shrink: 0; white-space: nowrap;
  }

  /* ── Session type badges ──────────────────────────────────────────────────*/
  .scard-type-badge {
    font-size: 0.55rem; font-weight: 700; letter-spacing: 0.1em;
    padding: 0.1rem 0.35rem; border-radius: 3px; flex-shrink: 0;
  }
  .badge-test      { background: #2a1800; color: #fb923c; }
  .badge-insp      { background: #0a1f35; color: #60a5fa; }
  .badge-repair    { background: #1a0a00; color: #fb923c; border: 1px solid #7c2d12; }
  .badge-closed    { background: #0a1f0a; color: #4ade80; border: 1px solid #166534; }

  /* ── Session cards (shared) ───────────────────────────────────────────────*/
  .session-list { display: flex; flex-direction: column; gap: 0.625rem; }
  .session-list-scroll { max-height: 10.5rem; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-right: 0.125rem; }
  .scard {
    width: 100%; display: flex; align-items: center; gap: 0.875rem;
    padding: 0.875rem 1rem; text-align: left;
    background: #111122; border: 2px solid #2e2e42; border-radius: 10px;
    cursor: pointer; font-family: inherit; transition: border-color 0.15s;
  }
  .scard:hover { border-color: #fb923c; }
  .scard-icon      { font-size: 1.35rem; flex-shrink: 0; }
  .scard-body      { flex: 1; min-width: 0; }
  .scard-name-row  { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .scard-type-icon { font-size: 1rem; flex-shrink: 0; }
  .scard-name { font-size: 0.875rem; color: #f0f0f0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .scard-loc  { font-size: 0.75rem; color: #ccc; margin-top: 0.15rem; }
  .scard-meta { font-size: 0.7rem; color: #bbb; margin-top: 0.15rem; }
  .scard-arr  { margin: 0 0.2rem; color: #888; }
  .scard-dur  { color: #666; }
  .scard-who  { color: #fb923c; }
  .scard-chev { font-size: 1.35rem; color: #666; flex-shrink: 0; transition: color 0.15s; }
  .scard:hover .scard-chev { color: #fb923c; }

  /* ── Empty state ──────────────────────────────────────────────────────────*/
  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem 2rem; gap: 0.5rem; }
  .empty-icon { font-size: 3rem; color: #3e3e58; }
  .empty-txt  { font-size: 0.875rem; color: #ccc; letter-spacing: 0.05em; }
  .empty-sub  { font-size: 0.75rem; color: #bbb; text-align: center; }
</style>
