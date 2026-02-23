<!-- src/lib/apps/plans/components/WalkInspectionsTab.svelte -->
<!-- Walk inspection sessions browser — rendered as a full tab, not a modal -->
<script>
  import { onMount }   from 'svelte';
  import Icon          from '$lib/components/icons/Icon.svelte';
  import { api }       from '$lib/utils/api';
  import { getLogger } from '$lib/utils/logger';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';
  import { walkStore }           from '$lib/apps/walk/stores/walkStore.js';
  import WalkInspectionsReport   from './WalkInspectionsReport.svelte';

  const logger = getLogger('WalkInspectionsTab');

  export let isAdmin = false;

  // ── Data ────────────────────────────────────────────────────────────────
  let sessions     = [];
  let inspections  = {};   // { [sessionId]: inspection[] }
  let loading      = true;
  let loadingId    = null;
  let error        = null;
  let expandedId   = null;
  let showReport   = false;
  let deletingId   = null;  // session id currently being deleted
  let confirmId    = null;  // session id awaiting delete confirmation

  // ── Filters ──────────────────────────────────────────────────────────────
  let filterBuilding = '';
  let filterType     = '';
  let filterStatus   = '';
  let filterDateFrom = '';
  let filterDateTo   = '';

  $: buildings = [...new Set(sessions.map(s => s.building))].sort();

  $: filtered = sessions.filter(s => {
    if (filterBuilding && s.building !== filterBuilding) return false;
    if (filterType     && s.element_type !== filterType)  return false;
    if (filterStatus   && s.status !== filterStatus)       return false;
    if (filterDateFrom && new Date(s.started_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo) {
      const to = new Date(filterDateTo); to.setHours(23, 59, 59, 999);
      if (new Date(s.started_at) > to) return false;
    }
    return true;
  });

  $: totalSessions  = filtered.length;
  $: openSessions   = filtered.filter(s => s.status === 'open').length;
  $: closedSessions = filtered.filter(s => s.status === 'closed').length;
  $: hasFilters = filterBuilding || filterType || filterStatus || filterDateFrom || filterDateTo;

  onMount(loadSessions);

  async function loadSessions() {
    loading = true; error = null;
    try {
      sessions = await api.get('walk_sessions', {
        select:    '*, inspector:profiles!created_by(full_name)',
        orderBy:   'started_at',
        ascending: false
      });
      logger('✅ Loaded', sessions.length, 'sessions');
    } catch (err) {
      logger('❌ loadSessions:', err.message);
      error = err.message;
    } finally { loading = false; }
  }

  async function toggleExpand(session) {
    if (expandedId === session.id) { expandedId = null; return; }
    expandedId = session.id;
    if (!inspections[session.id]) {
      loadingId = session.id;
      try {
        const rows = await api.get('element_inspections', {
          filters:   { session_id: session.id },
          orderBy:   'inspected_at',
          ascending: true
        });
        inspections = { ...inspections, [session.id]: rows };
      } catch (err) {
        logger('❌ load inspections:', err.message);
        inspections = { ...inspections, [session.id]: [] };
      } finally { loadingId = null; }
    }
  }

  async function handleDelete(session) {
    if (confirmId !== session.id) {
      // First click: ask for confirmation
      confirmId = session.id;
      return;
    }
    // Second click: confirmed
    confirmId  = null;
    deletingId = session.id;
    try {
      await walkStore.deleteSession(session.id);
      sessions = sessions.filter(s => s.id !== session.id);
      if (expandedId === session.id) expandedId = null;
      delete inspections[session.id];
      logger('✅ Session deleted from UI');
    } catch (err) {
      logger('❌ deleteSession:', err.message);
      error = err.message;
    } finally {
      deletingId = null;
    }
  }

  function clearFilters() {
    filterBuilding = filterType = filterStatus = filterDateFrom = filterDateTo = '';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function typeLabel(t) { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t; }
  function typeIcon(t)  { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.icon  ?? '■'; }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDateTime(iso) { return iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : '—'; }

  function duration(s) {
    if (!s.closed_at) return null;
    const min = Math.round((new Date(s.closed_at) - new Date(s.started_at)) / 60000);
    return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`;
  }

  function sessionStats(sessionId) {
    const rows = inspections[sessionId] || [];
    return {
      pass:     rows.filter(r => r.result === 'pass').length,
      fail:     rows.filter(r => r.result === 'fail').length,
      na:       rows.filter(r => r.result === 'na').length,
      elements: new Set(rows.map(r => r.element_id)).size,
      total:    rows.length
    };
  }

  function groupByElement(rows) {
    const map = {};
    for (const row of rows) {
      if (!map[row.element_id]) {
        map[row.element_id] = { asset_id: row.asset_id, subtype: row.subtype, rows: [] };
      }
      map[row.element_id].rows.push(row);
    }
    return Object.values(map).sort((a, b) => {
      const aF = a.rows.some(r => r.result === 'fail');
      const bF = b.rows.some(r => r.result === 'fail');
      if (aF !== bF) return aF ? -1 : 1;
      return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
    });
  }

  function worstResult(rows) {
    if (rows.some(r => r.result === 'fail')) return 'fail';
    if (rows.some(r => r.result === 'pass')) return 'pass';
    return 'na';
  }
</script>

<div class="wi-tab">

  <!-- ── Toolbar ──────────────────────────────────────────────────────────── -->
  <div class="toolbar">
    <div class="filters">

      <div class="fld">
        <label for="wi-building" class="flbl">Building</label>
        <select id="wi-building" class="fsel" bind:value={filterBuilding}>
          <option value="">All buildings</option>
          {#each buildings as b}<option value={b}>{b}</option>{/each}
        </select>
      </div>

      <div class="fld">
        <label for="wi-type" class="flbl">Type</label>
        <select id="wi-type" class="fsel" bind:value={filterType}>
          <option value="">All types</option>
          {#each ELEMENT_TYPE_OPTIONS as t}<option value={t.value}>{t.icon} {t.label}</option>{/each}
        </select>
      </div>

      <div class="fld">
        <label for="wi-status" class="flbl">Status</label>
        <select id="wi-status" class="fsel" bind:value={filterStatus}>
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div class="fld">
        <label for="wi-from" class="flbl">From</label>
        <input id="wi-from" type="date" class="finput" bind:value={filterDateFrom} />
      </div>

      <div class="fld">
        <label for="wi-to" class="flbl">To</label>
        <input id="wi-to" type="date" class="finput" bind:value={filterDateTo} />
      </div>

      {#if hasFilters}
        <button class="clear-btn" on:click={clearFilters}>Clear filters</button>
      {/if}
    </div>

    <div class="toolbar-summary">
      {#if filtered.length > 0}
        <button class="report-btn" on:click={() => showReport = true}>
          <Icon name="download" size={4} />
          Report
        </button>
      {/if}
      <span class="ts-count">{totalSessions} session{totalSessions !== 1 ? 's' : ''}</span>
      {#if openSessions > 0}   <span class="ts-open">{openSessions} open</span>   {/if}
      {#if closedSessions > 0} <span class="ts-closed">{closedSessions} closed</span> {/if}
    </div>
  </div>

  <!-- ── Content ──────────────────────────────────────────────────────────── -->
  {#if loading}
    <div class="state-msg">
      <Icon name="loading" size={6} className="animate-spin text-purple-400" />
      <span>Loading sessions…</span>
    </div>

  {:else if error}
    <div class="alert-error">{error}</div>

  {:else if filtered.length === 0}
    <div class="empty-state py-16 text-center">
      <Icon name="clipboard" size={12} className="text-gray-600 mx-auto mb-3" />
      <p class="text-gray-500">
        {hasFilters ? 'No sessions match the current filters.' : 'No walk sessions recorded yet.'}
      </p>
    </div>

  {:else}
    <div class="session-list">
      {#each filtered as session (session.id)}
        {@const isExpanded     = expandedId === session.id}
        {@const isLoadingThis  = loadingId === session.id}

        <div class="sess-card">

          <!-- ── Session row ─────────────────────────────────────────────── -->
          <div class="sess-row-wrap">
          <button class="sess-row" on:click={() => toggleExpand(session)}>
            <span class="chev">{isExpanded ? '▾' : '▸'}</span>
            <span class="type-ico">{typeIcon(session.element_type)}</span>

            <div class="sess-main">
              <div class="sess-hdr">
                <span class="sess-building">{session.building}</span>
                <span class="sess-floor">Floor {session.floor_level}</span>
                <span class="sep-dot">·</span>
                <span class="sess-type">{typeLabel(session.element_type)}</span>
                {#if session.light_subtype_filter === 'emergency'}
                  <span class="em-badge">⚠ Emergency</span>
                {/if}
                {#if session.session_name}
                  <span class="sess-name">{session.session_name}</span>
                {/if}
              </div>
              <div class="sess-meta">
                <span>{fmtDateTime(session.started_at)}</span>
                {#if session.closed_at}
                  <span>→ {fmtTime(session.closed_at)}</span>
                  {#if duration(session)}<span class="dur">({duration(session)})</span>{/if}
                {/if}
                {#if session.inspector_name}
                  <span class="sep-dot">·</span>
                  <span class="sess-inspector">{session.inspector_name}</span>
                {:else if session.inspector?.full_name}
                  <span class="sep-dot">·</span>
                  <span class="sess-inspector">{session.inspector.full_name}</span>
                {/if}
              </div>
            </div>

            <!-- Quick stats if already loaded -->
            {#if inspections[session.id]}
              {@const st = sessionStats(session.id)}
              <div class="quick-stats">
                {#if st.fail > 0}<span class="qs-fail">✗ {st.fail}</span>{/if}
                {#if st.pass > 0}<span class="qs-pass">✓ {st.pass}</span>{/if}
                <span class="qs-el">{st.elements} el.</span>
              </div>
            {/if}

            <span class="status-badge" class:status-open={session.status === 'open'}
                                       class:status-closed={session.status === 'closed'}>
              {session.status}
            </span>
          </button>

          {#if isAdmin}
            <button
              class="del-btn"
              class:del-confirm={confirmId === session.id}
              class:del-busy={deletingId === session.id}
              disabled={deletingId === session.id}
              title={confirmId === session.id ? 'Click again to confirm delete' : 'Delete session'}
              on:click={() => handleDelete(session)}
              on:blur={() => { if (confirmId === session.id) confirmId = null; }}
            >
              {#if deletingId === session.id}…{:else if confirmId === session.id}Sure?{:else}🗑{/if}
            </button>
          {/if}
          </div>

          <!-- ── Expanded detail ─────────────────────────────────────────── -->
          {#if isExpanded}
            <div class="sess-detail">

              {#if isLoadingThis}
                <p class="detail-msg">Loading inspections…</p>

              {:else if !inspections[session.id] || inspections[session.id].length === 0}
                <p class="detail-msg italic">No inspections recorded in this session.</p>

              {:else}
                {@const els = groupByElement(inspections[session.id])}
                {@const st  = sessionStats(session.id)}

                <div class="detail-stats">
                  <span>{st.elements} elements inspected</span>
                  {#if st.pass > 0} <span class="ds-pass">✓ {st.pass} pass</span> {/if}
                  {#if st.fail > 0} <span class="ds-fail">✗ {st.fail} fail</span> {/if}
                  {#if st.na   > 0} <span class="ds-na">— {st.na} n/a</span>      {/if}
                </div>

                {#if session.notes}
                  <div class="sess-notes">"{session.notes}"</div>
                {/if}

                <div class="el-grid">
                  {#each els as el}
                    {@const worst = worstResult(el.rows)}
                    <div class="el-card el-{worst}">
                      <span class="el-icon el-icon-{worst}">
                        {worst === 'pass' ? '✓' : worst === 'fail' ? '✗' : '—'}
                      </span>
                      <div class="el-info">
                        <span class="el-id">{el.asset_id || '—'}</span>
                        {#if el.subtype}<span class="el-sub">{el.subtype}</span>{/if}
                        {#each el.rows.filter(r => r.notes) as r}
                          <div class="el-note">{r.notes}</div>
                        {/each}
                      </div>
                      {#if el.rows.length > 1}
                        <span class="el-count">×{el.rows.length}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

        </div>
      {/each}
    </div>
  {/if}

</div>

{#if showReport}
  <WalkInspectionsReport
    sessions={filtered}
    inspectionsCache={inspections}
    on:close={() => showReport = false}
  />
{/if}

<style>
  .wi-tab { display: flex; flex-direction: column; gap: 1rem; }

  /* ── Toolbar ──────────────────────────────────────────────────────────────*/
  .toolbar {
    display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem;
    padding-bottom: 0.75rem; border-bottom: 1px solid rgb(71 85 105 / 0.5);
  }
  .filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.625rem; }
  .fld     { display: flex; flex-direction: column; gap: 0.25rem; }
  .flbl    { font-size: 0.7rem; color: rgb(156 163 175); }

  .fsel, .finput {
    font-size: 0.875rem; padding: 0.375rem 0.625rem;
    background: rgb(30 41 59); border: 1px solid rgb(71 85 105);
    border-radius: 6px; color: #e2e8f0;
  }
  .fsel:focus, .finput:focus { outline: none; border-color: rgb(139 92 246); }

  .clear-btn {
    font-size: 0.75rem; color: rgb(156 163 175); background: none; border: none;
    cursor: pointer; padding: 0.375rem 0; align-self: flex-end; transition: color 0.15s;
  }
  .clear-btn:hover { color: #fff; }

  .toolbar-summary { margin-left: auto; display: flex; align-items: center; gap: 1rem; font-size: 0.875rem; }

  .report-btn {
    display: flex; align-items: center; gap: 0.375rem;
    font-size: 0.8rem; padding: 0.375rem 0.75rem;
    background: rgb(139 92 246 / 0.15); border: 1px solid rgb(139 92 246 / 0.4);
    border-radius: 6px; color: rgb(167 139 250); cursor: pointer; transition: all 0.15s;
  }
  .report-btn:hover { background: rgb(139 92 246 / 0.25); border-color: rgb(139 92 246 / 0.7); color: #c4b5fd; }
  .ts-count  { color: rgb(156 163 175); }
  .ts-open   { color: rgb(251 191 36); }
  .ts-closed { color: rgb(107 114 128); }

  /* ── Session list ─────────────────────────────────────────────────────────*/
  .session-list { display: flex; flex-direction: column; gap: 0.5rem; }

  .sess-card { background: rgb(51 65 85 / 0.4); border: 1px solid rgb(71 85 105); border-radius: 8px; overflow: hidden; }

  .sess-row-wrap { display: flex; align-items: stretch; }

  .sess-row {
    flex: 1;
    text-align: left; padding: 0.75rem 1rem;
    display: flex; align-items: center; gap: 0.75rem;
    background: none; border: none; cursor: pointer;
    transition: background 0.15s;
  }
  .sess-row:hover { background: rgb(71 85 105 / 0.4); }

  /* Delete button */
  .del-btn {
    flex-shrink: 0; padding: 0 0.875rem;
    background: none; border: none; border-left: 1px solid rgb(71 85 105 / 0.5);
    color: rgb(107 114 128); font-size: 0.875rem; cursor: pointer;
    transition: all 0.15s; white-space: nowrap;
  }
  .del-btn:hover    { background: rgb(239 68 68 / 0.1); color: rgb(248 113 113); border-left-color: rgb(239 68 68 / 0.3); }
  .del-btn.del-confirm { background: rgb(239 68 68 / 0.15); color: rgb(252 165 165); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; }
  .del-btn.del-busy { opacity: 0.5; cursor: not-allowed; }

  .chev     { color: rgb(107 114 128); font-size: 0.875rem; flex-shrink: 0; width: 1rem; }
  .type-ico { font-size: 1.125rem; flex-shrink: 0; }

  .sess-main { flex: 1; min-width: 0; }

  .sess-hdr  { display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
  .sess-building { font-weight: 600; color: #fff; }
  .sess-floor    { color: rgb(156 163 175); font-size: 0.875rem; }
  .sep-dot       { color: rgb(107 114 128); }
  .sess-type     { color: rgb(209 213 219); font-size: 0.875rem; }
  .em-badge      { font-size: 0.72rem; padding: 0.1rem 0.35rem; background: rgba(234,179,8,0.15); color: rgb(251 191 36); border-radius: 3px; }
  .sess-name     { font-size: 0.72rem; color: rgb(167 139 250); font-style: italic; }

  .sess-meta     { font-size: 0.72rem; color: rgb(107 114 128); margin-top: 0.125rem; display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
  .dur           { color: rgb(75 85 99); }
  .sess-inspector { color: rgb(167 139 250); }

  .quick-stats { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; flex-shrink: 0; }
  .qs-fail { color: rgb(248 113 113); font-weight: 600; }
  .qs-pass { color: rgb(74 222 128); }
  .qs-el   { color: rgb(107 114 128); }

  .status-badge {
    flex-shrink: 0; font-size: 0.72rem; padding: 0.2rem 0.5rem;
    border-radius: 9999px; border: 1px solid transparent;
  }
  .status-open   { background: rgb(217 119 6 / 0.2); color: rgb(251 191 36); border-color: rgb(217 119 6 / 0.3); }
  .status-closed { background: rgb(71 85 105 / 0.5); color: rgb(156 163 175); border-color: rgb(71 85 105); }

  /* ── Expanded detail ──────────────────────────────────────────────────────*/
  .sess-detail { border-top: 1px solid rgb(71 85 105); padding: 0.875rem 1rem 1rem; background: rgb(30 41 59 / 0.4); }
  .detail-msg  { color: rgb(107 114 128); font-size: 0.875rem; padding: 0.5rem 0; }
  .italic      { font-style: italic; }

  .detail-stats { display: flex; align-items: center; gap: 1.5rem; font-size: 0.875rem; margin-bottom: 0.75rem; color: rgb(156 163 175); flex-wrap: wrap; }
  .ds-pass { color: rgb(74 222 128); }
  .ds-fail { color: rgb(248 113 113); font-weight: 600; }
  .ds-na   { color: rgb(107 114 128); }

  .sess-notes { font-size: 0.875rem; color: rgb(156 163 175); font-style: italic; margin-bottom: 0.75rem; padding-left: 0.75rem; border-left: 2px solid rgb(71 85 105); }

  .el-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.375rem;
  }
  .el-card {
    display: flex; align-items: flex-start; gap: 0.5rem;
    padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid transparent;
    background: rgb(51 65 85 / 0.5);
  }
  .el-pass { border-color: rgb(22 101 52 / 0.6); }
  .el-fail { border-color: rgb(127 29 29 / 0.6); }
  .el-na   { border-color: rgb(71 85 105 / 0.5); }

  .el-icon      { font-size: 0.875rem; font-weight: 700; flex-shrink: 0; padding-top: 0.1rem; }
  .el-icon-pass { color: rgb(74 222 128); }
  .el-icon-fail { color: rgb(248 113 113); }
  .el-icon-na   { color: rgb(107 114 128); }

  .el-info { min-width: 0; flex: 1; }
  .el-id   { color: #fff; font-size: 0.875rem; font-weight: 500; }
  .el-sub  { color: rgb(107 114 128); font-size: 0.72rem; margin-left: 0.25rem; }
  .el-note { color: rgb(107 114 128); font-size: 0.72rem; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .el-count { color: rgb(75 85 99); font-size: 0.72rem; flex-shrink: 0; }

  /* ── States ───────────────────────────────────────────────────────────────*/
  .state-msg { display: flex; align-items: center; gap: 0.75rem; padding: 3rem; color: rgb(156 163 175); font-size: 0.875rem; }
  .alert-error { background: rgb(127 29 29 / 0.3); border: 1px solid rgb(239 68 68 / 0.5); border-radius: 6px; padding: 0.75rem 1rem; color: rgb(248 113 113); font-size: 0.875rem; }
  .empty-state { padding: 4rem 0; text-align: center; }
</style>
