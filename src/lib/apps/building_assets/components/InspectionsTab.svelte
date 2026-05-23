<!-- src/lib/apps/building_assets/components/InspectionsTab.svelte -->
<!-- All inspection walk sessions, open first then latest-first.
     Backed by walk_sessions; expand a row to see per-component detail. -->
<script>
  import { onMount }         from 'svelte';
  import { api }             from '$lib/utils/api';
  import { getLogger }       from '$lib/utils/logger';
  import { buildingAssetsStore }    from '../stores/buildingAssetsStore.js';
  import {
    flattenInspectionRows,
    groupByComponent,
    sessionStats,
    worstResult,
    resultLabel,
    sessionFloorLabel,
    presetLabel,
  } from '$lib/apps/inspection/utils/inspectionHelpers.js';
  import { resultBadgeColor } from '$lib/utils/resultConstants.js';
  import { fmtDate, fmtTime, fmtDateTime, fmtDuration } from '$lib/utils/dates';
  import Badge           from '$lib/components/common/Badge.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import LoadingSpinner  from '$lib/components/common/LoadingSpinner.svelte';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import Icon                from '$lib/components/icons/Icon.svelte';
  import Button              from '$lib/components/common/Button.svelte';
  import InspectionsReport from './InspectionsReport.svelte';
  import ConditionChecklistChips from './ConditionChecklistChips.svelte';
  import { typeByCode, conditionChecklistDisplay } from '../lookups.js';

  const logger = getLogger('InspectionsTab');

  // -- Store refs ----------------------------------------------------------
  $: floors = $buildingAssetsStore.floors;
  $: types  = $buildingAssetsStore.types;

  // -- State ----------------------------------------------------------------
  let sessions    = [];
  let inspections = {};      // { [sessionId]: flattened inspection[] }
  let showReport  = false;
  let loading     = true;
  let loadingId   = null;
  let error       = null;
  let expandedId  = null;
  let deletingId  = null;
  let confirmId   = null;

  // Expanded component rows (one per session-component pair).
  // Key: `${sessionId}:${componentId}` — keeps state isolated per session.
  let expandedRowKeys = new Set();
  function toggleRow(sessionId, componentId) {
    const key = `${sessionId}:${componentId}`;
    const next = new Set(expandedRowKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    expandedRowKeys = next;
  }
  /** Effective condition-attribute defs for a type, looked up from the store. */
  function condDefsFor(typeCode) {
    const t = typeByCode($buildingAssetsStore.types, typeCode);
    return t ? ($buildingAssetsStore.attrDefs[t.id] ?? []) : [];
  }

  // -- Filters --------------------------------------------------------------
  let filterStatus      = '';
  let filterSessionType = '';
  let filterPreset      = '';
  let filterDateFrom    = '';
  let filterDateTo      = '';

  // -- Derived: sort then filter --------------------------------------------
  // Open sessions always float to top; within each status group, latest first.
  $: sorted = [...sessions].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return new Date(b.started_at) - new Date(a.started_at);
  });

  $: filtered = sorted.filter(s => {
    if (filterStatus      && s.status !== filterStatus)            return false;
    if (filterSessionType && s.session_type !== filterSessionType) return false;
    if (filterPreset      && s.session_preset !== filterPreset)    return false;
    if (filterDateFrom && new Date(s.started_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(s.started_at) > to) return false;
    }
    return true;
  });

  $: openCount   = filtered.filter(s => s.status === 'open').length;
  $: closedCount = filtered.filter(s => s.status === 'closed').length;
  $: hasFilters  = filterSessionType || filterPreset || filterDateFrom || filterDateTo;

  onMount(loadSessions);

  // -- Data loading ---------------------------------------------------------
  async function loadSessions() {
    loading = true; error = null;
    try {
      sessions = await api.get('walk_sessions', {
        select:    '*, inspector:profiles!created_by(full_name)',
        orderBy:   'started_at',
        ascending: false,
      });
      logger('✅ Loaded', sessions.length, 'sessions');
    } catch (err) {
      logger('❌ loadSessions:', err.message);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function toggleExpand(session) {
    if (expandedId === session.id) { expandedId = null; return; }
    expandedId = session.id;
    if (!inspections[session.id]) {
      loadingId = session.id;
      try {
        const rows = await api.get('component_inspections', {
          select:    '*, component:components!component_id(asset_id, label, type_code, floor:floors!floor_id(short_name, level_order))',
          filters:   { walk_session_id: session.id },
          orderBy:   'inspected_at',
          ascending: true,
        });
        inspections = { ...inspections, [session.id]: flattenInspectionRows(rows) };
      } catch (err) {
        logger('❌ load inspections:', err.message);
        inspections = { ...inspections, [session.id]: [] };
      } finally {
        loadingId = null;
      }
    }
  }

  async function handleDelete(session) {
    if (confirmId !== session.id) { confirmId = session.id; return; }
    confirmId  = null;
    deletingId = session.id;
    try {
      await api.delete('walk_sessions', session.id);
      sessions   = sessions.filter(s => s.id !== session.id);
      if (expandedId === session.id) expandedId = null;
      const { [session.id]: _, ...rest } = inspections;
      inspections = rest;
      logger('✅ Session deleted');
    } catch (err) {
      logger('❌ deleteSession:', err.message);
      error = err.message;
    } finally {
      deletingId = null;
    }
  }

  function clearFilters() {
    filterSessionType = '';
    filterPreset      = '';
    filterDateFrom    = '';
    filterDateTo      = '';
  }

  // -- Badge colours --------------------------------------------------------
  // resultBadgeColor is imported from $lib/utils/resultConstants.js
  function sessionTypeBadge(t) {
    return { inspection: 'bg-blue-600', test: 'bg-amber-600', repair: 'bg-orange-700' }[t] ?? 'bg-slate-600';
  }
  function presetBadge(p) {
    return { emergency_lighting: 'bg-amber-600', fire_doors: 'bg-red-700', apartment_doors: 'bg-purple-700', custom: 'bg-slate-600' }[p] ?? 'bg-slate-600';
  }
</script>

<div class="insp-tab">

  <!-- -- Toolbar ------------------------------------------------------------ -->
  <div class="toolbar">
    <div class="filters">

      <div class="fld">
        <label for="insp-status" class="flbl">Status</label>
        <select id="insp-status" class="select text-sm" bind:value={filterStatus}>
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div class="fld">
        <label for="insp-stype" class="flbl">Session type</label>
        <select id="insp-stype" class="select text-sm" bind:value={filterSessionType}>
          <option value="">All</option>
          <option value="test">Test</option>
          <option value="inspection">Inspection</option>
          <option value="repair">Repair</option>
        </select>
      </div>

      <div class="fld">
        <label for="insp-preset" class="flbl">Preset</label>
        <select id="insp-preset" class="select text-sm" bind:value={filterPreset}>
          <option value="">All presets</option>
          <option value="emergency_lighting">Emergency Lighting</option>
          <option value="fire_doors">Fire Doors</option>
          <option value="apartment_doors">Apartment Doors</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div class="fld">
        <label for="insp-from" class="flbl">From</label>
        <input id="insp-from" type="date" class="input text-sm" bind:value={filterDateFrom} />
      </div>

      <div class="fld">
        <label for="insp-to" class="flbl">To</label>
        <input id="insp-to" type="date" class="input text-sm" bind:value={filterDateTo} />
      </div>

      {#if hasFilters}
        <button class="clear-btn" on:click={clearFilters}>Clear filters</button>
      {/if}
    </div>

    <div class="toolbar-summary">
      <span class="ts-count">{filtered.length} session{filtered.length !== 1 ? 's' : ''}</span>
      {#if openCount   > 0}<span class="ts-open">{openCount} open</span>{/if}
      {#if closedCount > 0}<span class="ts-closed">{closedCount} closed</span>{/if}
      <Button variant="secondary" size="small" icon="download"
        disabled={filtered.length === 0}
        on:click={() => showReport = true}>
        Report
      </Button>
    </div>
  </div>

  <!-- -- Body --------------------------------------------------------------- -->
  {#if loading}
    <div class="state-center">
      <LoadingSpinner size="medium" text="Loading sessions…" />
    </div>

  {:else if error}
    <ErrorDisplay message={error} onDismiss={() => error = null} />

  {:else if filtered.length === 0}
    <div class="empty-state">
      <Icon name="clipboard" size={12} className="text-gray-600 mx-auto mb-3" />
      <p class="text-gray-500">
        {hasFilters ? 'No sessions match the current filters.' : 'No inspection sessions recorded yet.'}
      </p>
    </div>

  {:else}
    <div class="session-list">
      {#each filtered as session (session.id)}
        {@const isExpanded    = expandedId    === session.id}
        {@const isLoadingThis = loadingId     === session.id}
        {@const rowInspections = inspections[session.id]}
        {@const st = rowInspections?.length ? sessionStats(rowInspections) : null}
        {@const floorLabel = sessionFloorLabel(session, floors)}

        <div class="sess-card" class:sess-open={session.status === 'open'}>

          <!-- -- Session row ------------------------------------------------ -->
          <div class="sess-row-wrap">
            <button class="sess-row" on:click={() => toggleExpand(session)}>
              <span class="chev">{isExpanded ? '▾' : '▸'}</span>

              <div class="sess-main">
                <!-- Header line -->
                <div class="sess-hdr">
                  <span class="sess-building">{session.building}</span>
                  <span class="sep-dot">·</span>
                  <span class="sess-floor">{floorLabel}</span>

                  {#if session.session_type}
                    <Badge color={sessionTypeBadge(session.session_type)} size="small">
                      {session.session_type.toUpperCase()}
                    </Badge>
                  {/if}

                  {#if session.session_preset && session.session_preset !== 'custom'}
                    <Badge color={presetBadge(session.session_preset)} size="small">
                      {presetLabel(session.session_preset)}
                    </Badge>
                  {/if}

                  {#if session.emergency_only}
                    <span class="em-badge">⚠ Emergency only</span>
                  {/if}

                  {#if session.session_name}
                    <span class="sess-name">{session.session_name}</span>
                  {/if}
                </div>

                <!-- Meta line -->
                <div class="sess-meta">
                  <span>{fmtDateTime(session.started_at)}</span>
                  {#if session.closed_at}
                    <span>→ {fmtTime(session.closed_at)}</span>
                    {@const dur = fmtDuration(session.started_at, session.closed_at)}
                    {#if dur !== 'Open'}<span class="dur">({dur})</span>{/if}
                  {/if}
                  <span class="sep-dot">·</span>
                  {#if session.inspector_name}
                    <span class="sess-inspector">{session.inspector_name}</span>
                  {:else if session.inspector?.full_name}
                    <span class="sess-inspector">{session.inspector.full_name}</span>
                  {/if}
                </div>
              </div>

              <!-- Quick stats: use full inspection stats if loaded, else session counts -->
              <div class="quick-stats">
                {#if st}
                  {#if st.failed   > 0}<span class="qs-fail">✗ {st.failed}</span>{/if}
                  {#if st.problem  > 0}<span class="qs-repair">⚙ {st.problem}</span>{/if}
                  {#if st.ok       > 0}<span class="qs-pass">✓ {st.ok}</span>{/if}
                  <span class="qs-el">{st.components} comp.</span>
                {:else}
                  {@const done = session.inspected_components_count >= session.total_components_count && session.total_components_count > 0}
                  {#if session.session_type === 'test'}
                    <span class="{done ? 'qs-complete' : 'qs-el'}">
                      {done ? 'Completed' : 'Incomplete'}
                      {session.inspected_components_count}/{session.total_components_count}
                    </span>
                  {:else}
                    <span class="qs-el">
                      {session.inspected_components_count}/{session.total_components_count}
                    </span>
                  {/if}
                {/if}
              </div>

              <span class="status-badge"
                class:status-open={session.status === 'open'}
                class:status-closed={session.status === 'closed'}>
                {session.status}
              </span>
            </button>

            <!-- Admin delete (two-click confirm) -->
            <ProtectedButton
              requireAdmin={true}
              variant="danger"
              size="small"
              className="del-btn {confirmId === session.id ? 'del-confirm' : ''} {deletingId === session.id ? 'del-busy' : ''}"
              disabled={deletingId === session.id}
              title={confirmId === session.id ? 'Click again to confirm delete' : 'Delete session'}
              on:click={() => handleDelete(session)}
              on:blur={() => { if (confirmId === session.id) confirmId = null; }}
            >
              {#if deletingId === session.id}…{:else if confirmId === session.id}Sure?{:else}🗑{/if}
            </ProtectedButton>
          </div>

          <!-- -- Expanded detail -------------------------------------------- -->
          {#if isExpanded}
            <div class="sess-detail">
              {#if isLoadingThis}
                <LoadingSpinner size="small" text="Loading inspections…" />

              {:else if !rowInspections || rowInspections.length === 0}
                <p class="detail-msg">No inspections recorded in this session.</p>

              {:else}
                {@const groups = groupByComponent(rowInspections).sort((a, b) =>
                  new Date(a.rows[0].inspected_at) - new Date(b.rows[0].inspected_at)
                )}

                <!-- Stats summary -->
                <div class="detail-stats">
                  <span>{st?.components ?? groups.length} component{(st?.components ?? groups.length) !== 1 ? 's' : ''} inspected</span>
                  {#if st?.ok       > 0}<span class="ds-pass">✓ {st.ok} pass</span>{/if}
                  {#if st?.failed   > 0}<span class="ds-fail">✗ {st.failed} fail</span>{/if}
                  {#if st?.problem  > 0}<span class="ds-repair">⚙ {st.problem} problem</span>{/if}
                  {#if st?.inactive > 0}<span class="ds-na">— {st.inactive} inactive</span>{/if}
                </div>

                {#if session.notes}
                  <div class="sess-notes">"{session.notes}"</div>
                {/if}

                <!-- Inspection table -->
                <div class="insp-table-wrap">
                  <table class="insp-table">
                    <thead>
                      <tr>
                        <th class="w-6"></th>
                        <th>Component</th>
                        <th>Type</th>
                        <th>Label</th>
                        <th>Result</th>
                        <th>Time</th>
                        <th>Notes</th>
                        {#if rowInspections.some(i => i.photo_urls?.length > 0)}
                          <th>Photos</th>
                        {/if}
                      </tr>
                    </thead>
                    <tbody>
                      {#each groups as grp (grp.component_id)}
                        {@const worst        = worstResult(grp.rows)}
                        {@const firstRow     = grp.rows[0]}
                        {@const typeObj      = typeByCode(types, grp.type_code)}
                        {@const displayName  = `${grp.floor_name ?? '?'} / ${typeObj?.initial ?? '?'} / ${grp.asset_id ?? '?'}`}
                        {@const hasPhotosCol = rowInspections.some(i => i.photo_urls?.length > 0)}
                        {@const rowKey       = `${session.id}:${grp.component_id}`}
                        {@const isExpanded   = expandedRowKeys.has(rowKey)}
                        {@const items        = conditionChecklistDisplay(firstRow, condDefsFor(grp.type_code))}
                        <tr class="insp-row insp-row-{worst}">
                          <td class="caret-cell">
                            {#if items.length > 0}
                              <button
                                type="button"
                                class="expand-btn {isExpanded ? 'expanded' : ''}"
                                on:click={() => toggleRow(session.id, grp.component_id)}
                                title={isExpanded ? 'Hide condition breakdown' : 'Show condition breakdown'}
                                aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                              >▸</button>
                            {/if}
                          </td>
                          <td class="font-medium font-mono">{displayName}</td>
                          <td>
                            {#if typeObj}
                              <span class="type-chip" style="background:#{typeObj.colour}22; border-color:#{typeObj.colour}66;">
                                <span class="type-dot" style="background:#{typeObj.colour};">{typeObj.initial}</span>
                                {typeObj.name}
                              </span>
                            {:else}
                              <span class="text-slate-500 font-mono text-xs">{grp.type_code ?? '—'}</span>
                            {/if}
                          </td>
                          <td class="text-slate-400">{grp.label || '—'}</td>
                          <td>
                            <Badge color={resultBadgeColor(worst)} size="small">
                              {resultLabel(worst)}
                            </Badge>
                          </td>
                          <td class="text-sm text-slate-400">{fmtDateTime(firstRow.inspected_at)}</td>
                          <td class="text-sm text-slate-400 notes-cell">
                            {#if firstRow.inspector_notes}
                              <span class="notes-lines">{firstRow.inspector_notes}</span>
                            {:else}
                              —
                            {/if}
                          </td>
                          {#if hasPhotosCol}
                            <td class="text-slate-400 text-sm">
                              {#if firstRow.photo_urls?.length > 0}
                                <span class="photo-indicator">📷 {firstRow.photo_urls.length}</span>
                              {:else}
                                —
                              {/if}
                            </td>
                          {/if}
                        </tr>
                        {#if isExpanded && items.length > 0}
                          <tr class="insp-row-expanded">
                            <td></td>
                            <td colspan={hasPhotosCol ? 7 : 6}>
                              <div class="expanded-content">
                                <p class="expanded-label">Condition checks</p>
                                <ConditionChecklistChips {items} size="xs" />
                              </div>
                            </td>
                          </tr>
                        {/if}
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
  <InspectionsReport
    sessions={filtered}
    types={types}
    floors={floors}
    attrDefs={$buildingAssetsStore.attrDefs}
    inspectionsCache={inspections}
    on:close={() => showReport = false}
  />
{/if}

<style>
  .insp-tab   { display: flex; flex-direction: column; gap: 1rem; }

  /* Toolbar */
  .toolbar         { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgb(71 85 105 / 0.5); }
  .filters         { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.625rem; }
  .fld             { display: flex; flex-direction: column; gap: 0.25rem; }
  .flbl            { font-size: 0.7rem; color: rgb(156 163 175); }
  .clear-btn       { font-size: 0.75rem; color: rgb(156 163 175); background: none; border: none; cursor: pointer; padding: 0.375rem 0; align-self: flex-end; transition: color 0.15s; }
  .clear-btn:hover { color: #fff; }
  .toolbar-summary { margin-left: auto; display: flex; align-items: center; gap: 1rem; font-size: 0.875rem; }
  .ts-count  { color: rgb(156 163 175); }
  .ts-open   { color: rgb(251 191 36); }
  .ts-closed { color: rgb(107 114 128); }

  /* Session list */
  .session-list  { display: flex; flex-direction: column; gap: 0.5rem; }
  .sess-card     { background: rgb(51 65 85 / 0.4); border: 1px solid rgb(71 85 105); border-radius: 8px; overflow: hidden; }
  .sess-open     { border-color: rgb(217 119 6 / 0.4); }
  .sess-row-wrap { display: flex; align-items: stretch; }
  .sess-row      { flex: 1; text-align: left; padding: 0.75rem 1rem; display: flex; align-items: center; gap: 0.75rem; background: none; border: none; cursor: pointer; transition: background 0.15s; }
  .sess-row:hover { background: rgb(71 85 105 / 0.4); }

  /* Delete button */
  .del-btn          { flex-shrink: 0; padding: 0 0.875rem; background: none; border: none; border-left: 1px solid rgb(71 85 105 / 0.5); color: rgb(107 114 128); font-size: 0.875rem; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .del-btn:hover    { background: rgb(239 68 68 / 0.1); color: rgb(248 113 113); border-left-color: rgb(239 68 68 / 0.3); }
  .del-btn.del-confirm { background: rgb(239 68 68 / 0.15); color: rgb(252 165 165); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; }
  .del-btn.del-busy { opacity: 0.5; cursor: not-allowed; }

  /* Session row contents */
  .chev         { color: rgb(107 114 128); font-size: 0.875rem; flex-shrink: 0; width: 1rem; }
  .sess-main    { flex: 1; min-width: 0; }
  .sess-hdr     { display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
  .sess-building{ font-weight: 600; color: #fff; }
  .sess-floor   { color: rgb(156 163 175); font-size: 0.875rem; }
  .sep-dot      { color: rgb(107 114 128); }
  .em-badge     { font-size: 0.72rem; padding: 0.1rem 0.35rem; background: rgba(234,179,8,0.15); color: rgb(251 191 36); border-radius: 3px; }
  .sess-name    { font-size: 0.72rem; color: rgb(167 139 250); font-style: italic; }
  .sess-meta    { font-size: 0.72rem; color: rgb(107 114 128); margin-top: 0.125rem; display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
  .dur          { color: rgb(75 85 99); }
  .sess-inspector { color: rgb(167 139 250); }

  /* Quick stats */
  .quick-stats { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; flex-shrink: 0; }
  .qs-fail   { color: rgb(248 113 113); font-weight: 700; }
  .qs-repair { color: rgb(251 146 60);  font-weight: 600; }
  .qs-pass   { color: rgb(74 222 128);  font-weight: 600; }
  .qs-el       { color: rgb(107 114 128); }
  .qs-complete { color: rgb(74 222 128); }

  /* Status pill */
  .status-badge  { flex-shrink: 0; font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 9999px; border: 1px solid transparent; }
  .status-open   { background: rgb(217 119 6 / 0.2);  color: rgb(251 191 36);  border-color: rgb(217 119 6 / 0.3); }
  .status-closed { background: rgb(71 85 105 / 0.5);  color: rgb(156 163 175); border-color: rgb(71 85 105); }

  /* Expanded detail */
  .sess-detail  { border-top: 1px solid rgb(71 85 105); padding: 0.875rem 1rem 1rem; background: rgb(30 41 59 / 0.4); }
  .detail-msg   { color: rgb(107 114 128); font-size: 0.875rem; padding: 0.5rem 0; font-style: italic; }
  .detail-stats { display: flex; align-items: center; gap: 1.5rem; font-size: 0.875rem; margin-bottom: 0.75rem; color: rgb(156 163 175); flex-wrap: wrap; }
  .ds-pass   { color: rgb(74 222 128); }
  .ds-fail   { color: rgb(248 113 113); font-weight: 600; }
  .ds-repair { color: rgb(251 146 60); }
  .ds-na     { color: rgb(107 114 128); }
  .sess-notes { font-size: 0.875rem; color: rgb(156 163 175); font-style: italic; margin-bottom: 0.75rem; padding-left: 0.75rem; border-left: 2px solid rgb(71 85 105); white-space: pre-line; }

  /* Inspection table */
  .insp-table-wrap { overflow-x: auto; border-radius: 6px; border: 1px solid rgb(71 85 105); }
  .insp-table      { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  .insp-table thead { background: rgb(51 65 85 / 0.6); border-bottom: 1px solid rgb(71 85 105); }
  .insp-table th    { text-align: left; padding: 0.625rem 0.75rem; font-weight: 600; font-size: 0.75rem; letter-spacing: 0.05em; color: rgb(209 213 219); }
  .insp-row         { border-bottom: 1px solid rgb(71 85 105 / 0.5); transition: background 0.15s; }
  .insp-row:hover   { background: rgb(71 85 105 / 0.3); }
  .insp-row td      { padding: 0.625rem 0.75rem; vertical-align: middle; }
  .insp-row-failed  { border-left: 3px solid rgb(239 68 68 / 0.5); }
  .insp-row-problem { border-left: 3px solid rgb(251 146 60 / 0.5); }
  .insp-row-ok      { border-left: 3px solid rgb(74 222 128 / 0.3); }
  .insp-row-inactive{ border-left: 3px solid rgb(71 85 105 / 0.5); }
  .notes-cell       { max-width: 260px; vertical-align: top; }
  .notes-lines      { display: block; white-space: pre-line; line-height: 1.4; max-height: 5rem; overflow-y: auto; }
  .photo-indicator  { font-size: 0.85rem; }

  /* Expand caret + expanded row */
  .caret-cell  { width: 1.5rem; padding-right: 0 !important; }
  .expand-btn  { background: none; border: 0; color: rgb(148 163 184); cursor: pointer; font-size: 0.85rem; line-height: 1; padding: 0; transition: transform 0.15s, color 0.15s; }
  .expand-btn:hover { color: rgb(226 232 240); }
  .expand-btn.expanded { transform: rotate(90deg); color: rgb(216 180 254); }
  .insp-row-expanded     { background: rgb(15 23 42 / 0.4); border-bottom: 1px solid rgb(71 85 105 / 0.5); }
  .insp-row-expanded td  { padding: 0.5rem 0.75rem; vertical-align: top; }
  .expanded-content      { display: flex; flex-direction: column; gap: 0.35rem; }
  .expanded-label        { font-size: 0.7rem; color: rgb(148 163 184); text-transform: uppercase; letter-spacing: 0.05em; }

  /* Type chip */
  .type-chip { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 4px; border: 1px solid; white-space: nowrap; }
  .type-dot  { width: 1rem; height: 1rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.55rem; font-weight: 700; color: #fff; flex-shrink: 0; }

  /* States */
  .state-center { display: flex; align-items: center; justify-content: center; padding: 3rem; }
  .empty-state  { padding: 4rem 0; text-align: center; }
</style>
