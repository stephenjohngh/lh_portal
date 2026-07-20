<!-- src/lib/apps/building_assets/components/InspectionsReport.svelte -->
<!-- Report modal for inspection walk sessions.
     Pulls from walk_sessions + component_inspections; renders one
     inspection per component with photos, notes, result, and checklist.
-->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { authHeaders } from '$lib/utils/authHeaders';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { logAudit }    from '$lib/utils/auditLogger';
  import {
    registerSessionReportToGoldenThread, findRegisteredSessionReport, loadSessionInspections,
  } from '$lib/apps/inspection/public.js';
  import { findDocumentsBySources } from '$lib/apps/golden_thread/public.js';
  import Modal    from '$lib/components/common/Modal.svelte';
  import Button   from '$lib/components/common/Button.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';
  import Badge    from '$lib/components/common/Badge.svelte';
  import { getLogger } from '$lib/utils/logger';
  import {
    flattenInspectionRows,
    presetLabel,
  } from '$lib/apps/inspection/utils/inspectionHelpers.js';
  import { fmtDateTime } from '$lib/utils/dates';
  import { downloadResponse } from '$lib/utils/download';
  import { conditionChecklistDisplay, readingsDisplay } from '../lookups.js';

  const logger   = getLogger('InspectionsReport');
  const dispatch = createEventDispatcher();

  // -- Props -----------------------------------------------------------------
  // sessions: already-filtered list shown in the tab
  export let sessions         = [];
  export let definitions      = [];   // inspection_definitions — for the definition name
  // types + floors: from $buildingAssetsStore — needed for client-side resolution
  export let types            = [];
  export let floors           = [];
  /** { [typeId]: type_attributes[] } — passed to enrich each inspection with
      a structured condition_results array (name + pass/fail). The server
      route doesn't have the types/attrDefs lookup, so we resolve client-side. */
  export let attrDefs         = {};
  // inspectionsCache: already-loaded flattened rows from the tab (may be partial)
  export let inspectionsCache = {};   // { [sessionId]: flattened[] }

  // -- Report type -----------------------------------------------------------
  let reportType    = 'summary';   // 'summary' | 'detailed'
  let includePhotos = true;        // only relevant for 'detailed'

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
    const def      = definitions.find(d => d.id === session.definition_id) ?? null;
    return {
      ...session,
      floor_short_name:     floorObj?.short_name ?? null,
      inspector_name:       session.inspector?.full_name ?? '—',
      // The inspection this session ran (e.g. "Fire Doors"). Replaces the old
      // preset, which was retired and always resolved to "Custom".
      definition_name:      def?.name ?? null,
      // Statutory provenance (G3) — carried through so the report and the GT
      // registration explain the compliance basis.
      statutory_ref:        def?.statutory_ref ?? null,
      test_type:            def?.test_type ?? null,
    };
  }

  /**
   * Add type_initial and type_name to each flattened inspection row so the
   * server can build component refs without needing the types lookup table,
   * plus a structured condition_results array {name, passed} and a readings
   * array {name, value} so the server can render the per-attribute checklist
   * and the measured readings without needing attrDefs.
   */
  function enrichInspections(flatRows) {
    return flatRows.map(r => {
      const typeObj = resolveType(r.type_code);
      const defs    = typeObj ? (attrDefs[typeObj.id] ?? []) : [];
      return {
        ...r,
        type_initial: typeObj?.initial ?? '?',
        type_name:    typeObj?.name    ?? r.type_code ?? '?',
        condition_results: conditionChecklistDisplay(r, defs).map(({ def, passed }) => ({
          name: def.name,
          passed,
        })),
        // Measured numeric/text readings (G2). Only recorded ones appear —
        // pre-migration-169 inspections carry theirs as prose in the notes.
        readings: readingsDisplay(r, defs).map(({ def, value }) => ({
          name: def.name,
          value,
        })),
      };
    });
  }

  /**
   * Resolve one session into the server payload shape { session, inspections }
   * (load rows if not cached, optionally batch-load photos, enrich). Shared by
   * report generation and Golden Thread registration.
   */
  async function resolveSessionPayload(session, { withPhotos = false } = {}) {
    let flatRows = inspectionsCache[session.id];
    // Load (or, for a detailed report, reload with photos) via the Inspection
    // app's accessor — same query shape the tab uses, in one place.
    if (!flatRows || (withPhotos && !flatRows.some(r => r.photo_urls?.length > 0))) {
      const rows = await loadSessionInspections(session.id, { withPhotos });
      flatRows = flattenInspectionRows(rows);
    }
    return { session: enrichSession(session), inspections: enrichInspections(flatRows) };
  }

  // -- Golden Thread registration (per session) ------------------------------
  $: canEdit = $permissions.isAdmin || $permissions.canModify;
  /** @type {Record<string, { reference: string }>} */
  let registered   = {};
  let registeringId = null;

  onMount(async () => {
    // Pre-check which sessions are already registered — ONE batched query for
    // the whole list (was one per session). Failure is non-fatal: the register
    // action itself re-checks before creating anything.
    try {
      const bySession = await findDocumentsBySources('walk_session', sessions.map((s) => s.id));
      registered = Object.fromEntries(
        Object.entries(bySession).map(([id, doc]) => [id, { reference: doc.reference }]),
      );
    } catch { /* ignore */ }
  });

  async function registerSession(session) {
    registeringId = session.id;
    genError = null;
    try {
      const existing = await findRegisteredSessionReport(session.id);
      if (existing) { registered = { ...registered, [session.id]: { reference: existing.reference } }; return; }

      const { session: es, inspections: ei } = await resolveSessionPayload(session, { withPhotos: true });
      // Lead the GT entry with the inspection + its statutory basis (G3), so the
      // register is self-describing without opening the document.
      const lead  = [es.definition_name ?? 'Inspection', es.test_type ? `(${es.test_type})` : null].filter(Boolean).join(' ');
      const title = `${lead} — ${sessionFloorDisplay(session)} · ${fmtDateTime(session.started_at)}`
        + (es.statutory_ref ? ` · ${es.statutory_ref}` : '');
      const gt = await registerSessionReportToGoldenThread(es, ei, { title }, $auth.user?.id);
      registered = { ...registered, [session.id]: { reference: gt.reference } };
      logAudit('create', 'gt_document', gt.id, gt.title, {
        appId: 'building_assets', eventCategory: 'golden_thread', severity: 'info',
        afterData: { producedBy: 'walk_session', walk_session_id: session.id },
      });
    } catch (e) {
      genError = e.message;
    } finally {
      registeringId = null;
    }
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
        sessionsWithInspections.push(
          await resolveSessionPayload(session, { withPhotos: reportType === 'detailed' && includePhotos }),
        );
      }

      genProgress = 'Generating document…';

      const response = await fetch('/api/generate-inspections-report', {
        method:  'POST',
        headers: await authHeaders(),
        body:    JSON.stringify({ sessions: sessionsWithInspections, reportType, includePhotos }),
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

      {#if reportType === 'detailed'}
        <div class="mt-3 pl-1">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox checked={includePhotos} on:change={() => includePhotos = !includePhotos} />
            <span class="text-sm text-gray-300">Include photos</span>
            <span class="text-xs text-gray-500">(may increase generation time for large sessions)</span>
          </label>
        </div>
      {/if}
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
            {#if registered[session.id]}
              <span class="gt-reg gt-done" title="Registered in the Golden Thread">
                ✓ {registered[session.id].reference}
              </span>
            {:else if canEdit && session.status === 'closed'}
              <button type="button" class="gt-reg gt-btn"
                on:click|preventDefault|stopPropagation={() => registerSession(session)}
                disabled={registeringId === session.id}
                title="Register this session's report in the Golden Thread">
                {registeringId === session.id ? '…' : '↗ GT'}
              </button>
            {/if}
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

  .gt-reg   { flex-shrink: 0; font-size: 0.68rem; white-space: nowrap; }
  .gt-done  { color: rgb(52 211 153); }
  .gt-btn   { padding: 0.15rem 0.45rem; border-radius: 9999px; border: 1px solid rgb(var(--lh-accent-rgb) / 0.4);
              color: rgb(var(--lh-accent-rgb)); background: rgb(var(--lh-accent-rgb) / 0.08); cursor: pointer; }
  .gt-btn:hover:not(:disabled) { background: rgb(var(--lh-accent-rgb) / 0.18); }
  .gt-btn:disabled { opacity: 0.5; cursor: default; }
</style>
