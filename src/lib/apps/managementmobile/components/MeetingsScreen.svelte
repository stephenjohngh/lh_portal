<script>
  // src/lib/apps/managementmobile/components/MeetingsScreen.svelte
  // Read-only list of team meetings (newest first), with the open one flagged
  // and a small count of items tagged to each. Tap a row to open its minutes.

  import { createEventDispatcher } from 'svelte';
  import { fmtDate } from '$lib/utils/dates.js';

  export let meetings = [];   // meetingsStore list (newest first)
  export let issues   = [];   // for the tagged-item counts

  const dispatch = createEventDispatcher();

  // One pass over issues → { [meetingId]: { issues, activities, actions } }
  $: countsById = (() => {
    const map = {};
    const bump = (id, key) => {
      if (!id) return;
      (map[id] ??= { issues: 0, activities: 0, actions: 0 })[key]++;
    };
    for (const issue of issues) {
      bump(issue.meeting_id, 'issues');
      for (const a of (issue.activities ?? [])) bump(a.meeting_id, 'activities');
      for (const a of (issue.actions ?? []))    bump(a.meeting_id, 'actions');
    }
    return map;
  })();

  function summary(m) {
    const c = countsById[m.id] ?? { issues: 0, activities: 0, actions: 0 };
    const parts = [];
    if (c.issues > 0)     parts.push(`${c.issues} new`);
    if (c.activities > 0) parts.push(`${c.activities} activit${c.activities === 1 ? 'y' : 'ies'}`);
    if (c.actions > 0)    parts.push(`${c.actions} action${c.actions === 1 ? '' : 's'}`);
    return parts.join(' · ') || 'No tagged items';
  }
</script>

<div class="screen">
  <header class="app-header">
    <button class="back-btn" on:click={() => dispatch('back')} aria-label="Back to issues">←</button>
    <span class="app-title">Meetings</span>
    <span class="count">{meetings.length}</span>
  </header>

  <div class="list-scroll">
    {#if meetings.length === 0}
      <p class="empty">No meetings yet.</p>
    {:else}
      {#each meetings as m (m.id)}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="mrow" on:click={() => dispatch('select', m)}>
          <div class="mrow-body">
            <div class="mrow-title-row">
              <span class="mrow-title">{m.title}</span>
              {#if m.status === 'open'}
                <span class="badge-open"><span class="dot"></span> In progress</span>
              {/if}
            </div>
            <p class="mrow-meta">{fmtDate(m.meeting_date)} · {m.meeting_type}</p>
            <p class="mrow-summary">{summary(m)}</p>
          </div>
          <span class="chevron" aria-hidden="true">›</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .screen { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  .app-header {
    display: flex; align-items: center; gap: 8px;
    height: 48px; padding: 0 12px;
    background: #1a1a2e; border-bottom: 1px solid #252540; flex-shrink: 0;
  }
  .back-btn {
    min-width: 44px; min-height: 44px;
    background: transparent; border: none; color: #818cf8;
    font-size: 20px; cursor: pointer; touch-action: manipulation;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .app-title { font-family: 'DM Mono', monospace; font-size: 15px; font-weight: 700; color: #e2e8f0; flex: 1; }
  .count {
    font-family: 'DM Mono', monospace; font-size: 11px; color: #475569;
    background: #1e2035; padding: 2px 7px; border-radius: 8px; border: 1px solid #252540;
  }

  .list-scroll { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #252540 transparent; }

  .empty {
    font-family: 'DM Mono', monospace; font-size: 13px; color: #64748b;
    text-align: center; padding: 48px 24px; margin: 0;
  }

  .mrow {
    display: flex; align-items: center; gap: 8px;
    min-height: 64px; padding: 10px 12px;
    border-bottom: 1px solid #1e2035; cursor: pointer; transition: background 0.1s;
  }
  @media (hover: hover) { .mrow:hover { background: #13131f; } }

  .mrow-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .mrow-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .mrow-title {
    font-family: 'DM Mono', monospace; font-size: 14px; font-weight: 600; color: #e2e8f0;
    word-break: break-word;
  }
  .badge-open {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 700;
    color: #fbbf24; background: #2a200a; border: 1px solid #3d2e0a;
    padding: 1px 7px; border-radius: 8px; flex-shrink: 0;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #fbbf24; animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

  .mrow-meta { font-family: 'DM Mono', monospace; font-size: 11px; color: #64748b; margin: 0; }
  .mrow-summary { font-family: 'DM Mono', monospace; font-size: 11px; color: #475569; margin: 0; }

  .chevron { font-size: 20px; color: #252540; flex-shrink: 0; padding-right: 4px; }
</style>
