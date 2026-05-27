<script>
  // src/lib/apps/managementmobile/components/IssueDetailScreen.svelte
  // Full issue detail: metadata, activity log, actions list.
  // Tap an activity row to open the ActivitySheet bottom sheet.

  import { createEventDispatcher } from 'svelte';
  import { ACTIVITY_TYPE_CONFIG, ACTIVITY_TYPE } from '$lib/utils/constants.js';
  import { fmtDate, fmtDateTime, isOverdue } from '$lib/utils/dates.js';
  import { sortActions } from '$lib/utils/actionSort.js';
  import ActivitySheet from './ActivitySheet.svelte';

  export let issue;

  const dispatch = createEventDispatcher();

  // -- Activity sheet state ---------------------------------------------
  let selectedActivity = null;

  function openActivity(activity) { selectedActivity = activity; }
  function closeActivity()        { selectedActivity = null; }

  // -- Toggle state -----------------------------------------------------
  let showHistoric   = false;
  let showCompleted  = false;

  // -- Priority colour map (matches IssueList) --------------------------
  const PRIORITY_COLOR = {
    1: '#ef4444',
    2: '#f59e0b',
    3: '#818cf8',
    4: '#64748b',
    5: '#475569',
    6: '#334155',
  };
  function priorityColor(p) { return PRIORITY_COLOR[p] ?? PRIORITY_COLOR[4]; }

  const PRIORITY_LABEL = {
    1: 'Top Priority',
    2: 'Major Project',
    3: 'Important',
    4: 'Minor',
    5: 'Admin',
    6: 'Pending',
  };
  function priorityLabel(p) { return PRIORITY_LABEL[p] ?? 'Important'; }

  // -- Activity helpers -------------------------------------------------
  $: allActivities = (issue.activities ?? [])
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  $: visibleActivities = showHistoric
    ? allActivities
    : allActivities.filter(a => !a.historic);

  $: historicCount = allActivities.filter(a => a.historic).length;

  function activityCfg(a) {
    return ACTIVITY_TYPE_CONFIG[a.activity_type]
      ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT];
  }

  // Strip HTML and truncate for preview
  function bodyPreview(body) {
    if (!body) return '';
    const plain = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain.length > 90 ? plain.slice(0, 88) + '…' : plain;
  }

  // -- Action helpers ---------------------------------------------------
  $: allActions = sortActions(issue.actions ?? []);

  $: visibleActions = showCompleted
    ? allActions
    : allActions.filter(a => a.status !== 'completed');

  $: completedCount = allActions.filter(a => a.status === 'completed').length;

  const ACTION_STATUS_COLOR = {
    'in-progress': '#818cf8',
    'pending':     '#64748b',
    'completed':   '#34d399',
  };
  const ACTION_STATUS_LABEL = {
    'in-progress': 'In Progress',
    'pending':     'Pending',
    'completed':   'Completed',
  };
  function actionStatusColor(s) { return ACTION_STATUS_COLOR[s] ?? '#64748b'; }
  function actionStatusLabel(s) { return ACTION_STATUS_LABEL[s] ?? s; }

  function deadlineChipClass(a) {
    if (a.status === 'completed') return 'deadline-done';
    if (isOverdue(a.date_deadline)) return 'deadline-overdue';
    return 'deadline-normal';
  }
</script>

<div class="screen">

  <!-- Header -->
  <header class="detail-header">
    <button class="back-btn" on:click={() => dispatch('back')} aria-label="Back to list">←</button>
    <span class="header-title">
      {#if issue.issue_number}
        <span class="header-num">#{issue.issue_number}</span>
      {/if}
      {issue.name}
    </span>
  </header>

  <!-- Scrollable body -->
  <div class="detail-scroll">

    <!-- Meta row: priority + status + date -->
    <div class="meta-row">
      <span
        class="priority-badge"
        style="color:{priorityColor(issue.priority)}; border-color:{priorityColor(issue.priority)}40;"
      >{priorityLabel(issue.priority)}</span>
      {#if issue.status === 'parked'}
        <span class="status-badge parked">Parked</span>
      {:else if issue.status === 'completed'}
        <span class="status-badge done">Completed</span>
      {:else}
        <span class="status-badge current">Current</span>
      {/if}
      <span class="meta-date">{fmtDate(issue.created_at)}</span>
    </div>

    <!-- Description -->
    {#if issue.description}
      <div class="description-block">
        <p class="description-text">{issue.description}</p>
      </div>
    {/if}

    <!-- ── Activities ── -->
    <div class="section-header">
      <span class="section-title">Activities</span>
      <span class="section-count">{visibleActivities.length}</span>
      {#if historicCount > 0}
        <button
          class="toggle-btn"
          class:active={showHistoric}
          on:click={() => showHistoric = !showHistoric}
        >{showHistoric ? 'Hide' : 'Show'} {historicCount} historic</button>
      {/if}
    </div>

    {#if visibleActivities.length === 0}
      <p class="empty-section">No activities.</p>
    {:else}
      {#each visibleActivities as activity (activity.id)}
        {@const cfg = activityCfg(activity)}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
          class="activity-row"
          class:historic={activity.historic}
          on:click={() => openActivity(activity)}
        >
          <div class="act-left">
            <span class="act-type-icon" aria-hidden="true">{cfg.icon}</span>
          </div>
          <div class="act-body">
            <div class="act-meta">
              <span class="act-type-label">{cfg.label}</span>
              {#if activity.historic}
                <span class="act-historic-tag">Historic</span>
              {/if}
              <span class="act-date">{fmtDateTime(activity.created_at, activity.created_by_profile?.full_name)}</span>
            </div>
            {#if activity.fields?.summary}
              <p class="act-preview act-summary">{activity.fields.summary}</p>
            {:else if bodyPreview(activity.body)}
              <p class="act-preview">{bodyPreview(activity.body)}</p>
            {:else if activity.activity_type === ACTIVITY_TYPE.DOCUMENT}
              <p class="act-preview act-doc">{activity.fields?.display_name || activity.fields?.filename || 'Document'}</p>
            {:else}
              <p class="act-preview act-empty">No body</p>
            {/if}
          </div>
          <span class="act-chevron" aria-hidden="true">›</span>
        </div>
      {/each}
    {/if}

    <!-- ── Actions ── -->
    <div class="section-header">
      <span class="section-title">Actions</span>
      <span class="section-count">{visibleActions.length}</span>
      {#if completedCount > 0}
        <button
          class="toggle-btn"
          class:active={showCompleted}
          on:click={() => showCompleted = !showCompleted}
        >{showCompleted ? 'Hide' : 'Show'} {completedCount} completed</button>
      {/if}
    </div>

    {#if visibleActions.length === 0}
      <p class="empty-section">No actions.</p>
    {:else}
      {#each visibleActions as action (action.id)}
        <div class="action-row" class:action-completed={action.status === 'completed'}>
          <!-- Status dot -->
          <div
            class="action-dot"
            style="background:{actionStatusColor(action.status)};"
            title={actionStatusLabel(action.status)}
            aria-hidden="true"
          ></div>

          <div class="action-body">
            <p class="action-text">{action.action_text}</p>
            <div class="action-chips">
              {#if action.name_text}
                <span class="chip chip-assignee">{action.name_text}</span>
              {/if}
              {#if action.date_deadline}
                <span class="chip {deadlineChipClass(action)}">
                  {fmtDate(action.date_deadline)}
                </span>
              {/if}
              {#if action.status === 'in-progress'}
                <span class="chip chip-inprogress">In Progress</span>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {/if}

    <!-- Bottom spacer -->
    <div class="bottom-spacer"></div>

  </div>
</div>

<!-- Activity bottom sheet -->
{#if selectedActivity}
  <ActivitySheet activity={selectedActivity} on:close={closeActivity} />
{/if}

<style>
  .screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: #0d0d14;
  }

  /* ── Header ── */
  .detail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 48px;
    padding: 0 12px;
    background: #1a1a2e;
    border-bottom: 1px solid #252540;
    flex-shrink: 0;
  }

  .back-btn {
    min-width: 44px;
    min-height: 44px;
    background: transparent;
    border: none;
    color: #818cf8;
    font-size: 20px;
    cursor: pointer;
    touch-action: manipulation;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .header-title {
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    font-weight: 700;
    color: #e2e8f0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .header-num {
    color: #475569;
    margin-right: 4px;
  }

  /* ── Scrollable body ── */
  .detail-scroll {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #252540 transparent;
  }

  /* ── Meta row ── */
  .meta-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid #1e2035;
  }

  .priority-badge {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 8px;
    border: 1px solid;
  }

  .status-badge {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 8px;
  }
  .status-badge.current  { background: #13263a; color: #93c5fd; border: 1px solid #1e3a52; }
  .status-badge.parked   { background: #92400e22; color: #f59e0b; border: 1px solid #92400e44; }
  .status-badge.done     { background: #06503022; color: #34d399; border: 1px solid #06503044; }

  .meta-date {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: #475569;
    margin-left: auto;
  }

  /* ── Description ── */
  .description-block {
    padding: 12px 14px;
    border-bottom: 1px solid #1e2035;
  }

  .description-text {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.55;
    margin: 0;
    white-space: pre-wrap;
  }

  /* ── Section headers ── */
  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px 6px;
    border-top: 1px solid #1e2035;
    margin-top: 4px;
  }

  .section-title {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #475569;
  }

  .section-count {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: #334155;
    background: #1e2035;
    padding: 1px 6px;
    border-radius: 6px;
    border: 1px solid #252540;
  }

  .toggle-btn {
    margin-left: auto;
    background: transparent;
    border: 1px solid #252540;
    border-radius: 6px;
    color: #475569;
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    padding: 3px 8px;
    cursor: pointer;
    touch-action: manipulation;
    transition: color 0.15s, border-color 0.15s;
  }

  .toggle-btn.active {
    color: #818cf8;
    border-color: #818cf840;
  }

  .empty-section {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: #334155;
    padding: 12px 14px;
    margin: 0;
  }

  /* ── Activity rows ── */
  .activity-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid #1a1a28;
    cursor: pointer;
    transition: background 0.1s;
  }

  @media (hover: hover) {
    .activity-row:hover { background: #13131f; }
  }

  .activity-row.historic { opacity: 0.6; }

  .act-left {
    flex-shrink: 0;
    padding-top: 1px;
  }

  .act-type-icon {
    font-size: 14px;
    line-height: 1;
  }

  .act-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .act-meta {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
  }

  .act-type-label {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #818cf8;
    flex-shrink: 0;
  }

  .act-historic-tag {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    color: #f59e0b;
    background: #2a200a;
    padding: 1px 5px;
    border-radius: 6px;
    border: 1px solid #3d2e0a;
    flex-shrink: 0;
  }

  .act-date {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: #334155;
    margin-left: auto;
  }

  .act-preview {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: #64748b;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .act-preview.act-summary { color: #94a3b8; font-style: italic; }
  .act-preview.act-doc { color: #818cf8; }
  .act-preview.act-empty { color: #334155; font-style: italic; }

  .act-chevron {
    font-size: 18px;
    color: #252540;
    flex-shrink: 0;
    padding-top: 2px;
  }

  /* ── Action rows ── */
  .action-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid #1a1a28;
  }

  .action-row.action-completed { opacity: 0.55; }

  .action-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 5px;
  }

  .action-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .action-text {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #cbd5e1;
    margin: 0;
    line-height: 1.4;
    word-break: break-word;
  }

  .action-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .chip {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 6px;
  }

  .chip-assignee {
    background: #1e2a3a;
    color: #93c5fd;
    border: 1px solid #1e3a52;
  }

  .deadline-normal {
    background: #1e2035;
    color: #64748b;
    border: 1px solid #252540;
  }

  .deadline-overdue {
    background: #2a0a0a;
    color: #f87171;
    border: 1px solid #3d0a0a;
  }

  .deadline-done {
    background: #06503022;
    color: #34d399;
    border: 1px solid #06503044;
  }

  .chip-inprogress {
    background: #1e1a3a;
    color: #818cf8;
    border: 1px solid #2e2a5a;
  }

  /* ── Bottom spacer ── */
  .bottom-spacer { height: 40px; }
</style>
