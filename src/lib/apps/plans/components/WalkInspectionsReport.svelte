<!-- src/lib/apps/plans/components/WalkInspectionsReport.svelte -->
<!-- Report modal for walk inspection sessions.                              -->
<!-- Two modes: Summary (one row per session) or Detailed (one page/session) -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal    from '$lib/components/common/Modal.svelte';
  import Button   from '$lib/components/common/Button.svelte';
  import Icon     from '$lib/components/icons/Icon.svelte';
  import { api }  from '$lib/utils/api';
  import { getLogger } from '$lib/utils/logger';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';

  const logger   = getLogger('WalkInspectionsReport');
  const dispatch = createEventDispatcher();

  // sessions already filtered by the parent's toolbar filters
  export let sessions = [];

  // ── Report type ───────────────────────────────────────────────────────────
  let reportType = 'summary';  // 'summary' | 'detailed'

  // ── Session selection ─────────────────────────────────────────────────────
  let selectedIds = new Set(sessions.map(s => s.id));

  $: selectedSessions = sessions.filter(s => selectedIds.has(s.id));
  $: allSelected      = selectedIds.size === sessions.length;

  function toggleAll() {
    selectedIds = allSelected
      ? new Set()
      : new Set(sessions.map(s => s.id));
  }
  function toggleSession(id) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    selectedIds = next;
  }

  // ── Generation ────────────────────────────────────────────────────────────
  let generating  = false;
  let genProgress = '';
  let genError    = null;

  // Pre-loaded inspections cache passed in from parent (may be partial)
  export let inspectionsCache = {};   // { [sessionId]: inspection[] }

  async function generateReport() {
    if (!selectedSessions.length) return;
    generating = true; genError = null; genProgress = '';

    try {
      // Load inspections for any sessions we don't have yet
      const sessionsWithInspections = [];

      for (let i = 0; i < selectedSessions.length; i++) {
        const session = selectedSessions[i];
        genProgress = `Loading session ${i + 1} of ${selectedSessions.length}…`;

        let inspections = inspectionsCache[session.id];
        if (!inspections) {
          inspections = await api.get('element_inspections', {
            filters:   { session_id: session.id },
            orderBy:   'inspected_at',
            ascending: true
          });
        }
        sessionsWithInspections.push({ session, inspections });
      }

      genProgress = 'Generating document…';

      const response = await fetch('/api/plans/generate-inspections-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: sessionsWithInspections, reportType })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href     = url;
      a.download = `Inspections_${reportType === 'summary' ? 'Summary' : 'Detailed'}_${date}.docx`;
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); document.body.removeChild(a);

      dispatch('close');
    } catch (err) {
      logger('❌ Report failed:', err.message);
      genError = err.message;
    } finally {
      generating = false; genProgress = '';
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function typeLabel(t) { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t; }
  function typeIcon(t)  { return ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.icon  ?? '■'; }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit' });
  }
</script>

<Modal show={true} size="medium" on:close={() => dispatch('close')}>
  <h3 slot="header" class="text-xl font-bold">Inspection Report</h3>

  <div class="section-spacing">

    <!-- Report type -->
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
            <div class="text-xs text-gray-400 mt-0.5">One page per session — every inspection result listed</div>
          </div>
        </button>
      </div>
    </div>

    <!-- Session selector -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-semibold">
          Sessions
          <span class="text-gray-400 font-normal text-sm ml-1">({selectedIds.size} of {sessions.length} selected)</span>
        </h4>
        <button class="text-xs text-purple-400 hover:text-purple-300 transition-colors" on:click={toggleAll}>
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div class="session-list">
        {#each sessions as session}
          {@const selected = selectedIds.has(session.id)}
          <label class="sess-row" class:sess-selected={selected}>
            <input
              type="checkbox"
              checked={selected}
              on:change={() => toggleSession(session.id)}
              class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500 flex-shrink-0"
            />
            <span class="sess-icon">{typeIcon(session.element_type)}</span>
            <div class="sess-info">
              <span class="sess-name-text">
                {session.building} · Floor {session.floor_level} · {typeLabel(session.element_type)}
                {#if session.light_subtype_filter === 'emergency'}
                  <span class="em-tag">⚠ Emergency</span>
                {/if}
              </span>
              <span class="sess-meta-text">
                {fmtDateTime(session.started_at)}
                {#if session.inspector_name}· {session.inspector_name}{/if}
                {#if session.session_name}<span class="text-purple-400/70"> · {session.session_name}</span>{/if}
              </span>
            </div>
            <span class="sess-status" class:status-open={session.status === 'open'}
                                      class:status-closed={session.status === 'closed'}>
              {session.status}
            </span>
          </label>
        {/each}
      </div>
    </div>

    {#if genError}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-400">⚠ {genError}</div>
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
  /* Report type buttons */
  .type-btn {
    flex: 1; display: flex; align-items: flex-start; gap: 0.75rem;
    padding: 0.875rem 1rem; border-radius: 8px; text-align: left;
    border: 1px solid rgb(71 85 105);
    background: rgb(51 65 85 / 0.3);
    cursor: pointer; transition: all 0.15s; color: #e2e8f0;
  }
  .type-btn:hover    { border-color: rgb(139 92 246 / 0.5); background: rgb(139 92 246 / 0.05); }
  .type-btn-active   { border-color: rgb(139 92 246); background: rgb(139 92 246 / 0.1); }
  .type-icon         { font-size: 1.25rem; flex-shrink: 0; }

  /* Session list */
  .session-list {
    display: flex; flex-direction: column; gap: 0.25rem;
    max-height: 320px; overflow-y: auto;
    border: 1px solid rgb(71 85 105); border-radius: 8px;
    padding: 0.375rem;
  }

  .sess-row {
    display: flex; align-items: center; gap: 0.625rem;
    padding: 0.5rem 0.625rem; border-radius: 6px;
    cursor: pointer; transition: background 0.12s;
    border: 1px solid transparent;
  }
  .sess-row:hover    { background: rgb(71 85 105 / 0.4); }
  .sess-selected     { background: rgb(139 92 246 / 0.08); border-color: rgb(139 92 246 / 0.2); }

  .sess-icon   { font-size: 1rem; flex-shrink: 0; }
  .sess-info   { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
  .sess-name-text { font-size: 0.875rem; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sess-meta-text { font-size: 0.72rem; color: rgb(107 114 128); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .em-tag      { font-size: 0.68rem; color: rgb(251 191 36); margin-left: 0.25rem; }

  .sess-status {
    flex-shrink: 0; font-size: 0.68rem; padding: 0.15rem 0.45rem;
    border-radius: 9999px; border: 1px solid transparent;
  }
  .status-open   { background: rgb(217 119 6 / 0.2); color: rgb(251 191 36); border-color: rgb(217 119 6 / 0.3); }
  .status-closed { background: rgb(71 85 105 / 0.4); color: rgb(156 163 175); border-color: rgb(71 85 105); }
</style>
