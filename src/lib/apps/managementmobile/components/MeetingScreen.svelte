<script>
  // src/lib/apps/managementmobile/components/MeetingScreen.svelte
  // Read-only mobile "minutes": what was discussed/decided/actioned in a meeting.
  // Per tagged issue: Decisions, Actions, then Other activity. Tap an issue header
  // to open the full issue; tap an activity to see it in full (ActivitySheet).

  import { createEventDispatcher, onMount } from 'svelte';
  import { profiles, profilesStore } from '$lib/stores/profiles';
  import { ACTIVITY_TYPE_CONFIG, ACTIVITY_TYPE } from '$lib/utils/constants.js';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates.js';
  import { buildMeetingMinutes, meetingAttendees } from '$lib/apps/management/utils/meetingMinutes.js';
  import ActivitySheet from './ActivitySheet.svelte';

  export let meeting = null;
  export let issues  = [];

  const dispatch = createEventDispatcher();

  onMount(() => profilesStore.load());

  $: profileNameById = Object.fromEntries(($profiles.list ?? []).map(p => [p.id, p.full_name]));
  $: attendees = meetingAttendees(meeting, profileNameById);
  $: ({ minutes, totals } = buildMeetingMinutes(meeting, issues));

  // Combined non-decision activity, newest first, for the "Other" list.
  function otherActivity(m) {
    return [...m.comments, ...m.notes, ...m.emails, ...m.letters, ...m.documents]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  function cfg(a) {
    return ACTIVITY_TYPE_CONFIG[a.activity_type] ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT];
  }
  function preview(body) {
    if (!body) return '';
    const plain = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain.length > 80 ? plain.slice(0, 78) + '…' : plain;
  }
  function actLine(a) {
    return a.fields?.summary || a.fields?.notes
      || preview(a.body)
      || (a.activity_type === ACTIVITY_TYPE.DOCUMENT ? (a.fields?.display_name || a.fields?.filename || 'Document') : '');
  }

  const ACTION_COLOR = { 'in-progress': '#818cf8', pending: '#64748b', completed: '#34d399' };
  const ACTION_LABEL = { 'in-progress': 'In Progress', pending: 'Pending', completed: 'Completed' };

  // Activity sheet
  let selectedActivity = null;
</script>

<div class="screen">
  <header class="detail-header">
    <button class="back-btn" on:click={() => dispatch('back')} aria-label="Back">←</button>
    <span class="header-title">{meeting?.title ?? 'Meeting'}</span>
  </header>

  <div class="scroll">
    <!-- Meta -->
    <div class="meta">
      <span class="meta-line">{fmtDate(meeting?.meeting_date)} · {meeting?.meeting_type}</span>
      {#if meeting?.status === 'open'}
        <span class="badge-open"><span class="dot"></span> In progress</span>
      {/if}
    </div>

    {#if attendees.length > 0}
      <div class="block">
        <p class="block-title">Attendees</p>
        <div class="chips">
          {#each attendees as name}<span class="attendee">{name}</span>{/each}
        </div>
      </div>
    {/if}

    {#if meeting?.notes}
      <p class="notes">{meeting.notes}</p>
    {/if}

    <p class="totals">
      {totals.issues} new · {totals.actions} action{totals.actions === 1 ? '' : 's'} ·
      {totals.decisions} decision{totals.decisions === 1 ? '' : 's'} ·
      {totals.comments + totals.notes + totals.emails + totals.letters + totals.documents} other
    </p>

    <!-- Per-issue -->
    {#if minutes.length === 0}
      <p class="empty">No items tagged to this meeting yet.</p>
    {:else}
      {#each minutes as m (m.issue.id)}
        <div class="issue-block">
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="issue-head" on:click={() => dispatch('openIssue', m.issue)}>
            {#if m.issue.issue_number}<span class="ih-num">#{m.issue.issue_number}</span>{/if}
            <span class="ih-name">{m.issue.name}</span>
            {#if m.isNew}<span class="ih-new">🆕 New</span>{/if}
            <span class="ih-chevron" aria-hidden="true">›</span>
          </div>

          <!-- Decisions -->
          {#if m.decisions.length > 0}
            <p class="grp-title grp-decision">Decisions</p>
            {#each m.decisions as d (d.id)}
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <div class="act-row" on:click={() => selectedActivity = d}>
                <span class="act-icon">{cfg(d).icon}</span>
                <div class="act-body">
                  <p class="act-text">{actLine(d)}</p>
                  <p class="act-date">{fmtDateTime(d.created_at, d.created_by_profile?.full_name)}</p>
                </div>
                <span class="act-chevron">›</span>
              </div>
            {/each}
          {/if}

          <!-- Actions -->
          {#if m.actions.length > 0}
            <p class="grp-title grp-action">Actions</p>
            {#each m.actions as a (a.id)}
              <div class="action-row">
                <span class="action-dot" style="background:{ACTION_COLOR[a.status] ?? '#64748b'};"></span>
                <div class="act-body">
                  <p class="act-text">{a.action_text}</p>
                  <div class="action-chips">
                    <span class="a-chip">{ACTION_LABEL[a.status] ?? a.status}</span>
                    {#if a.name_text}<span class="a-chip a-assignee">{a.name_text}</span>{/if}
                    {#if a.date_deadline}<span class="a-chip">📅 {fmtDate(a.date_deadline)}</span>{/if}
                  </div>
                </div>
              </div>
            {/each}
          {/if}

          <!-- Other activity -->
          {#if otherActivity(m).length > 0}
            <p class="grp-title grp-other">Activity</p>
            {#each otherActivity(m) as a (a.id)}
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <div class="act-row" on:click={() => selectedActivity = a}>
                <span class="act-icon">{cfg(a).icon}</span>
                <div class="act-body">
                  <p class="act-text">{actLine(a)}</p>
                  <p class="act-date">{cfg(a).label} · {fmtDateTime(a.created_at, a.created_by_profile?.full_name)}</p>
                </div>
                <span class="act-chevron">›</span>
              </div>
            {/each}
          {/if}
        </div>
      {/each}
    {/if}

    <div class="spacer"></div>
  </div>
</div>

{#if selectedActivity}
  <ActivitySheet activity={selectedActivity} on:close={() => selectedActivity = null} />
{/if}

<style>
  .screen { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: #0d0d14; }

  .detail-header {
    display: flex; align-items: center; gap: 8px;
    height: 48px; padding: 0 12px; background: #1a1a2e; border-bottom: 1px solid #252540; flex-shrink: 0;
  }
  .back-btn {
    min-width: 44px; min-height: 44px; background: transparent; border: none; color: #818cf8;
    font-size: 20px; cursor: pointer; touch-action: manipulation;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .header-title {
    font-family: 'DM Mono', monospace; font-size: 14px; font-weight: 700; color: #e2e8f0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
  }

  .scroll { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #252540 transparent; }

  .meta {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 12px 14px 8px; border-bottom: 1px solid #1e2035;
  }
  .meta-line { font-family: 'DM Mono', monospace; font-size: 12px; color: #94a3b8; }
  .badge-open {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 700;
    color: #fbbf24; background: #2a200a; border: 1px solid #3d2e0a; padding: 1px 7px; border-radius: 8px;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #fbbf24; animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

  .block { padding: 10px 14px 4px; }
  .block-title, .grp-title {
    font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em; color: #475569; margin: 0 0 6px;
  }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .attendee {
    font-family: 'DM Mono', monospace; font-size: 11px; color: #cbd5e1;
    background: #1e2035; border: 1px solid #252540; padding: 1px 7px; border-radius: 8px;
  }
  .notes {
    font-family: 'DM Mono', monospace; font-size: 12px; color: #94a3b8; font-style: italic;
    line-height: 1.5; margin: 4px 14px 0; padding-left: 8px; border-left: 2px solid #334155;
    white-space: pre-wrap;
  }
  .totals { font-family: 'DM Mono', monospace; font-size: 11px; color: #475569; margin: 10px 14px; }
  .empty { font-family: 'DM Mono', monospace; font-size: 13px; color: #334155; padding: 12px 14px; margin: 0; }

  .issue-block { border-top: 1px solid #1e2035; }
  .issue-head {
    display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
    padding: 10px 14px 6px; cursor: pointer; background: #13131f;
  }
  @media (hover: hover) { .issue-head:hover { background: #17172a; } }
  .ih-num  { font-family: 'DM Mono', monospace; font-size: 12px; color: #818cf8; font-weight: 600; }
  .ih-name { font-family: 'DM Mono', monospace; font-size: 14px; font-weight: 700; color: #e2e8f0; flex: 1; }
  .ih-new  {
    font-family: 'DM Mono', monospace; font-size: 10px; color: #34d399;
    background: #06503022; border: 1px solid #06503044; padding: 1px 6px; border-radius: 8px;
  }
  .ih-chevron { font-size: 18px; color: #334155; }

  .grp-title { padding: 8px 14px 2px; }
  .grp-decision { color: #a78bfa; }
  .grp-action   { color: #fbbf24; }
  .grp-other    { color: #64748b; }

  .act-row {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 6px 14px; cursor: pointer; transition: background 0.1s;
  }
  @media (hover: hover) { .act-row:hover { background: #13131f; } }
  .act-icon { font-size: 13px; flex-shrink: 0; padding-top: 1px; }
  .act-body { flex: 1; min-width: 0; }
  .act-text {
    font-family: 'DM Mono', monospace; font-size: 12px; color: #cbd5e1; margin: 0;
    line-height: 1.4; word-break: break-word;
  }
  .act-date { font-family: 'DM Mono', monospace; font-size: 10px; color: #475569; margin: 2px 0 0; }
  .act-chevron { font-size: 16px; color: #252540; flex-shrink: 0; }

  .action-row { display: flex; align-items: flex-start; gap: 10px; padding: 6px 14px; }
  .action-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
  .action-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
  .a-chip {
    font-family: 'DM Mono', monospace; font-size: 10px; color: #64748b;
    background: #1e2035; border: 1px solid #252540; padding: 1px 6px; border-radius: 6px;
  }
  .a-assignee { color: #93c5fd; background: #1e2a3a; border-color: #1e3a52; }

  .spacer { height: 40px; }
</style>
