<script context="module">
  // Persist status + search across open/close cycles
  let persistedStatus = 'current';
  let persistedQuery  = '';
</script>

<script>
  // src/lib/apps/managementmobile/components/IssueList.svelte
  // Scrollable list of issues — status tabs + persistent search.
  // Read-only; tap a row to open detail.

  import { createEventDispatcher } from 'svelte';
  import { fmtDate } from '$lib/utils/dates.js';

  export let issues  = [];
  export let loading = false;
  export let error   = '';

  const dispatch = createEventDispatcher();

  // -- Filter state (module-level persistence) -------------------------
  let statusFilter = persistedStatus;
  let query        = persistedQuery;

  $: { persistedStatus = statusFilter; persistedQuery = query; }

  // -- Priority colour map ---------------------------------------------
  const PRIORITY_COLOR = {
    1: '#ef4444',   // red   — Top Priority
    2: '#f59e0b',   // amber — Major Project
    3: '#818cf8',   // violet — Important (app accent)
    4: '#64748b',   // slate — Minor
    5: '#475569',   // dark slate — Admin
    6: '#334155',   // darker slate — Pending
  };

  function priorityColor(p) {
    return PRIORITY_COLOR[p] ?? PRIORITY_COLOR[4];
  }

  // -- Activity / action summary helpers --------------------------------
  function activitySummary(issue) {
    const acts = issue.activities ?? [];
    const total   = acts.filter(a => !a.historic).length;
    const historic = acts.filter(a => a.historic).length;
    return { total, historic };
  }

  function actionSummary(issue) {
    const acts = issue.actions ?? [];
    const outstanding = acts.filter(a => a.status !== 'completed').length;
    const today = new Date(); today.setHours(0,0,0,0);
    const overdue = acts.filter(a => {
      if (!a.date_deadline || a.status === 'completed') return false;
      const d = new Date(a.date_deadline); d.setHours(0,0,0,0);
      return d < today;
    }).length;
    return { outstanding, overdue };
  }

  // -- Filtering & sorting ----------------------------------------------
  $: filtered = issues.filter(issue => {
    // Status
    const matchStatus = issue.status === statusFilter
                     || (!issue.status && statusFilter === 'current');
    if (!matchStatus) return false;

    // Search
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (issue.name ?? '').toLowerCase().includes(q)
        || (issue.description ?? '').toLowerCase().includes(q)
        || String(issue.issue_number ?? '').includes(q)
        || (issue.activities ?? []).some(a =>
            (a.body ?? '').toLowerCase().includes(q) ||
            Object.values(a.fields ?? {}).some(v => typeof v === 'string' && v.toLowerCase().includes(q))
          );
  });
  // Store already sorts by priority → issue_number; preserve that order.

  const TABS = [
    { value: 'current',   label: 'Current'   },
    { value: 'parked',    label: 'Parked'     },
    { value: 'completed', label: 'Completed'  },
  ];
</script>

<div class="screen">

  <!-- Fixed header -->
  <header class="app-header">
    <button class="back-btn" on:click={() => dispatch('home')} aria-label="Back to home">←</button>
    <span class="app-title">Issues</span>
    <span class="issue-count">{filtered.length}</span>
  </header>

  <!-- Status tabs -->
  <div class="tab-bar" role="tablist">
    {#each TABS as tab}
      <button
        role="tab"
        class="tab"
        class:active={statusFilter === tab.value}
        aria-selected={statusFilter === tab.value}
        on:click={() => statusFilter = tab.value}
      >{tab.label}</button>
    {/each}
  </div>

  <!-- Search -->
  <div class="search-row">
    <span class="search-icon" aria-hidden="true">🔍</span>
    <input
      class="search-input"
      type="search"
      placeholder="Search issues, activities…"
      bind:value={query}
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
    />
    {#if query}
      <button class="search-clear" on:click={() => query = ''} aria-label="Clear search">✕</button>
    {/if}
  </div>

  <!-- List -->
  <div class="list-scroll">
    {#if loading && issues.length === 0}
      <div class="center-msg">
        <div class="spinner"></div>
        <p class="muted">Loading issues…</p>
      </div>

    {:else if error && issues.length === 0}
      <p class="error-msg">{error}</p>

    {:else if filtered.length === 0}
      <p class="empty-msg">
        {#if query}No issues match "{query}".{:else}No {statusFilter} issues.{/if}
      </p>

    {:else}
      {#each filtered as issue (issue.id)}
        {@const acts   = activitySummary(issue)}
        {@const actions = actionSummary(issue)}
        {@const pcol   = priorityColor(issue.priority)}

        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="issue-row" on:click={() => dispatch('select', issue)}>

          <!-- Priority colour bar -->
          <div class="priority-bar" style="background:{pcol};" aria-hidden="true"></div>

          <div class="issue-content">

            <!-- Title line -->
            <div class="issue-headline">
              {#if issue.issue_number}
                <span class="issue-num">#{issue.issue_number}</span>
              {/if}
              <span class="issue-name">{issue.name}</span>
              {#if issue.status === 'parked'}
                <span class="status-badge parked">Parked</span>
              {:else if issue.status === 'completed'}
                <span class="status-badge done">✓</span>
              {/if}
            </div>

            <!-- Chips row -->
            {#if acts.total > 0 || actions.outstanding > 0}
              <div class="chips">
                {#if acts.total > 0}
                  <span class="chip chip-activity">
                    💬 {acts.total}{#if acts.historic > 0}<span class="chip-historic">+{acts.historic}h</span>{/if}
                  </span>
                {/if}
                {#if actions.overdue > 0}
                  <span class="chip chip-overdue">⚠ {actions.overdue} overdue</span>
                {:else if actions.outstanding > 0}
                  <span class="chip chip-action">⚙ {actions.outstanding} action{actions.outstanding !== 1 ? 's' : ''}</span>
                {/if}
              </div>
            {/if}

            <!-- Date -->
            <p class="issue-date">{fmtDate(issue.created_at)}</p>

          </div>

          <span class="chevron" aria-hidden="true">›</span>
        </div>
      {/each}
    {/if}
  </div>

</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Header ── */
  .app-header {
    display: flex;
    align-items: center;
    height: 48px;
    padding: 0 12px;
    background: #1a1a2e;
    border-bottom: 1px solid #252540;
    flex-shrink: 0;
    gap: 8px;
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

  .app-title {
    font-family: 'DM Mono', monospace;
    font-size: 15px;
    font-weight: 700;
    color: #e2e8f0;
    flex: 1;
  }

  .issue-count {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: #475569;
    background: #1e2035;
    padding: 2px 7px;
    border-radius: 8px;
    border: 1px solid #252540;
  }

  /* ── Tab bar ── */
  .tab-bar {
    display: flex;
    background: #1a1a2e;
    border-bottom: 1px solid #252540;
    flex-shrink: 0;
  }

  .tab {
    flex: 1;
    min-height: 40px;
    background: transparent;
    border: none;
    color: #64748b;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    touch-action: manipulation;
  }

  .tab.active {
    color: #818cf8;
    border-bottom-color: #818cf8;
  }

  /* ── Search ── */
  .search-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: #13131f;
    border-bottom: 1px solid #252540;
    flex-shrink: 0;
  }

  .search-icon { font-size: 13px; flex-shrink: 0; }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #e2e8f0;
    min-height: 32px;
  }

  .search-input::placeholder { color: #475569; }

  .search-clear {
    background: transparent;
    border: none;
    color: #475569;
    cursor: pointer;
    font-size: 13px;
    padding: 4px;
    touch-action: manipulation;
  }

  /* ── List ── */
  .list-scroll {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #252540 transparent;
  }

  .center-msg {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 16px;
    gap: 16px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #252540;
    border-top-color: #818cf8;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .muted, .empty-msg, .error-msg {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #64748b;
    text-align: center;
    padding: 48px 24px;
    margin: 0;
  }

  .error-msg { color: #dc2626; }

  /* ── Issue row ── */
  .issue-row {
    display: flex;
    align-items: stretch;
    min-height: 64px;
    border-bottom: 1px solid #1e2035;
    cursor: pointer;
    transition: background 0.1s;
    background: transparent;
  }

  @media (hover: hover) {
    .issue-row:hover { background: #13131f; }
  }

  .priority-bar {
    width: 4px;
    flex-shrink: 0;
    border-radius: 0;
  }

  .issue-content {
    flex: 1;
    padding: 10px 10px 10px 12px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    justify-content: center;
  }

  .issue-headline {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
  }

  .issue-num {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: #818cf8;
    font-weight: 600;
    flex-shrink: 0;
  }

  .issue-name {
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    font-weight: 600;
    color: #e2e8f0;
    line-height: 1.3;
    word-break: break-word;
  }

  .status-badge {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .status-badge.parked { background: #92400e22; color: #f59e0b; border: 1px solid #92400e44; }
  .status-badge.done   { background: #06503022; color: #34d399; border: 1px solid #06503044; }

  /* ── Chips ── */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 8px;
  }

  .chip-activity {
    background: #1e2a3a;
    color: #93c5fd;
    border: 1px solid #1e3a52;
  }

  .chip-historic {
    color: #475569;
    margin-left: 2px;
  }

  .chip-action {
    background: #2a200a;
    color: #fbbf24;
    border: 1px solid #3d2e0a;
  }

  .chip-overdue {
    background: #2a0a0a;
    color: #f87171;
    border: 1px solid #3d0a0a;
  }

  /* ── Date ── */
  .issue-date {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: #334155;
    margin: 0;
  }

  .chevron {
    font-size: 20px;
    color: #252540;
    display: flex;
    align-items: center;
    padding-right: 12px;
    flex-shrink: 0;
  }
</style>
