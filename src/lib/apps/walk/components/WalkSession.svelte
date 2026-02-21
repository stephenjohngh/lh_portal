<!-- src/lib/apps/walk/components/WalkSession.svelte -->
<!-- Core walk screen: navigate elements, view/edit, record inspections -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import { ELEMENT_TYPE_OPTIONS, getElementDisplayName } from '$lib/utils/planConstants';
  import WalkElementEditor from './WalkElementEditor.svelte';
  import WalkInspectionPanel from './WalkInspectionPanel.svelte';
  import WalkJumpList from './WalkJumpList.svelte';

  const logger = getLogger('WalkSession');
  const dispatch = createEventDispatcher();

  export let canEdit = false;

  // Views within the walk session
  // 'card'       — main element view
  // 'edit'       — edit element fields
  // 'inspect'    — add inspection record
  // 'jump'       — list of all elements to jump to
  // 'close'      — confirm close session
  let view = 'card';

  let closeNotes = '';
  let closing    = false;
  let closeError = null;

  $: session      = $walkStore.activeSession;
  $: elements     = $walkStore.walkElements;
  $: currentIndex = $walkStore.currentIndex;
  $: inspections  = $walkStore.inspections;

  $: currentElement = elements[currentIndex];
  $: isFirst        = currentIndex === 0;
  $: isLast         = currentIndex === elements.length - 1;
  $: progress       = elements.length > 0 ? ((currentIndex + 1) / elements.length) : 0;

  $: inspectedCount = Object.keys(inspections).length;

  $: typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === session?.element_type);

  $: currentInspections = currentElement
    ? (inspections[currentElement.id] || [])
    : [];

  $: hasInspection = currentInspections.length > 0;
  $: lastInspection = currentInspections[currentInspections.length - 1];

  function handlePrev() {
    view = 'card';
    walkStore.goPrev();
  }

  function handleNext() {
    view = 'card';
    walkStore.goNext();
  }

  function handleJumpTo(event) {
    view = 'card';
    walkStore.goToIndex(event.detail.index);
  }

  function handleEditSaved() {
    view = 'card';
  }

  function handleInspectionSaved() {
    view = 'card';
  }

  async function handleCloseSession() {
    closing    = true;
    closeError = null;
    try {
      await walkStore.closeSession(session.id, closeNotes);
      dispatch('closed');
    } catch (err) {
      logger('❌ Close session failed:', err.message);
      closeError = err.message;
    } finally {
      closing = false;
    }
  }

  function statusClass(status) {
    return {
      active:      'status-active',
      inactive:    'status-inactive',
      maintenance: 'status-maintenance',
      removed:     'status-removed'
    }[status] || 'status-inactive';
  }

  function resultClass(result) {
    return { pass: 'result-pass', fail: 'result-fail', na: 'result-na' }[result] || '';
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="walk-session">

  <!-- ── Session bar ──────────────────────────────────────────────────── -->
  <div class="session-bar">
    <div class="session-bar-left">
      <span class="session-type-icon">{typeConfig?.icon}</span>
      <div class="session-bar-info">
        <div class="session-bar-name">{session?.building} · Floor {session?.floor_level}</div>
        <div class="session-bar-type">{typeConfig?.label}</div>
      </div>
    </div>
    <div class="session-bar-right">
      <div class="session-counter">{currentIndex + 1} / {elements.length}</div>
      <button class="close-session-btn" on:click={() => view = 'close'}>✕</button>
    </div>
  </div>

  <!-- Progress bar -->
  <div class="progress-track">
    <div class="progress-fill" style="width: {progress * 100}%"></div>
  </div>

  <!-- ── Main content ─────────────────────────────────────────────────── -->

  {#if view === 'card' && currentElement}
    <div class="element-card">

      <!-- Element identity -->
      <div class="element-identity">
        <div class="element-name">
          {getElementDisplayName(currentElement, session?.floor_level)}
        </div>
        {#if currentElement.label}
          <div class="element-label">{currentElement.label}</div>
        {/if}
        <div class="element-meta-row">
          {#if currentElement.subtype}
            <span class="element-subtype">{currentElement.subtype}</span>
          {/if}
          <span class="element-status {statusClass(currentElement.status)}">
            {currentElement.status}
          </span>
        </div>
      </div>

      <!-- Last inspection result -->
      {#if hasInspection}
        <div class="last-inspection {resultClass(lastInspection.result)}">
          <div class="last-inspection-header">
            <span class="last-inspection-label">LAST INSPECTION</span>
            <span class="last-inspection-time">{formatTime(lastInspection.inspected_at)}</span>
          </div>
          <div class="last-inspection-result">
            {lastInspection.result === 'pass' ? '✓ PASS' :
             lastInspection.result === 'fail' ? '✗ FAIL' : '— N/A'}
          </div>
          {#if lastInspection.notes}
            <div class="last-inspection-notes">{lastInspection.notes}</div>
          {/if}
        </div>
      {:else}
        <div class="not-inspected">
          <span>NOT YET INSPECTED</span>
        </div>
      {/if}

      <!-- Attribute summary -->
      <div class="element-fields">
        {#if currentElement.element_type === 'light'}
          <div class="field-row">
            <span class="field-key">SUBTYPE</span>
            <span class="field-val">{currentElement.subtype || '—'}</span>
          </div>
          <div class="field-row">
            <span class="field-key">BATTERY</span>
            <span class="field-val">{currentElement.battery || '—'}</span>
          </div>
          {#if currentElement.wattage}
            <div class="field-row">
              <span class="field-key">WATTAGE</span>
              <span class="field-val">{currentElement.wattage}W</span>
            </div>
          {/if}
          <div class="field-row">
            <span class="field-key">EMERGENCY</span>
            <span class="field-val">{currentElement.emergency ? 'Yes' : 'No'}</span>
          </div>
          <div class="field-row">
            <span class="field-key">MOTION SENSOR</span>
            <span class="field-val">{currentElement.movement_sensor ? 'Yes' : 'No'}</span>
          </div>
          <div class="field-row">
            <span class="field-key">LIGHT SENSOR</span>
            <span class="field-val">{currentElement.light_sensor ? 'Yes' : 'No'}</span>
          </div>
        {:else if currentElement.element_type === 'communal_door' || currentElement.element_type === 'apartment_door'}
          <div class="field-row">
            <span class="field-key">SUBTYPE</span>
            <span class="field-val">{currentElement.subtype || '—'}</span>
          </div>
          <div class="field-row">
            <span class="field-key">SECURITY</span>
            <span class="field-val">{currentElement.security || '—'}</span>
          </div>
          <div class="field-row">
            <span class="field-key">RETAINED</span>
            <span class="field-val">{currentElement.retained ? 'Yes' : 'No'}</span>
          </div>
        {:else}
          <div class="field-row">
            <span class="field-key">SUBTYPE</span>
            <span class="field-val">{currentElement.subtype || '—'}</span>
          </div>
        {/if}

        {#if currentElement.notes}
          <div class="field-row field-notes">
            <span class="field-key">NOTES</span>
            <span class="field-val">{currentElement.notes}</span>
          </div>
        {/if}

        <div class="field-row">
          <span class="field-key">ASSET ID</span>
          <span class="field-val mono">{currentElement.asset_id || '—'}</span>
        </div>
      </div>

      <!-- Action buttons -->
      {#if canEdit}
        <div class="card-actions">
          <button class="action-btn action-inspect" on:click={() => view = 'inspect'}>
            <span class="action-icon">✓</span>
            <span>INSPECT</span>
          </button>
          <button class="action-btn action-edit" on:click={() => view = 'edit'}>
            <span class="action-icon">✎</span>
            <span>EDIT</span>
          </button>
        </div>
      {:else}
        <div class="card-actions">
          <button class="action-btn action-inspect-readonly" on:click={() => view = 'inspect'}>
            <span class="action-icon">✓</span>
            <span>RECORD INSPECTION</span>
          </button>
        </div>
      {/if}

    </div>

  {:else if view === 'card' && elements.length === 0}
    <div class="empty-walk">
      <div>No elements found for this session.</div>
    </div>
  {/if}

  <!-- Edit view -->
  {#if view === 'edit' && currentElement}
    <WalkElementEditor
      element={currentElement}
      floorLevel={session?.floor_level}
      on:saved={handleEditSaved}
      on:cancel={() => view = 'card'}
    />
  {/if}

  <!-- Inspection panel -->
  {#if view === 'inspect' && currentElement}
    <WalkInspectionPanel
      element={currentElement}
      session={session}
      on:saved={handleInspectionSaved}
      on:cancel={() => view = 'card'}
    />
  {/if}

  <!-- Jump list -->
  {#if view === 'jump'}
    <WalkJumpList
      {elements}
      {currentIndex}
      {inspections}
      floorLevel={session?.floor_level}
      on:jump={handleJumpTo}
      on:close={() => view = 'card'}
    />
  {/if}

  <!-- Close session confirmation -->
  {#if view === 'close'}
    <div class="close-confirm">
      <div class="close-confirm-header">CLOSE SESSION</div>
      <div class="close-confirm-summary">
        <div class="summary-row">
          <span class="summary-key">INSPECTED</span>
          <span class="summary-val">{inspectedCount} / {elements.length} elements</span>
        </div>
        <div class="summary-row">
          <span class="summary-key">BUILDING</span>
          <span class="summary-val">{session?.building} · Floor {session?.floor_level}</span>
        </div>
      </div>

      <div class="close-field">
        <label class="close-label" for="close-notes">Session notes (optional)</label>
        <textarea
          id="close-notes"
          class="close-textarea"
          bind:value={closeNotes}
          placeholder="Any overall observations for this session…"
          rows="3"
        ></textarea>
      </div>

      {#if closeError}
        <div class="error-msg">⚠ {closeError}</div>
      {/if}

      <div class="close-actions">
        <button class="close-cancel-btn" on:click={() => view = 'card'}>
          CONTINUE WALK
        </button>
        <button class="close-confirm-btn" on:click={handleCloseSession} disabled={closing}>
          {closing ? 'CLOSING…' : 'CLOSE SESSION'}
        </button>
      </div>
    </div>
  {/if}

  <!-- ── Navigation bar ───────────────────────────────────────────────── -->
  {#if view === 'card'}
    <div class="nav-bar">
      <button
        class="nav-btn nav-prev"
        on:click={handlePrev}
        disabled={isFirst}
      >
        ← PREV
      </button>

      <button class="nav-btn nav-list" on:click={() => view = 'jump'}>
        ☰ LIST
      </button>

      <button
        class="nav-btn nav-next"
        on:click={handleNext}
        disabled={isLast}
      >
        NEXT →
      </button>
    </div>
  {/if}

</div>

<style>
  .walk-session {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    position: relative;
  }

  /* ── Session bar ─────────────────────────────────────────────────────── */
  .session-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid #1e1e2a;
    background: #0d0d13;
  }

  .session-bar-left { display: flex; align-items: center; gap: 0.625rem; }

  .session-type-icon { font-size: 1.25rem; }

  .session-bar-name { font-size: 0.8rem; color: #e8e8e0; }
  .session-bar-type { font-size: 0.65rem; letter-spacing: 0.1em; color: #555; margin-top: 0.1rem; }

  .session-bar-right { display: flex; align-items: center; gap: 0.75rem; }

  .session-counter { font-size: 0.75rem; color: #555; }

  .close-session-btn {
    background: none;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    color: #555;
    font-family: inherit;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .close-session-btn:hover { border-color: #ef4444; color: #ef4444; }

  /* ── Progress bar ────────────────────────────────────────────────────── */
  .progress-track {
    height: 3px;
    background: #1e1e2a;
    flex-shrink: 0;
  }

  .progress-fill {
    height: 100%;
    background: #f97316;
    transition: width 0.3s ease;
  }

  /* ── Element card ────────────────────────────────────────────────────── */
  .element-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.5rem 1.25rem;
    gap: 1.25rem;
    overflow-y: auto;
    padding-bottom: 6rem; /* room for nav bar */
  }

  .element-identity {}

  .element-name {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #f97316;
    line-height: 1;
  }

  .element-label {
    font-size: 0.875rem;
    color: #aaa;
    margin-top: 0.375rem;
  }

  .element-meta-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    margin-top: 0.625rem;
  }

  .element-subtype {
    font-size: 0.75rem;
    color: #666;
    background: #1a1a24;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }

  .element-status {
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }

  .status-active      { background: #0f2a0f; color: #22c55e; }
  .status-inactive    { background: #1a1a1a; color: #555; }
  .status-maintenance { background: #2a1a00; color: #f59e0b; }
  .status-removed     { background: #2a0000; color: #ef4444; }

  /* ── Last inspection ─────────────────────────────────────────────────── */
  .last-inspection {
    padding: 0.875rem 1rem;
    border-radius: 8px;
    border: 1px solid transparent;
  }

  .last-inspection.result-pass {
    background: #0a1a0a;
    border-color: #22c55e;
  }

  .last-inspection.result-fail {
    background: #1a0a0a;
    border-color: #ef4444;
  }

  .last-inspection.result-na {
    background: #111118;
    border-color: #333;
  }

  .last-inspection-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.375rem;
  }

  .last-inspection-label {
    font-size: 0.6rem;
    letter-spacing: 0.15em;
    color: #555;
  }

  .last-inspection-time { font-size: 0.65rem; color: #444; }

  .last-inspection-result {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .result-pass .last-inspection-result { color: #22c55e; }
  .result-fail .last-inspection-result { color: #ef4444; }
  .result-na   .last-inspection-result { color: #555; }

  .last-inspection-notes {
    font-size: 0.75rem;
    color: #777;
    margin-top: 0.375rem;
  }

  .not-inspected {
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    color: #333;
    border: 1px dashed #222;
    border-radius: 8px;
    padding: 0.875rem 1rem;
  }

  /* ── Fields ──────────────────────────────────────────────────────────── */
  .element-fields {
    background: #0d0d13;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    overflow: hidden;
  }

  .field-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid #1a1a24;
    gap: 0.5rem;
  }

  .field-row:last-child { border-bottom: none; }
  .field-row.field-notes { align-items: flex-start; }

  .field-key { font-size: 0.6rem; letter-spacing: 0.15em; color: #444; flex-shrink: 0; padding-top: 0.1rem; }
  .field-val { font-size: 0.8rem; color: #aaa; text-align: right; }
  .field-val.mono { font-family: inherit; }

  /* ── Action buttons ──────────────────────────────────────────────────── */
  .card-actions {
    display: flex;
    gap: 0.625rem;
  }

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid transparent;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-icon { font-size: 1rem; }

  .action-inspect {
    background: #0a1a0a;
    border-color: #22c55e;
    color: #22c55e;
  }
  .action-inspect:hover { background: #22c55e; color: #0a0a0f; }

  .action-edit {
    background: #111118;
    border-color: #2a2a3a;
    color: #aaa;
  }
  .action-edit:hover { border-color: #f97316; color: #f97316; }

  .action-inspect-readonly {
    background: #0a1a0a;
    border-color: #22c55e;
    color: #22c55e;
    width: 100%;
  }

  /* ── Navigation bar ──────────────────────────────────────────────────── */
  .nav-bar {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 480px;
    display: flex;
    background: #0a0a0f;
    border-top: 1px solid #1e1e2a;
    z-index: 10;
  }

  .nav-btn {
    flex: 1;
    padding: 1.125rem 0.5rem;
    background: none;
    border: none;
    font-family: inherit;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    cursor: pointer;
    transition: all 0.15s;
    color: #555;
  }

  .nav-btn:hover:not(:disabled) { color: #e8e8e0; background: #111118; }
  .nav-btn:disabled { opacity: 0.2; cursor: not-allowed; }

  .nav-prev { border-right: 1px solid #1e1e2a; }
  .nav-list { border-right: 1px solid #1e1e2a; color: #888; }
  .nav-next { color: #f97316; }
  .nav-next:hover:not(:disabled) { background: #1a0f00; color: #f97316; }

  /* ── Empty state ─────────────────────────────────────────────────────── */
  .empty-walk {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #333;
    font-size: 0.875rem;
  }

  /* ── Close session ───────────────────────────────────────────────────── */
  .close-confirm {
    flex: 1;
    padding: 1.5rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .close-confirm-header {
    font-size: 0.65rem;
    letter-spacing: 0.25em;
    color: #ef4444;
  }

  .close-confirm-summary {
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .summary-row { display: flex; justify-content: space-between; }
  .summary-key { font-size: 0.6rem; letter-spacing: 0.15em; color: #444; }
  .summary-val { font-size: 0.8rem; color: #e8e8e0; }

  .close-field { display: flex; flex-direction: column; gap: 0.5rem; }

  .close-label { font-size: 0.65rem; letter-spacing: 0.1em; color: #555; }

  .close-textarea {
    background: #111118;
    border: 1px solid #1e1e2a;
    border-radius: 8px;
    color: #e8e8e0;
    font-family: inherit;
    font-size: 0.825rem;
    padding: 0.875rem 1rem;
    resize: none;
    width: 100%;
    box-sizing: border-box;
  }

  .close-textarea:focus { outline: none; border-color: #f97316; }

  .error-msg {
    font-size: 0.8rem;
    color: #ef4444;
    padding: 0.75rem 1rem;
    background: #1a0000;
    border: 1px solid #ef4444;
    border-radius: 6px;
  }

  .close-actions {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    margin-top: auto;
  }

  .close-cancel-btn {
    padding: 1rem;
    background: none;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    color: #666;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    cursor: pointer;
    transition: all 0.15s;
  }
  .close-cancel-btn:hover { border-color: #444; color: #aaa; }

  .close-confirm-btn {
    padding: 1rem;
    background: #ef4444;
    border: none;
    border-radius: 8px;
    color: #fff;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    cursor: pointer;
    transition: all 0.15s;
  }
  .close-confirm-btn:hover:not(:disabled) { background: #dc2626; }
  .close-confirm-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
