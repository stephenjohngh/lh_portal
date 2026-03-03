<!-- src/lib/apps/walk/components/WalkSession.svelte -->
<!-- Core walk screen: navigate elements, view/edit, record inspections -->
<!-- FIX: Floor display updates correctly in building-wide sessions -->
<!-- FIX: Better finish button with dedicated "Finish Walk" button -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import { ELEMENT_TYPE_OPTIONS, getElementDisplayName } from '$lib/utils/planConstants';
  import { fmtTime } from '$lib/utils/dates';
  import WalkElementEditor    from './WalkElementEditor.svelte';
  import WalkInspectionPanel  from './WalkInspectionPanel.svelte';
  import WalkJumpList         from './WalkJumpList.svelte';

  const logger   = getLogger('WalkSession');
  const dispatch = createEventDispatcher();

  export let canEdit = false;

  // 'card' | 'edit' | 'inspect' | 'jump' | 'close'
  let view       = 'card';
  let closeNotes = '';
  let closing    = false;
  let closeError = null;

  $: session      = $walkStore.activeSession;
  $: elements     = $walkStore.walkElements;
  $: currentIndex = $walkStore.currentIndex;
  $: inspections  = $walkStore.inspections;

  $: currentElement    = elements[currentIndex];
  
  // FIX: For building-wide sessions, check if at start/end of BUILDING, not just floor
  $: isFirst = (() => {
    if (session?.session_scope === 'building') {
      const currentFloorIndex = $walkStore.buildingPlans.findIndex(p => p.floor_level === $walkStore.currentFloor);
      return currentFloorIndex === 0 && currentIndex === 0;
    }
    return currentIndex === 0;
  })();
  
  $: isLast = (() => {
    if (session?.session_scope === 'building') {
      return walkStore.isAtEndOfBuilding();
    }
    return currentIndex === elements.length - 1;
  })();
  
  $: progress          = elements.length > 0 ? (currentIndex + 1) / elements.length : 0;
  $: inspectedCount    = Object.keys(inspections).length;
  $: typeConfig        = ELEMENT_TYPE_OPTIONS.find(t => t.value === session?.element_type);
  $: currentInspections = currentElement ? (inspections[currentElement.id] || []) : [];
  $: hasInspection      = currentInspections.length > 0;
  $: lastInspection     = currentInspections[currentInspections.length - 1];

  // FIX: Floor progress for building-wide sessions
  $: floorProgress = session?.session_scope === 'building' 
    ? walkStore.getCurrentFloorProgress() 
    : null;
    
  // FIX: Use current floor for element display name in building-wide sessions
  $: displayFloor = $walkStore.currentFloor || session?.floor_level;

  function handlePrev() { 
    view = 'card'; 
    // For building-wide sessions at element 0, go to previous floor
    if (session?.session_scope === 'building' && currentIndex === 0) {
      const currentFloorIndex = $walkStore.buildingPlans.findIndex(p => p.floor_level === $walkStore.currentFloor);
      if (currentFloorIndex > 0) {
        const prevFloor = $walkStore.buildingPlans[currentFloorIndex - 1];
        walkStore.goToFloor(prevFloor.floor_level);
        // Set to last element of previous floor
        const prevFloorElements = $walkStore.walkElements;
        if (prevFloorElements.length > 0) {
          walkStore.goToIndex(prevFloorElements.length - 1);
        }
        return;
      }
    }
    walkStore.goPrev(); 
  }
  
  function handleNext()            { view = 'card'; walkStore.goNext(); }
  function handleJumpTo(e)         { view = 'card'; walkStore.goToIndex(e.detail.index); }
  function handleEditSaved()       { view = 'card'; }
  function handleInspectionSaved() { view = 'card'; }

  async function handleCloseSession() {
    closing = true; closeError = null;
    try {
      await walkStore.closeSession(session.id, closeNotes);
      dispatch('closed');
    } catch (err) {
      logger('Close failed:', err.message);
      closeError = err.message;
    } finally { closing = false; }
  }

  function statusCls(s) {
    return { active: 'st-active', inactive: 'st-inactive', maintenance: 'st-maint', removed: 'st-removed' }[s] || 'st-inactive';
  }
  function resultCls(r) {
    return { pass: 'r-pass', fail: 'r-fail', na: 'r-na' }[r] || '';
  }
</script>

<div class="ws">

  <!-- ── Session bar ──────────────────────────────────────────────────────── -->
  <div class="sbar">
    <div class="sbar-l">
      <span class="sbar-icon">{typeConfig?.icon}</span>
      <div class="sbar-info">
        <div class="sbar-name">
          {#if session?.session_scope === 'building'}
            {session.building_name || session.building}
            {#if $walkStore.currentFloor}
              · Floor {$walkStore.currentFloor}
            {/if}
          {:else}
            {session?.session_name || (session?.building + ' · F' + session?.floor_level)}
          {/if}
        </div>
        <div class="sbar-meta">
          {typeConfig?.label}
          {#if session?.light_subtype_filter === 'emergency'}
            <span class="badge-em">Emergency</span>
          {/if}
          {#if session?.inspector_name}
            <span class="sbar-sep">·</span>
            <span class="sbar-inspector">{session.inspector_name}</span>
          {/if}
        </div>
      </div>
    </div>
    <div class="sbar-r">
      <!-- FIX: Show floor progress for building-wide sessions -->
      {#if session?.session_scope === 'building' && floorProgress}
        <div class="sbar-floor">Floor {floorProgress.currentFloorIndex} of {floorProgress.totalFloors}</div>
      {/if}
      <div class="sbar-count">{currentIndex + 1} / {elements.length}</div>
      <!-- FIX: Better finish button instead of X -->
      <button class="finish-btn" on:click={() => view = 'close'}>
        FINISH
      </button>
    </div>
  </div>

  <!-- Progress -->
  <div class="prog-track"><div class="prog-fill" style="width:{progress*100}%"></div></div>

  <!-- ── Element card ─────────────────────────────────────────────────────── -->
  {#if view === 'card' && currentElement}
    <div class="ecard">

      <div class="eid">
        <!-- FIX: Use displayFloor which updates with current floor -->
        <div class="ename">{getElementDisplayName(currentElement, displayFloor)}</div>
        {#if currentElement.label}<div class="elabel">{currentElement.label}</div>{/if}
        <div class="emeta">
          {#if currentElement.subtype}<span class="esub">{currentElement.subtype}</span>{/if}
          <span class="estatus {statusCls(currentElement.status)}">{currentElement.status}</span>
        </div>
      </div>

      {#if hasInspection}
        <div class="insp-last {resultCls(lastInspection.inspection_result)}">
          <div class="insp-hdr">
            <span class="insp-lbl">LAST INSPECTION</span>
            <span class="insp-time">{fmtTime(lastInspection.inspected_at)}</span>
          </div>
          <div class="insp-result">
            {lastInspection.inspection_result === 'pass' ? '✓ PASS' : lastInspection.inspection_result === 'fail' ? '✗ FAIL' : '— N/A'}
          </div>
          {#if lastInspection.inspector_notes}<div class="insp-notes">{lastInspection.inspector_notes}</div>{/if}
        </div>
      {:else}
        <div class="not-inspected">NOT YET INSPECTED</div>
      {/if}

      <div class="fields">
        {#if currentElement.element_type === 'light'}
          <div class="fr"><span class="fk">SUBTYPE</span><span class="fv">{currentElement.subtype || '—'}</span></div>
          <div class="fr"><span class="fk">BATTERY</span><span class="fv">{currentElement.battery || '—'}</span></div>
          {#if currentElement.wattage}<div class="fr"><span class="fk">WATTAGE</span><span class="fv">{currentElement.wattage}W</span></div>{/if}
          <div class="fr"><span class="fk">EMERGENCY</span><span class="fv">{currentElement.emergency ? 'Yes' : 'No'}</span></div>
          <div class="fr"><span class="fk">MOTION</span><span class="fv">{currentElement.movement_sensor ? 'Yes' : 'No'}</span></div>
          <div class="fr"><span class="fk">LIGHT SNS</span><span class="fv">{currentElement.light_sensor ? 'Yes' : 'No'}</span></div>
        {:else if currentElement.element_type === 'communal_door' || currentElement.element_type === 'apartment_door'}
          <div class="fr"><span class="fk">SUBTYPE</span><span class="fv">{currentElement.subtype || '—'}</span></div>
          <div class="fr"><span class="fk">SECURITY</span><span class="fv">{currentElement.security || '—'}</span></div>
          <div class="fr"><span class="fk">RETAINED</span><span class="fv">{currentElement.retained ? 'Yes' : 'No'}</span></div>
        {:else}
          <div class="fr"><span class="fk">SUBTYPE</span><span class="fv">{currentElement.subtype || '—'}</span></div>
        {/if}
        {#if currentElement.notes}<div class="fr"><span class="fk">NOTES</span><span class="fv">{currentElement.notes}</span></div>{/if}
        <div class="fr"><span class="fk">ASSET ID</span><span class="fv">{currentElement.asset_id || '—'}</span></div>
      </div>

      {#if canEdit}
        <div class="actions">
          <button class="act act-inspect" on:click={() => view = 'inspect'}>✓ INSPECT</button>
          <button class="act act-edit"    on:click={() => view = 'edit'}>✎ EDIT</button>
        </div>
      {:else}
        <div class="actions">
          <button class="act act-inspect" on:click={() => view = 'inspect'}>✓ RECORD INSPECTION</button>
        </div>
      {/if}
    </div>

  {:else if view === 'card' && elements.length === 0}
    <div class="empty-walk">No elements found for this session.</div>
  {/if}

  {#if view === 'edit' && currentElement}
    <WalkElementEditor element={currentElement} floorLevel={displayFloor}
      on:saved={handleEditSaved} on:cancel={() => view = 'card'} />
  {/if}

  {#if view === 'inspect' && currentElement}
    <WalkInspectionPanel element={currentElement} session={session}
      on:saved={handleInspectionSaved} on:cancel={() => view = 'card'} />
  {/if}

  {#if view === 'jump'}
    <WalkJumpList {elements} {currentIndex} {inspections} floorLevel={displayFloor}
      on:jump={handleJumpTo} on:close={() => view = 'card'} />
  {/if}

  {#if view === 'close'}
    <div class="cc">
      <div class="cc-hdr">FINISH INSPECTION</div>
      <div class="cc-sum">
        <div class="cc-row"><span class="cc-k">SESSION</span><span class="cc-v">{session?.session_name || '—'}</span></div>
        <div class="cc-row"><span class="cc-k">INSPECTOR</span><span class="cc-v">{session?.inspector_name || '—'}</span></div>
        <div class="cc-row"><span class="cc-k">INSPECTED</span><span class="cc-v">{inspectedCount} / {elements.length} elements</span></div>
        {#if session?.session_scope === 'building'}
          <div class="cc-row"><span class="cc-k">BUILDING</span><span class="cc-v">{session?.building_name || session?.building}</span></div>
        {:else}
          <div class="cc-row"><span class="cc-k">BUILDING</span><span class="cc-v">{session?.building} · Floor {session?.floor_level}</span></div>
        {/if}
      </div>
      <div class="cc-field">
        <label class="cc-lbl" for="close-notes">Session notes (optional)</label>
        <textarea id="close-notes" class="cc-ta" bind:value={closeNotes}
          placeholder="Any overall observations…" rows="3"></textarea>
      </div>
      {#if closeError}<div class="cc-err">⚠ {closeError}</div>{/if}
      <div class="cc-acts">
        <button class="cc-continue" on:click={() => view = 'card'}>CONTINUE WALK</button>
        <button class="cc-finish" on:click={handleCloseSession} disabled={closing}>
          {closing ? 'FINISHING…' : '✓ FINISH INSPECTION'}
        </button>
      </div>
    </div>
  {/if}

  {#if view === 'card'}
    <div class="nav">
      <button class="nb nb-prev" on:click={handlePrev} disabled={isFirst}>← PREV</button>
      <button class="nb nb-list" on:click={() => view = 'jump'}>☰ LIST</button>
      <button class="nb nb-next" on:click={handleNext} disabled={isLast}>
        {#if isLast}
          COMPLETE
        {:else if session?.session_scope === 'building' && currentIndex === elements.length - 1}
          NEXT FLOOR →
        {:else}
          NEXT →
        {/if}
      </button>
    </div>
  {/if}
</div>

<style>
  /* ── Root ─────────────────────────────────────────────────────────────────*/
  .ws {
    display: flex; flex-direction: column;
    min-height: calc(100vh - 64px);
    background: #0d0d14; color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
    position: relative;
  }

  /* ── Session bar ──────────────────────────────────────────────────────────*/
  .sbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid #2e2e42; background: #111122;
  }
  .sbar-l { display: flex; align-items: center; gap: 0.75rem; }
  .sbar-icon { font-size: 1.35rem; }
  .sbar-info { display: flex; flex-direction: column; gap: 0.15rem; }
  .sbar-name { font-size: 0.875rem; color: #f0f0f0; font-weight: 700; }
  .sbar-meta { font-size: 0.7rem; letter-spacing: 0.06em; color: #ccc; display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
  .sbar-sep  { color: #888; }
  .sbar-inspector { color: #fb923c; }
  .badge-em  {
    font-size: 0.58rem; padding: 0.1rem 0.35rem;
    background: #2a1800; color: #fb923c; border-radius: 3px;
  }
  .sbar-r { display: flex; align-items: center; gap: 0.75rem; }
  .sbar-floor { font-size: 0.75rem; color: #fb923c; font-weight: 600; }
  .sbar-count { font-size: 0.85rem; color: #ccc; font-weight: 600; }
  
  /* FIX: Better finish button styling */
  .finish-btn {
    background: #fb923c; border: none; border-radius: 6px;
    color: #0d0d14; font-family: inherit; font-size: 0.72rem; font-weight: 800;
    padding: 0.5rem 1rem; cursor: pointer; transition: all 0.15s;
    letter-spacing: 0.1em;
  }
  .finish-btn:hover { background: #f97316; }

  /* Old close button removed */
  .close-btn {
    background: none; border: 1px solid #3e3e52; border-radius: 4px;
    color: #ccc; font-family: inherit; font-size: 0.8rem;
    padding: 0.3rem 0.6rem; cursor: pointer; transition: all 0.15s;
  }
  .close-btn:hover { border-color: #ef4444; color: #f87171; }

  /* ── Progress ─────────────────────────────────────────────────────────────*/
  .prog-track { height: 3px; background: #2e2e42; flex-shrink: 0; }
  .prog-fill  { height: 100%; background: #fb923c; transition: width 0.3s ease; }

  /* ── Element card ─────────────────────────────────────────────────────────*/
  .ecard {
    flex: 1; display: flex; flex-direction: column;
    padding: 1.5rem 1.25rem 6.5rem; gap: 1.25rem; overflow-y: auto;
  }

  .ename { font-size: 2.25rem; font-weight: 800; letter-spacing: 0.04em; color: #fb923c; line-height: 1; }
  .elabel { font-size: 0.925rem; color: #ddd; margin-top: 0.375rem; }
  .emeta  { display: flex; align-items: center; gap: 0.625rem; margin-top: 0.625rem; }

  .esub {
    font-size: 0.8rem; color: #eee;
    background: #222235; padding: 0.25rem 0.625rem;
    border-radius: 4px; border: 1px solid #3e3e58;
  }
  .estatus { font-size: 0.68rem; letter-spacing: 0.1em; padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 700; }
  .st-active   { background: #0d2a0d; color: #4ade80; border: 1px solid #166534; }
  .st-inactive { background: #222235; color: #ccc;    border: 1px solid #3e3e58; }
  .st-maint    { background: #2a1800; color: #fbbf24; border: 1px solid #92400e; }
  .st-removed  { background: #2a0000; color: #f87171; border: 1px solid #7f1d1d; }

  /* ── Last inspection box ──────────────────────────────────────────────────*/
  .insp-last { padding: 1rem 1.125rem; border-radius: 10px; border: 2px solid transparent; }
  .r-pass { background: #0a1f0a; border-color: #22c55e; }
  .r-fail { background: #1f0a0a; border-color: #ef4444; }
  .r-na   { background: #181828; border-color: #3e3e58; }

  .insp-hdr  { display: flex; justify-content: space-between; margin-bottom: 0.375rem; }
  .insp-lbl  { font-size: 0.62rem; letter-spacing: 0.15em; color: #ccc; }
  .insp-time { font-size: 0.7rem; color: #ccc; }

  .insp-result { font-size: 1.5rem; font-weight: 800; letter-spacing: 0.04em; }
  .r-pass .insp-result { color: #4ade80; }
  .r-fail .insp-result { color: #f87171; }
  .r-na   .insp-result { color: #aaa; }

  .insp-notes { font-size: 0.82rem; color: #ddd; margin-top: 0.375rem; line-height: 1.4; }

  .not-inspected {
    font-size: 0.72rem; letter-spacing: 0.15em; color: #ccc;
    border: 1px dashed #3e3e58; border-radius: 10px; padding: 1rem 1.125rem;
  }

  /* ── Fields table ─────────────────────────────────────────────────────────*/
  .fields { background: #111122; border: 1px solid #2e2e42; border-radius: 10px; overflow: hidden; }
  .fr {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 0.7rem 1rem; border-bottom: 1px solid #1e1e32; gap: 0.5rem;
  }
  .fr:last-child { border-bottom: none; }
  .fk { font-size: 0.62rem; letter-spacing: 0.15em; color: #ccc; flex-shrink: 0; padding-top: 0.1rem; }
  .fv { font-size: 0.88rem; color: #f0f0f0; text-align: right; }

  /* ── Action buttons ───────────────────────────────────────────────────────*/
  .actions { display: flex; gap: 0.625rem; }
  .act {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.375rem;
    padding: 1rem; border-radius: 10px; border: 2px solid transparent;
    font-family: inherit; font-size: 0.82rem; font-weight: 700;
    letter-spacing: 0.1em; cursor: pointer; transition: all 0.15s;
  }
  .act-inspect { background: #0a1f0a; border-color: #22c55e; color: #4ade80; }
  .act-inspect:hover { background: #22c55e; color: #0a0a0f; }
  .act-edit    { background: #181828; border-color: #3e3e58; color: #eee; }
  .act-edit:hover { border-color: #fb923c; color: #fb923c; }

  /* ── Nav bar ──────────────────────────────────────────────────────────────*/
  .nav {
    position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
    width: 100%; max-width: 480px;
    display: flex; background: #0d0d14; border-top: 1px solid #2e2e42; z-index: 10;
  }
  .nb {
    flex: 1; padding: 1.125rem 0.5rem;
    background: none; border: none;
    font-family: inherit; font-size: 0.78rem; font-weight: 700;
    letter-spacing: 0.1em; cursor: pointer; transition: all 0.15s; color: #ccc;
  }
  .nb:hover:not(:disabled) { color: #f0f0f0; background: #1a1a2e; }
  .nb:disabled { opacity: 0.25; cursor: not-allowed; }
  .nb-prev { border-right: 1px solid #2e2e42; }
  .nb-list { border-right: 1px solid #2e2e42; }
  .nb-next { color: #fb923c; font-weight: 800; }
  .nb-next:hover:not(:disabled) { background: #2a1800; color: #fb923c; }

  /* ── Empty ────────────────────────────────────────────────────────────────*/
  .empty-walk {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: #ccc; font-size: 0.875rem;
  }

  /* ── Close confirm ────────────────────────────────────────────────────────*/
  .cc { flex: 1; padding: 1.5rem 1.25rem; display: flex; flex-direction: column; gap: 1.25rem; }
  .cc-hdr { font-size: 0.65rem; letter-spacing: 0.25em; color: #fb923c; font-weight: 700; }
  .cc-sum {
    background: #111122; border: 1px solid #2e2e42; border-radius: 10px;
    padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;
  }
  .cc-row { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
  .cc-k   { font-size: 0.62rem; letter-spacing: 0.15em; color: #ccc; flex-shrink: 0; }
  .cc-v   { font-size: 0.88rem; color: #f0f0f0; text-align: right; }
  .cc-field { display: flex; flex-direction: column; gap: 0.5rem; }
  .cc-lbl   { font-size: 0.65rem; letter-spacing: 0.1em; color: #ccc; }
  .cc-ta {
    background: #111122; border: 2px solid #2e2e42; border-radius: 8px;
    color: #f0f0f0; font-family: inherit; font-size: 0.875rem;
    padding: 0.875rem 1rem; resize: none; width: 100%; box-sizing: border-box;
  }
  .cc-ta:focus { outline: none; border-color: #fb923c; }
  .cc-ta::placeholder { color: #777; }
  .cc-err {
    font-size: 0.825rem; color: #fca5a5; padding: 0.875rem 1rem;
    background: #2a0000; border: 2px solid #ef4444; border-radius: 8px;
  }
  .cc-acts { display: flex; flex-direction: column; gap: 0.625rem; margin-top: auto; }
  .cc-continue {
    padding: 1rem; background: none; border: 2px solid #3e3e58; border-radius: 8px;
    color: #eee; font-family: inherit; font-size: 0.82rem; font-weight: 700;
    letter-spacing: 0.1em; cursor: pointer; transition: all 0.15s;
  }
  .cc-continue:hover { border-color: #6e6e88; color: #f0f0f0; }
  
  /* FIX: Better finish button in dialog */
  .cc-finish {
    padding: 1rem; background: #22c55e; border: none; border-radius: 8px;
    color: #0d0d14; font-family: inherit; font-size: 0.82rem; font-weight: 800;
    letter-spacing: 0.15em; cursor: pointer; transition: all 0.15s;
  }
  .cc-finish:hover:not(:disabled) { background: #16a34a; }
  .cc-finish:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
