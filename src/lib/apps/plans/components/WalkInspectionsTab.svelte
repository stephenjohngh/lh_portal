<!-- src/lib/apps/plans/components/WalkInspectionsTab.svelte -->
<!-- FIX: Report modal now defaults to latest session or expanded session -->
<!-- FIX: Join includes floor_level from plans for correct building-wide display names -->
<script>
  import { onMount }   from 'svelte';
  import Icon          from '$lib/components/icons/Icon.svelte';
  import { api }       from '$lib/utils/api';
  import { getLogger } from '$lib/utils/logger';
  import { ELEMENT_TYPE_OPTIONS, getElementDisplayName } from '$lib/utils/planConstants';
  import { walkStore }           from '$lib/apps/walk/stores/walkStore.js';
  import { sessionStats, groupByElement, worstResult, flattenInspectionRows, getTypeLabel, getTypeIcon, sessionFloorLabel } from '$lib/apps/walk/utils/walkHelpers.js';
  import { fmtDate, fmtTime, fmtDateTime, fmtDuration } from '$lib/utils/dates';
  import WalkInspectionsReport   from './WalkInspectionsReport.svelte';
  import WalkInspectionDetailModal from './WalkInspectionDetailModal.svelte';

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
  let deletingId   = null;
  let confirmId    = null;
  
  // FIX: Track which session should be pre-selected in report
  let reportInitialSelection = [];
  
  // NEW: Inspection detail modal
  let selectedInspection = null;
  let showInspectionDetail = false;

  // ── Filters ──────────────────────────────────────────────────────────────
  let filterBuilding     = '';
  let filterType         = '';
  let filterSessionType  = 'test';
  let filterStatus       = '';
  let filterDateFrom     = '';
  let filterDateTo       = '';

  $: buildings = [...new Set(sessions.map(s => s.building))].sort();

  $: filtered = sessions.filter(s => {
    if (filterBuilding    && s.building !== filterBuilding)       return false;
    if (filterType        && s.element_type !== filterType)       return false;
    if (filterSessionType && s.session_type !== filterSessionType) return false;
    if (filterStatus      && s.status !== filterStatus)           return false;
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
  $: hasFilters = filterBuilding || filterType || filterSessionType !== 'test' || filterStatus || filterDateFrom || filterDateTo;

  onMount(loadSessions);

  async function loadSessions() {
    loading = true; error = null;
    try {
      sessions = await api.get('walk_sessions', {
        select:    '*, inspector:profiles!created_by(full_name), walk_element_inspections(inspection_result)',
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
        // FIX: Join includes plan:plans!plan_id(floor_level) so building-wide
        // sessions get the correct floor per element (session.floor_level is NULL
        // for building-wide sessions and cannot be used for display names).
        const rows = await api.get('walk_element_inspections', {
          select: '*, element:plan_elements!plan_element_id(asset_id, subtype, label, element_type, plan:plans!plan_id(floor_level))',
          filters: { walk_session_id: session.id },
          orderBy: 'inspected_at',
          ascending: true
        });
        const processedRows = flattenInspectionRows(rows);
        inspections = { ...inspections, [session.id]: processedRows };
      } catch (err) {
        logger('❌ load inspections:', err.message);
        inspections = { ...inspections, [session.id]: [] };
      } finally { loadingId = null; }
    }
  }

  // FIX: Smart report opening - select expanded session or latest
  function openReport() {
    if (expandedId && filtered.find(s => s.id === expandedId)) {
      // If a session is expanded, pre-select that one
      reportInitialSelection = [expandedId];
      logger('Opening report with expanded session:', expandedId);
    } else if (filtered.length > 0) {
      // Otherwise, pre-select the latest (first) session
      reportInitialSelection = [filtered[0].id];
      logger('Opening report with latest session:', filtered[0].id);
    } else {
      reportInitialSelection = [];
    }
    showReport = true;
  }

  async function handleDelete(session) {
    if (confirmId !== session.id) { confirmId = session.id; return; }
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
    } finally { deletingId = null; }
  }

  function clearFilters() {
    filterBuilding = filterType = filterStatus = filterDateFrom = filterDateTo = '';
    filterSessionType = 'test';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  // typeLabel, typeIcon, sessionFloorLabel — imported from walkHelpers
</script>

<div class="wi-tab">
  <div class="toolbar">
    <div class="filters">
      <div class="fld">
        <label for="wi-building" class="flbl">Building</label>
        <select id="wi-building" class="select text-sm" bind:value={filterBuilding}>
          <option value="">All buildings</option>
          {#each buildings as b}<option value={b}>{b}</option>{/each}
        </select>
      </div>
      <div class="fld">
        <label for="wi-type" class="flbl">Type</label>
        <select id="wi-type" class="select text-sm" bind:value={filterType}>
          <option value="">All types</option>
          {#each ELEMENT_TYPE_OPTIONS as t}<option value={t.value}>{t.icon} {t.label}</option>{/each}
        </select>
      </div>
      <div class="fld">
        <label for="wi-status" class="flbl">Status</label>
        <select id="wi-status" class="select text-sm" bind:value={filterStatus}>
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <div class="fld">
        <label for="wi-session-type" class="flbl">Session type</label>
        <select id="wi-session-type" class="select text-sm" bind:value={filterSessionType}>
          <option value="">All</option>
          <option value="test">Test</option>
          <option value="inspection">Inspection</option>
        </select>
      </div>
      <div class="fld">
        <label for="wi-from" class="flbl">From</label>
        <input id="wi-from" type="date" class="input text-sm" bind:value={filterDateFrom} />
      </div>
      <div class="fld">
        <label for="wi-to" class="flbl">To</label>
        <input id="wi-to" type="date" class="input text-sm" bind:value={filterDateTo} />
      </div>
      {#if hasFilters}
        <button class="clear-btn" on:click={clearFilters}>Clear filters</button>
      {/if}
    </div>
    <div class="toolbar-summary">
      {#if filtered.length > 0}
        <!-- FIX: Use openReport() instead of direct assignment -->
        <button class="report-btn" on:click={openReport}>
          <Icon name="download" size={4} />
          Report
        </button>
      {/if}
      <span class="ts-count">{totalSessions} session{totalSessions !== 1 ? 's' : ''}</span>
      {#if openSessions > 0}   <span class="ts-open">{openSessions} open</span>   {/if}
      {#if closedSessions > 0} <span class="ts-closed">{closedSessions} closed</span> {/if}
    </div>
  </div>

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
        {@const isExpanded    = expandedId === session.id}
        {@const isLoadingThis = loadingId === session.id}
        {@const st = (() => {
          // Full cache available post-expand — use sessionStats (has plan_element_id)
          if (inspections[session.id]?.length) return sessionStats(inspections[session.id]);
          // Lightweight rows from loadSessions embed: { inspection_result } only
          const lite = session.walk_element_inspections;
          if (!lite?.length) return null;
          return {
            pass:     lite.filter(r => r.inspection_result === 'pass').length,
            fail:     lite.filter(r => r.inspection_result === 'fail').length,
            na:       lite.filter(r => r.inspection_result === 'na').length,
            elements: lite.length,   // approximate — unique per inspection row
            total:    lite.length
          };
        })()}
        <div class="sess-card">
          <div class="sess-row-wrap">
          <button class="sess-row" on:click={() => toggleExpand(session)}>
            <span class="chev">{isExpanded ? '▾' : '▸'}</span>
            <span class="type-ico">{getTypeIcon(session.element_type)}</span>
            <div class="sess-main">
              <div class="sess-hdr">
                <span class="sess-building">{session.building}</span>
                {#if session.session_scope !== 'building'}
                  <span class="sess-floor">{sessionFloorLabel(session)}</span>
                {/if}
                <span class="sep-dot">·</span>
                <span class="sess-type">{getTypeLabel(session.element_type)}</span>
                {#if session.light_subtype_filter === 'emergency'}
                  <span class="em-badge">⚠ Emergency</span>
                {/if}
                {#if session.session_type === 'inspection'}
                  <span class="stype-badge stype-insp">INSPECTION</span>
                {:else if session.session_type === 'test'}
                  <span class="stype-badge stype-test">TEST</span>
                {/if}
                {#if session.session_name}
                  <span class="sess-name">{session.session_name}</span>
                {/if}
              </div>
              <div class="sess-meta">
                <span>{fmtDateTime(session.started_at)}</span>
                {#if session.closed_at}
                  <span>→ {fmtTime(session.closed_at)}</span>
                  {@const dur = fmtDuration(session.started_at, session.closed_at)}
                  {#if dur !== 'Open'}<span class="dur">({dur})</span>{/if}
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
            {#if st}
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
          {#if isExpanded}
            <div class="sess-detail">
              {#if isLoadingThis}
                <p class="detail-msg">Loading inspections…</p>
              {:else if !inspections[session.id] || inspections[session.id].length === 0}
                <p class="detail-msg italic">No inspections recorded in this session.</p>
              {:else}
                {@const els = groupByElement(inspections[session.id])}
                <div class="detail-stats">
                  <span>{st.elements} elements inspected</span>
                  {#if st.pass > 0} <span class="ds-pass">✓ {st.pass} pass</span> {/if}
                  {#if st.fail > 0} <span class="ds-fail">✗ {st.fail} fail</span> {/if}
                  {#if st.na   > 0} <span class="ds-na">— {st.na} n/a</span>      {/if}
                </div>
                {#if session.notes}
                  <div class="sess-notes">"{session.notes}"</div>
                {/if}
                
                <!-- NEW: Table view instead of grid -->
                <div class="inspection-table-wrapper">
                  <table class="inspection-table">
                    <thead>
                      <tr>
                        <th>Element</th>
                        <th>Label</th>
                        <th>Result</th>
                        <th>Time</th>
                        <th>Notes</th>
                        {#if inspections[session.id].some(i => i.photo_url)}
                          <th>Photo</th>
                        {/if}
                      </tr>
                    </thead>
                    <tbody>
                      {#each els as el (el.element_id)}
                        {@const worst = worstResult(el.rows)}
                        {@const firstRow = el.rows[0]}
                        <!-- FIX: Use firstRow.floor_level (joined from plans) not
                             session.floor_level which is NULL for building-wide sessions -->
                        {@const displayName = getElementDisplayName(firstRow, firstRow.floor_level)}
                        <tr 
                          class="inspection-row inspection-row-{worst}"
                          on:click={() => {
                            selectedInspection = { ...firstRow, result: worst };
                            showInspectionDetail = true;
                          }}
                        >
                          <td class="font-medium font-mono">{displayName}</td>
                          <td class="text-gray-400">{firstRow.label || '—'}</td>
                          <td>
                            <span class="result-badge result-{worst}">
                              {worst === 'pass' ? '✓ PASS' : worst === 'fail' ? '✗ FAIL' : '— N/A'}
                            </span>
                          </td>
                          <td class="text-sm text-gray-400">{fmtTime(firstRow.inspected_at)}</td>
                          <td class="text-sm text-gray-400 notes-cell">
                            {#if firstRow.inspector_notes || firstRow.notes}
                              {(firstRow.inspector_notes || firstRow.notes).substring(0, 50)}{(firstRow.inspector_notes || firstRow.notes).length > 50 ? '…' : ''}
                            {:else}
                              —
                            {/if}
                          </td>
                          {#if inspections[session.id].some(i => i.photo_url)}
                            <td>
                              {#if firstRow.photo_url}
                                <span class="photo-indicator">📷</span>
                              {:else}
                                —
                              {/if}
                            </td>
                          {/if}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
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
  <!-- FIX: Pass initial selection to report modal -->
  <WalkInspectionsReport
    sessions={filtered}
    initialSelectedIds={reportInitialSelection}
    inspectionsCache={inspections}
    on:close={() => showReport = false}
  />
{/if}

{#if showInspectionDetail && selectedInspection}
  <WalkInspectionDetailModal
    inspection={selectedInspection}
    floorLevel={selectedInspection.floor_level}
    on:close={() => {
      showInspectionDetail = false;
      selectedInspection = null;
    }}
  />
{/if}

<style>
  .wi-tab { display: flex; flex-direction: column; gap: 1rem; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgb(71 85 105 / 0.5); }
  .filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.625rem; }
  .fld { display: flex; flex-direction: column; gap: 0.25rem; }
  .flbl { font-size: 0.7rem; color: rgb(156 163 175); }
  .clear-btn { font-size: 0.75rem; color: rgb(156 163 175); background: none; border: none; cursor: pointer; padding: 0.375rem 0; align-self: flex-end; transition: color 0.15s; }
  .clear-btn:hover { color: #fff; }
  .toolbar-summary { margin-left: auto; display: flex; align-items: center; gap: 1rem; font-size: 0.875rem; }
  .report-btn { display: flex; align-items: center; gap: 0.375rem; font-size: 0.8rem; padding: 0.375rem 0.75rem; background: rgb(139 92 246 / 0.15); border: 1px solid rgb(139 92 246 / 0.4); border-radius: 6px; color: rgb(167 139 250); cursor: pointer; transition: all 0.15s; }
  .report-btn:hover { background: rgb(139 92 246 / 0.25); border-color: rgb(139 92 246 / 0.7); color: #c4b5fd; }
  .ts-count { color: rgb(156 163 175); }
  .ts-open { color: rgb(251 191 36); }
  .ts-closed { color: rgb(107 114 128); }
  .session-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .sess-card { background: rgb(51 65 85 / 0.4); border: 1px solid rgb(71 85 105); border-radius: 8px; overflow: hidden; }
  .sess-row-wrap { display: flex; align-items: stretch; }
  .sess-row { flex: 1; text-align: left; padding: 0.75rem 1rem; display: flex; align-items: center; gap: 0.75rem; background: none; border: none; cursor: pointer; transition: background 0.15s; }
  .sess-row:hover { background: rgb(71 85 105 / 0.4); }
  .del-btn { flex-shrink: 0; padding: 0 0.875rem; background: none; border: none; border-left: 1px solid rgb(71 85 105 / 0.5); color: rgb(107 114 128); font-size: 0.875rem; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .del-btn:hover { background: rgb(239 68 68 / 0.1); color: rgb(248 113 113); border-left-color: rgb(239 68 68 / 0.3); }
  .del-btn.del-confirm { background: rgb(239 68 68 / 0.15); color: rgb(252 165 165); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; }
  .del-btn.del-busy { opacity: 0.5; cursor: not-allowed; }
  .chev { color: rgb(107 114 128); font-size: 0.875rem; flex-shrink: 0; width: 1rem; }
  .type-ico { font-size: 1.125rem; flex-shrink: 0; }
  .sess-main { flex: 1; min-width: 0; }
  .sess-hdr { display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
  .sess-building { font-weight: 600; color: #fff; }
  .sess-floor { color: rgb(156 163 175); font-size: 0.875rem; }
  .sep-dot { color: rgb(107 114 128); }
  .sess-type { color: rgb(209 213 219); font-size: 0.875rem; }
  .em-badge { font-size: 0.72rem; padding: 0.1rem 0.35rem; background: rgba(234,179,8,0.15); color: rgb(251 191 36); border-radius: 3px; }
  .sess-name { font-size: 0.72rem; color: rgb(167 139 250); font-style: italic; }
  .sess-meta { font-size: 0.72rem; color: rgb(107 114 128); margin-top: 0.125rem; display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
  .dur { color: rgb(75 85 99); }
  .sess-inspector { color: rgb(167 139 250); }
  .quick-stats { display: flex; align-items: center; gap: 0.5rem; font-size: 0.95rem; flex-shrink: 0; }
  .qs-fail { color: rgb(248 113 113); font-weight: 700; }
  .qs-pass { color: rgb(74 222 128); font-weight: 600; }
  .qs-el { color: rgb(107 114 128); }
  .stype-badge { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; padding: 0.1rem 0.4rem; border-radius: 3px; flex-shrink: 0; }
  .stype-test { background: rgb(251 146 60 / 0.15); color: rgb(251 146 60); border: 1px solid rgb(251 146 60 / 0.3); }
  .stype-insp { background: rgb(96 165 250 / 0.15); color: rgb(96 165 250); border: 1px solid rgb(96 165 250 / 0.3); }
  .status-badge { flex-shrink: 0; font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 9999px; border: 1px solid transparent; }
  .status-open { background: rgb(217 119 6 / 0.2); color: rgb(251 191 36); border-color: rgb(217 119 6 / 0.3); }
  .status-closed { background: rgb(71 85 105 / 0.5); color: rgb(156 163 175); border-color: rgb(71 85 105); }
  .sess-detail { border-top: 1px solid rgb(71 85 105); padding: 0.875rem 1rem 1rem; background: rgb(30 41 59 / 0.4); }
  .detail-msg { color: rgb(107 114 128); font-size: 0.875rem; padding: 0.5rem 0; }
  .italic { font-style: italic; }
  .detail-stats { display: flex; align-items: center; gap: 1.5rem; font-size: 0.875rem; margin-bottom: 0.75rem; color: rgb(156 163 175); flex-wrap: wrap; }
  .ds-pass { color: rgb(74 222 128); }
  .ds-fail { color: rgb(248 113 113); font-weight: 600; }
  .ds-na { color: rgb(107 114 128); }
  .sess-notes { font-size: 0.875rem; color: rgb(156 163 175); font-style: italic; margin-bottom: 0.75rem; padding-left: 0.75rem; border-left: 2px solid rgb(71 85 105); }
  
  /* NEW: Inspection table styles */
  .inspection-table-wrapper { overflow-x: auto; border-radius: 6px; border: 1px solid rgb(71 85 105); }
  .inspection-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  .inspection-table thead { background: rgb(51 65 85 / 0.6); border-bottom: 1px solid rgb(71 85 105); }
  .inspection-table th { text-align: left; padding: 0.625rem 0.75rem; font-weight: 600; font-size: 0.75rem; letter-spacing: 0.05em; color: rgb(209 213 219); }
  .inspection-row { border-bottom: 1px solid rgb(71 85 105 / 0.5); cursor: pointer; transition: background 0.15s; }
  .inspection-row:hover { background: rgb(71 85 105 / 0.4); }
  .inspection-row td { padding: 0.75rem; }
  .result-badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; }
  .result-pass { background: rgb(22 101 52 / 0.3); color: rgb(74 222 128); border: 1px solid rgb(22 101 52); }
  .result-fail { background: rgb(127 29 29 / 0.3); color: rgb(248 113 113); border: 1px solid rgb(127 29 29); }
  .result-na { background: rgb(71 85 105 / 0.3); color: rgb(156 163 175); border: 1px solid rgb(71 85 105); }
  .notes-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .photo-indicator { font-size: 1.25rem; }
  
  .state-msg { display: flex; align-items: center; gap: 0.75rem; padding: 3rem; color: rgb(156 163 175); font-size: 0.875rem; }
  .alert-error { background: rgb(127 29 29 / 0.3); border: 1px solid rgb(239 68 68 / 0.5); border-radius: 6px; padding: 0.75rem 1rem; color: rgb(248 113 113); font-size: 0.875rem; }
  .empty-state { padding: 4rem 0; text-align: center; }
</style>
