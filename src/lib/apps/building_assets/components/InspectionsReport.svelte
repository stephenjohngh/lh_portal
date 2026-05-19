<!-- src/lib/apps/building_assets/components/InspectionsReport.svelte -->
<!-- Report modal for inspection walk sessions.
     Pulls from v2_walk_sessions + component_inspections; renders one
     inspection per component with photos, notes, result, and checklist.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal    from '$lib/components/common/Modal.svelte';
  import Button   from '$lib/components/common/Button.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';
  import Badge    from '$lib/components/common/Badge.svelte';
  import { api }  from '$lib/utils/api';
  import { getLogger } from '$lib/utils/logger';
  import {
    flattenInspectionRows,
    presetLabel,
  } from '$lib/apps/inspection/utils/inspectionHelpers.js';
  import { fmtDateTime } from '$lib/utils/dates';
  import { downloadResponse } from '$lib/utils/download';

  const logger   = getLogger('InspectionsReport');
  const dispatch = createEventDispatcher();

  // -- Props -----------------------------------------------------------------
  // sessions: already-filtered list shown in the tab
  export let sessions         = [];
  // types + floors: from $buildingAssetsStore — needed for client-side resolution
  export let types            = [];
  export let floors           = [];
  // inspectionsCache: already-loaded flattened rows from the tab (may be partial)
  export let inspectionsCache = {};   // { [sessionId]: flattened[] }

  // -- Report type -----------------------------------------------------------
  let reportType = 'summary';   // 'summary' | 'detailed'

  // -- Session selection (default: all) --------------------------------------
  let selectedIds = new Set(sessions.map(s => s.id));

  $: selectedSessions = sessions.filter(s => selectedIds.has(s.id));
  $: allSelected      = selectedIds.size === sessions.length;

  function toggleAll() {
    selectedIds = allSelected ? new Set() : new Set(sessions.map(s => s.id));
  }
  function toggleSession(id) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    selectedIds = next;
  }

  // -- Client-side resolution helpers ----------------------------------------
  function resolveType(type_code) {
    return types.find(t => t.code === type_code) ?? null;
  }
  function resolveFloor(floor_id) {
    return floors.find(f => f.id === floor_id) ?? null;
  }

  /** Display string for the session list row. */
  function sessionFloorDisplay(session) {
    if (!session.floor_id) return 'All Floors';
    const f = resolveFloor(session.floor_id);
    return f ? `Floor ${f.short_name}` : 'Floor ?';
  }

  /** Badge colour for session type. */
  function sessionTypeBadgeColor(t) {
    return { inspection: 'bg-blue-600', test: 'bg-amber-600', repair: 'bg-orange-700' }[t] ?? 'bg-slate-600';
  }

  /**
   * Enrich a session object with pre-resolved string fields so the server
   * doesn't need to look anything up.
   */
  function enrichSession(session) {
    const floorObj = resolveFloor(session.floor_id);
    return {
      ...session,
      floor_short_name:     floorObj?.short_name ?? null,
      inspector_name:       session.inspector?.full_name ?? '—',
      session_preset_label: presetLabel(session.session_preset),
    };
  }

  /**
   * Add type_initial and type_name to each flattened inspection row so the
   * server can build component refs without needing the types lookup table.
   */
  function enrichInspections(flatRows) {
    return flatRows.map(r => {
      const typeObj = resolveType(r.type_code);
      return {
        ...r,
        type_initial: typeObj?.initial ?? '?',
        type_name:    typeObj?.name    ?? r.type_code ?? '?',
      };
    });
  }

  // -- Report generation -----------------------------------------------------
  let generating  = false;
  let genProgress = '';
  let genError    = null;

  async function generateReport() {
    if (!selectedSessions.length) return;
    generating = true; genError = null; genProgress = '';

    try {
      const sessionsWithInspections = [];

      for (let i = 0; i < selectedSessions.length; i++) {
        const session = selectedSessions[i];
        genProgress = `Loading session ${i + 1} of ${selectedSessions.length}…`;

        let flatRows = inspectionsCache[session.id];
        if (!flatRows) {
          const rows = await api.get('component_inspections', {
            select:    '*, component:components!component_id(asset_id, label, type_code, floor:floors!floor_id(short_name, level_order))',
            filters:   { v2_walk_session_id: session.id },
            orderBy:   'inspected_at',
            ascending: true,
          });
          flatRows = flattenInspectionRows(rows);
        }

        sessionsWithInspections.push({
          session:     enrichSession(session),
          inspections: enrichInspections(flatRows),
        });
      }

      genProgress = 'Generating document…';

      const response = await fetch('/api/generate-inspections-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessions: sessionsWithInspections, reportType }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const date     = new Date().toISOString().slice(0, 10);
      const slug     = reportType === 'summary' ? 'Summary' : 'Detailed';
      const filename = `Inspections_${slug}_${date}.docx`;
      await downloadResponse(response, filename);

      dispatch('close');
    } catch (err) {
      logger('❌ Report failed:', err.message);
      genError = err.message;
    } finally {
      generating = false; genProgress = '';
    }
  }
</script>

<Modal show={true} size="medium" on:close={() => dispatch('close')}>
  <h3 slot="header" class="text-xl font-bold">Inspection Report</h3>

  <div class="section-spacing">

    <!-- -- Report type ------------------------------------------------------ -->
    <div>
      <h4 class="font-semibold mb-3">Report Type</h4>
      <div class="flex gap-3">
        <button
          class="type-btn"
          class:type-btn-active={reportType === 'summary'}
          on:click={() => reportType = 'summary'}
        >
          <span class="type-icon">📋</span>
          <div>
            <div class="font-semibold text-sm">Summary</div>
            <div class="text-xs text-gray-400 mt-0.5">One row per session — dates, counts, pass/fail totals</div>
          </div>
        </button>
        <button
          class="type-btn"
          class:type-btn-active={reportType === 'detailed'}
          on:click={() => reportType = 'detailed'}
        >
          <span class="type-icon">📄</span>
          <div>
            <div class="font-semibold text-sm">Detailed</div>
            <div class="text-xs text-gray-400 mt-0.5">One page per session — every component result + photos</div>
          </div>
        </button>
      </div>
    </div>

    <!-- -- Session selector ------------------------------------------------- -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-semibold">
          Sessions
          <span class="text-gray-400 font-normal text-sm ml-1">
            ({selectedIds.size} of {sessions.length} selected)
          </span>
        </h4>
        <button
          class="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          on:click={toggleAll}
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div class="session-list">
        {#each sessions as session (session.id)}
          {@const selected = selectedIds.has(session.id)}
          <label class="sess-row" class:sess-selected={selected}>
            <Checkbox checked={selected} on:change={() => toggleSession(session.id)} />
            <div class="sess-info">
              <span class="sess-name-text">
                {session.building}
                · {sessionFloorDisplay(session)}
                · {presetLabel(session.session_preset)}
                <Badge color={sessionTypeBadgeColor(session.session_type)} size="small">
                  {(session.session_type ?? '').toUpperCase()}
                </Badge>
                {#if session.session_name}
                  <span class="text-purple-400/70"> · {session.session_name}</span>
                {/if}
              </span>
              <span class="sess-meta-text">
                {fmtDateTime(session.started_at)}
                {#if session.inspector?.full_name}· {session.inspector.full_name}{/if}
              </span>
            </div>
            <span class="sess-status"
              class:status-open={session.status === 'open'}
              class:status-closed={session.status === 'closed'}>
              {session.status}
            </span>
          </label>
        {/each}
      </div>
    </div>

    {#if genError}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-400">
        ⚠ {genError}
      </div>
    {/if}

  </div>

  <div slot="footer" class="btn-group justify-end">
    <Button variant="secondary" size="large" on:click={() => dispatch('close')} disabled={generating}>
      Cancel
    </Button>
    <Button variant="primary" size="large" icon="download" on:click={generateReport}
            disabled={generating || selectedIds.size === 0}>
      {#if generating}
        {genProgress || 'Generating…'}
      {:else}
        Generate ({selectedIds.size} session{selectedIds.size !== 1 ? 's' : ''})
      {/if}
    </Button>
  </div>
</Modal>

<style>
  .type-btn {
    flex: 1; display: flex; align-items: flex-start; gap: 0.75rem;
    padding: 0.875rem 1rem; border-radius: 8px; text-align: left;
    border: 1px solid rgb(71 85 105);
    background: rgb(51 65 85 / 0.3);
    cursor: pointer; transition: all 0.15s; color: #e2e8f0;
  }
  .type-btn:hover    { border-color: rgb(var(--lh-accent-rgb) / 0.5); background: rgb(var(--lh-accent-rgb) / 0.05); }
  .type-btn-active   { border-color: var(--lh-accent); background: rgb(var(--lh-accent-rgb) / 0.1); }
  .type-icon         { font-size: 1.25rem; flex-shrink: 0; }

  .session-list {
    display: flex; flex-direction: column; gap: 0.25rem;
    max-height: 320px; overflow-y: auto;
    border: 1px solid rgb(71 85 105); border-radius: 8px; padding: 0.375rem;
  }

  .sess-row {
    display: flex; align-items: center; gap: 0.625rem;
    padding: 0.5rem 0.625rem; border-radius: 6px;
    cursor: pointer; transition: background 0.12s;
    border: 1px solid transparent;
  }
  .sess-row:hover  { background: rgb(71 85 105 / 0.4); }
  .sess-selected   { background: rgb(var(--lh-accent-rgb) / 0.08); border-color: rgb(var(--lh-accent-rgb) / 0.2); }

  .sess-info        { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
  .sess-name-text   { font-size: 0.875rem; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sess-meta-text   { font-size: 0.72rem; color: rgb(107 114 128); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .sess-status {
    flex-shrink: 0; font-size: 0.68rem; padding: 0.15rem 0.45rem;
    border-radius: 9999px; border: 1px solid transparent;
  }
  .status-open   { background: rgb(217 119 6 / 0.2);  color: rgb(251 191 36);  border-color: rgb(217 119 6 / 0.3); }
  .status-closed { background: rgb(71 85 105 / 0.4);  color: rgb(156 163 175); border-color: rgb(71 85 105); }
</style>
