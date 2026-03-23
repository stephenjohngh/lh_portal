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
  import { groupByElement, worstResult, resultLabel } from '../utils/walkHelpers.js';
  import WalkElementEditor    from './WalkElementEditor.svelte';
  import WalkInspectionPanel  from './WalkInspectionPanel.svelte';
  import WalkJumpList         from './WalkJumpList.svelte';
  import WalkPlanViewer       from './WalkPlanViewer.svelte';
import WalkDoorInspectionPanel from './WalkDoorInspectionPanel.svelte';

  const logger   = getLogger('WalkSession');
  const dispatch = createEventDispatcher();

  export let canEdit = false;

  // 'card' | 'edit' | 'inspect' | 'jump' | 'close' | 'plan'
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
  
  // FIX: Check if element failed last inspection - show red background
  $: inspectionFailed = lastInspection?.inspection_result === 'failed';
  $: statusClass = inspectionFailed ? 'st-failed' : statusCls(currentElement?.status);
  
  // Count pass/fail from inspections
  $: inspectionStats = (() => {
    const allInspections = Object.values(inspections).flat();
    return {
      pass: allInspections.filter(i => i.inspection_result === 'OK').length,
      fail: allInspections.filter(i => i.inspection_result === 'failed').length,
      problem: allInspections.filter(i => i.inspection_result === 'problem').length,
      inactive: allInspections.filter(i => i.inspection_result === 'inactive').length
    };
  })();

  // Element list for the live summary view.
  // Iterates in-memory inspections, looks up element metadata by id, and groups
  // by element sorted fail-first → floor → asset_id (same as closed session summary).
  $: summaryGrouped = (() => {
    // Build elementId → { el, floor_level } index
    const elById = {};
    if (session?.session_scope === 'building') {
      for (const p of ($walkStore.buildingPlans || [])) {
        for (const el of ($walkStore.allElements[p.id] || [])) {
          elById[el.id] = { el, floor_level: p.floor_level };
        }
      }
    } else {
      for (const el of ($walkStore.walkElements || [])) {
        elById[el.id] = { el, floor_level: session?.floor_level ?? null };
      }
    }

    const rows = [];
    for (const [elementId, elInspections] of Object.entries(inspections)) {
      const meta = elById[elementId];
      if (!meta) continue;
      const { el, floor_level } = meta;
      for (const ins of elInspections) {
        rows.push({
          ...ins,
          plan_element_id: elementId,
          asset_id:     el.asset_id     ?? null,
          subtype:      el.subtype      ?? null,
          label:        el.label        ?? null,
          element_type: el.element_type ?? null,
          floor_level,
          result:       ins.inspection_result ?? ins.result ?? null,
        });
      }
    }
    return groupByElement(rows);
  })();

  // FIX: Floor progress for building-wide sessions
  $: floorProgress = session?.session_scope === 'building' 
    ? walkStore.getCurrentFloorProgress() 
    : null;
    
  // FIX: Use current floor for element display name in building-wide sessions
  $: displayFloor = $walkStore.currentFloor || session?.floor_level;
  
  // Get current plan for showing element location
  $: currentPlan = (() => {
    if (session?.session_scope === 'building') {
      return $walkStore.buildingPlans.find(p => p.floor_level === $walkStore.currentFloor);
    }
    // For single-plan sessions, need to get plan from store
    // This requires the plan to be loaded in walk store
    return $walkStore.plans?.find(p => p.id === session?.plan_id);
  })();

  $: isRepair = session?.session_type === 'repair';

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
  
  function handleNext()      { view = 'card'; walkStore.goNext(); }
  function handleJumpTo(e)   { view = 'card'; walkStore.goToIndex(e.detail.index); }
  function handleEditSaved() { view = 'card'; }

  // After recording an inspection in repair mode, go straight back to the repair list.
  // In normal sessions, return to the element card.
  function handleInspectionSaved() {
    if (isRepair) {
      dispatch('backtorepair');
    } else {
      view = 'card';
    }
  }

  // True when every element in scope has been inspected at least once
  $: totalElements = session?.session_scope === 'building'
    ? ($walkStore.buildingPlans || []).reduce((n, p) =>
        n + (($walkStore.allElements[p.id] || []).filter(e => e.element_type === session.element_type).length), 0)
    : elements.length;
  $: allInspected = totalElements > 0 && inspectedCount >= totalElements;

  async function handlePause() {
    try {
      await walkStore.pauseSession(session.id);
    } catch (err) {
      logger('Pause failed:', err.message);
    }
    dispatch('paused');
  }

  async function handleCloseSession() {
    closing = true; closeError = null;
    try {
      await walkStore.completeSession(session.id, closeNotes);
      dispatch('closed');
    } catch (err) {
      logger('Complete failed:', err.message);
      closeError = err.message;
    } finally { closing = false; }
  }

  function statusCls(s) {
    return { active: 'st-active', inactive: 'st-inactive', maintenance: 'st-maint', removed: 'st-removed' }[s] || 'st-inactive';
  }
  function resultCls(r) {
    return { OK: 'r-pass', failed: 'r-fail', problem: 'r-fail', inactive: 'r-na' }[r] || '';
  }
</script>

<div class="ws">

  <!-- ── Session bar ──────────────────────────────────────────────────────── -->
  <div class="sbar">
    <div class="sbar-l">
      <div class="sbar-info">
        <div class="sbar-name">
          {#if session?.session_scope === 'building'}
            {#if session?.session_name}
              {session.session_name}
            {:else if $walkStore.currentFloor}
              Floor {$walkStore.currentFloor}
            {:else}
              Building Walk
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
        </div>
      </div>
    </div>
    <div class="sbar-r">
      <!-- FIX: Simplified floor progress - just numbers -->
      {#if session?.session_scope === 'building' && floorProgress}
        <div class="sbar-floor">{floorProgress.currentFloorIndex}/{floorProgress.totalFloors}</div>
      {/if}
      <div class="sbar-count">{currentIndex + 1}/{elements.length}</div>
      <!-- Repair sessions: back to list only. Others: PAUSE/FINISH. -->
      {#if isRepair}
        <button class="back-list-btn" on:click={() => dispatch('backtorepair')}>← LIST</button>
      {:else if session?.session_type === 'inspection'}
        <button class="pause-btn" on:click={handlePause}>PAUSE</button>
        <button class="finish-btn" on:click={() => view = 'close'} disabled={view === 'close'}>FINISH</button>
      {:else if allInspected}
        <button class="finish-btn" on:click={() => view = 'close'} disabled={view === 'close'}>FINISH</button>
      {:else}
        <button class="pause-btn" on:click={handlePause}>PAUSE</button>
      {/if}
    </div>
  </div>

  <!-- Progress (hidden for repair sessions) -->
  {#if !isRepair}
    <div class="prog-track"><div class="prog-fill" style="width:{progress*100}%"></div></div>
  {/if}

  <!-- ── Element card ─────────────────────────────────────────────────────── -->
  {#if view === 'card' && currentElement}
    <div class="ecard" class:ecard-repair={isRepair}>

      <div class="eid">
        <!-- FIX: Name, subtype, status all on one line -->
        <div class="eid-header">
          <div class="ename">{getElementDisplayName(currentElement, displayFloor)}</div>
          {#if currentElement.subtype}
            <span class="esub-inline">{currentElement.subtype}</span>
          {/if}
          <!-- Show previous status, or FAILED if inspection failed -->
          <span class="estatus-inline {statusClass}">
            {#if inspectionFailed}
              FAILED
            {:else}
              {currentElement.status === 'active' ? 'OK' : currentElement.status}
            {/if}
          </span>
        </div>
        {#if currentElement.label}<div class="elabel">{currentElement.label}</div>{/if}
      </div>

      {#if hasInspection}
        <div class="insp-last {resultCls(lastInspection.inspection_result)}">
          <div class="insp-hdr">
            <span class="insp-lbl">THIS INSPECTION</span>
            <span class="insp-time">{fmtTime(lastInspection.inspected_at)}</span>
          </div>
          <div class="insp-result">
            {lastInspection.inspection_result === 'OK' ? '✓ PASS' : lastInspection.inspection_result === 'failed' ? '✗ FAIL': lastInspection.inspection_result === 'problem' ? 'PROBLEM' : 'INACTIVE'}
          </div>
          {#if lastInspection.inspector_notes}<div class="insp-notes">{lastInspection.inspector_notes}</div>{/if}
        </div>
      {:else}
        <div class="not-inspected">NOT YET INSPECTED</div>
      {/if}

      <div class="fields">
        {#if currentElement.label}
          <div class="fr"><span class="fk">LABEL</span><span class="fv">{currentElement.label}</span></div>
        {/if}
        {#if currentElement.element_type === 'light'}
          <div class="fr"><span class="fk">BATTERY</span><span class="fv">{currentElement.battery || '—'}</span></div>
          {#if currentElement.wattage}<div class="fr"><span class="fk">WATTAGE</span><span class="fv">{currentElement.wattage}W</span></div>{/if}
          <div class="fr"><span class="fk">EMERGENCY</span><span class="fv">{currentElement.emergency ? 'Yes' : 'No'}</span></div>
          <div class="fr"><span class="fk">MOVEMENT SENSOR</span><span class="fv">{currentElement.movement_sensor ? 'Yes' : 'No'}</span></div>
          <div class="fr"><span class="fk">LIGHT SENSOR</span><span class="fv">{currentElement.light_sensor ? 'Yes' : 'No'}</span></div>
        {:else if currentElement.element_type === 'communal_door' || currentElement.element_type === 'apartment_door'}
          <div class="fr"><span class="fk">SECURITY</span><span class="fv">{currentElement.security || '—'}</span></div>
          <div class="fr"><span class="fk">RETAINED</span><span class="fv">{currentElement.retained ? 'Yes' : 'No'}</span></div>
        {/if}
        {#if currentElement.notes}<div class="fr"><span class="fk">NOTES</span><span class="fv">{currentElement.notes}</span></div>{/if}
        <div class="fr"><span class="fk">ASSET ID</span><span class="fv">{currentElement.asset_id || '—'}</span></div>
      </div>

      {#if canEdit}
        <div class="actions">
          <button class="act act-plan" on:click={() => view = 'plan'}>📍 PLAN</button>
          <button class="act act-inspect" on:click={() => view = 'inspect'}>✓ INSPECT</button>
          <button class="act act-edit"    on:click={() => view = 'edit'}>✎ EDIT</button>
        </div>
      {:else}
        <div class="actions">
          <button class="act act-plan" on:click={() => view = 'plan'}>📍 SHOW ON PLAN</button>
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
  {#if currentElement.element_type === 'communal_door' || currentElement.element_type === 'apartment_door'}
    <WalkDoorInspectionPanel 
      element={currentElement} 
      session={session}
      on:saved={handleInspectionSaved} 
      on:cancel={() => view = 'card'} 
    />
  {:else}
    <WalkInspectionPanel 
      element={currentElement} 
      session={session}
      floorLevel={displayFloor}
      on:saved={handleInspectionSaved} 
      on:cancel={() => view = 'card'} 
    />
  {/if}
{/if}


  {#if view === 'jump'}
    <WalkJumpList {elements} {currentIndex} {inspections} floorLevel={displayFloor}
      on:jump={handleJumpTo} on:close={() => view = 'card'} />
  {/if}

  {#if view === 'plan' && currentPlan && currentElement}
    <WalkPlanViewer 
      element={currentElement} 
      plan={currentPlan} 
      floorLevel={displayFloor}
      on:close={() => view = 'card'} 
    />
  {/if}

  {#if view === 'summary' && !isRepair}
    <div class="summary">
      <div class="summary-hdr">
        <button class="back-btn" on:click={() => view = 'card'}>← BACK</button>
        <div class="summary-title">SESSION SUMMARY</div>
      </div>

      <div class="summary-body">
        <div class="summary-section">
          <div class="summary-label">SESSION</div>
          <div class="summary-value">{session?.session_name || (session?.building + ' · Floor ' + session?.floor_level)}</div>
        </div>

        {#if session?.inspector_name}
          <div class="summary-section">
            <div class="summary-label">INSPECTOR</div>
            <div class="summary-value">{session.inspector_name}</div>
          </div>
        {/if}

        <div class="summary-section">
          <div class="summary-label">ELEMENT TYPE</div>
          <div class="summary-value">{typeConfig?.label || session?.element_type}</div>
          {#if session?.light_subtype_filter === 'emergency'}
            <span class="badge-em-summary">Emergency Only</span>
          {/if}
        </div>

        {#if session?.session_scope === 'building'}
          <div class="summary-section">
            <div class="summary-label">BUILDING</div>
            <div class="summary-value">{session.building_name || session.building}</div>
          </div>
          
          <div class="summary-section">
            <div class="summary-label">FLOORS</div>
            <div class="summary-value">{$walkStore.buildingPlans?.length || 0} floors</div>
          </div>
        {:else}
          <div class="summary-section">
            <div class="summary-label">FLOOR</div>
            <div class="summary-value">{session?.floor_level}</div>
          </div>
        {/if}

        <div class="summary-divider"></div>

        <div class="summary-stats">
          <div class="stat-card">
            <div class="stat-number">{session?.total_elements_count || elements.length}</div>
            <div class="stat-label">TOTAL ELEMENTS</div>
          </div>

          <div class="stat-card stat-inspected">
            <div class="stat-number">{inspectedCount}</div>
            <div class="stat-label">INSPECTED</div>
          </div>

          <div class="stat-card stat-remaining">
            <div class="stat-number">{(session?.total_elements_count || elements.length) - inspectedCount}</div>
            <div class="stat-label">REMAINING</div>
          </div>
        </div>

        <div class="summary-results">
          <div class="result-card result-pass">
            <div class="result-icon">✓</div>
            <div class="result-info">
              <div class="result-number">{inspectionStats.OK}</div>
              <div class="result-label">PASS</div>
            </div>
          </div>

          <div class="result-card result-fail">
            <div class="result-icon">✗</div>
            <div class="result-info">
              <div class="result-number">{inspectionStats.failed}</div>
              <div class="result-label">FAIL</div>
            </div>
          </div>
          
          <div class="result-card result-fail">
            <div class="result-icon">✗</div>
            <div class="result-info">
              <div class="result-number">{inspectionStats.problem}</div>
              <div class="result-label">PROBLEM</div>
            </div>
          </div>


          <div class="result-card result-na">
            <div class="result-icon">—</div>
            <div class="result-info">
              <div class="result-number">{inspectionStats.inactive}</div>
              <div class="result-label">INACTIVE</div>
            </div>
          </div>
        </div>

        <div class="summary-progress">
          <div class="progress-label">
            <span>PROGRESS</span>
            <span class="progress-percent">
              {Math.round((inspectedCount / (session?.total_elements_count || elements.length)) * 100)}%
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: {(inspectedCount / (session?.total_elements_count || elements.length)) * 100}%"></div>
          </div>
        </div>

        <button class="continue-btn" on:click={() => view = 'card'}>
          CONTINUE INSPECTION
        </button>

        {#if summaryGrouped.length > 0}
          <div class="sum-el-title">INSPECTED ELEMENTS</div>
          <div class="sum-el-list">
            {#each summaryGrouped as el (el.element_id)}
              {@const worst = worstResult(el.rows)}
              {@const latest = el.rows[el.rows.length - 1]}
              <div class="sum-el-row res-{worst}">
                <div class="sum-el-top">
                  <div class="sum-el-name-block">
                    <div class="sum-el-id">{getElementDisplayName({ asset_id: el.asset_id, element_type: el.element_type }, el.floor_level)}</div>
                    {#if el.label}<div class="sum-el-label">{el.label}</div>{/if}
                  </div>
                  {#if el.subtype}<div class="sum-el-sub">{el.subtype}</div>{/if}
                  <div class="sum-el-res sum-el-res-{worst}">{resultLabel(worst)}</div>
                </div>
                {#if latest?.inspector_notes}
                  <div class="sum-el-notes">{latest.inspector_notes}</div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

      </div><!-- end summary-body -->
    </div><!-- end summary -->
  {/if}<!-- end view === 'summary' -->

  {#if view === 'close' && !isRepair}
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
          {closing ? 'COMPLETING…' : '✓ COMPLETE INSPECTION SESSION'}
        </button>
      </div>
    </div>
  {/if}

  {#if view === 'card' && !isRepair}
    <div class="nav">
      <button class="nb nb-prev" on:click={handlePrev} disabled={isFirst}>← PREV</button>
      <button class="nb nb-summary" on:click={() => view = 'summary'}>📊 SUMMARY</button>
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
  .finish-btn:hover:not(:disabled) { background: #f97316; }
  .finish-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .back-list-btn {
    background: none; border: 1px solid #3e3e58; border-radius: 6px;
    color: #fb923c; font-family: inherit; font-size: 0.72rem; font-weight: 800;
    padding: 0.5rem 0.875rem; cursor: pointer; transition: all 0.15s;
    letter-spacing: 0.08em; white-space: nowrap;
  }
  .back-list-btn:hover { border-color: #fb923c; background: #2a1800; }

  .pause-btn {
    background: none; border: 1px solid #3e3e58; border-radius: 6px;
    color: #ccc; font-family: inherit; font-size: 0.72rem; font-weight: 700;
    padding: 0.5rem 1rem; cursor: pointer; transition: all 0.15s;
    letter-spacing: 0.1em;
  }
  .pause-btn:hover { border-color: #fb923c; color: #fb923c; }

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
  .ecard-repair { padding-bottom: 2rem; }

  /* FIX: Inline header with name, subtype, status */
  .eid-header {
    display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
  }

  .ename { 
    font-size: 2.25rem; font-weight: 800; letter-spacing: 0.04em; 
    color: #fb923c; line-height: 1; 
  }
  .elabel { font-size: 0.875rem; color: #ddd; margin-top: 0.25rem; }
  
  /* Inline subtype */
  .esub-inline {
    font-size: 0.75rem; color: #eee; padding: 0.2rem 0.5rem;
    background: #222235; border: 1px solid #3e3e58; border-radius: 4px;
    margin-left: 0.5rem;
  }
  
  /* Inline status */
  .estatus-inline { 
    font-size: 0.68rem; letter-spacing: 0.1em; 
    padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 700;
    margin-left: auto; /* Push to right */
  }
  .st-active   { background: #0d2a0d; color: #4ade80; border: 1px solid #166534; }
  .st-inactive { background: #222235; color: #ccc;    border: 1px solid #3e3e58; }
  .st-maint    { background: #2a1800; color: #fbbf24; border: 1px solid #92400e; }
  .st-removed  { background: #2a0000; color: #f87171; border: 1px solid #7f1d1d; }
  .st-failed   { background: #2a0000; color: #f87171; border: 1px solid #ef4444; } /* FIX: Red for failed */

  /* Old styles no longer needed */
  .emeta  { display: flex; align-items: center; gap: 0.625rem; margin-top: 0.625rem; }

  .esub {
    font-size: 0.8rem; color: #eee;
    background: #222235; padding: 0.25rem 0.625rem;
    border-radius: 4px; border: 1px solid #3e3e58;
  }
  .estatus { font-size: 0.68rem; letter-spacing: 0.1em; padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 700; }

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
  .act-plan    { background: #181828; border-color: #5b21b6; color: #a78bfa; }
  .act-plan:hover { background: #5b21b6; color: #fff; }
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
  .nb-summary { border-right: 1px solid #2e2e42; }
  .nb-next { color: #fb923c; font-weight: 800; }
  .nb-next:hover:not(:disabled) { background: #2a1800; color: #fb923c; }

  /* ── Summary view ─────────────────────────────────────────────────────────*/
  .summary {
    display: flex; flex-direction: column; flex: 1;
    background: #0d0d14; color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
    overflow-y: auto; padding-bottom: 2rem;
  }
  
  .summary-hdr {
    display: flex; align-items: center; gap: 1rem;
    padding: 1rem 1.25rem; border-bottom: 1px solid #2e2e42;
    position: sticky; top: 0; background: #111122; z-index: 5;
  }
  
  .summary-title {
    font-size: 0.75rem; letter-spacing: 0.2em; color: #fb923c; font-weight: 700;
  }
  
  .summary-body {
    padding: 1.25rem; display: flex; flex-direction: column; gap: 1.25rem;
  }
  
  .summary-section {
    display: flex; flex-direction: column; gap: 0.375rem;
  }
  
  .summary-label {
    font-size: 0.62rem; letter-spacing: 0.15em; color: #ccc;
  }
  
  .summary-value {
    font-size: 0.95rem; color: #f0f0f0; font-weight: 600;
  }
  
  .badge-em-summary {
    font-size: 0.7rem; padding: 0.2rem 0.5rem;
    background: #2a1800; color: #fb923c; border-radius: 4px;
    display: inline-block; margin-top: 0.25rem; width: fit-content;
  }
  
  .summary-divider {
    height: 1px; background: #2e2e42; margin: 0.5rem 0;
  }
  
  .summary-stats {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;
  }
  
  .stat-card {
    background: #111122; border: 2px solid #2e2e42; border-radius: 10px;
    padding: 1rem; display: flex; flex-direction: column; align-items: center;
    gap: 0.5rem;
  }
  
  .stat-inspected {
    border-color: #22c55e;
  }
  
  .stat-remaining {
    border-color: #fb923c;
  }
  
  .stat-number {
    font-size: 2rem; font-weight: 800; color: #fb923c; line-height: 1;
  }
  
  .stat-inspected .stat-number {
    color: #4ade80;
  }
  
  .stat-remaining .stat-number {
    color: #fb923c;
  }
  
  .stat-label {
    font-size: 0.6rem; letter-spacing: 0.15em; color: #ccc;
    text-align: center;
  }
  
  .summary-results {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;
  }
  
  .result-card {
    background: #111122; border: 2px solid; border-radius: 10px;
    padding: 0.875rem; display: flex; align-items: center; gap: 0.625rem;
  }
  
  .result-pass {
    border-color: #22c55e; background: #0a1f0a;
  }
  
  .result-fail {
    border-color: #ef4444; background: #1f0a0a;
  }
  
  .result-na {
    border-color: #3e3e58; background: #181828;
  }
  
  .result-icon {
    font-size: 1.25rem; font-weight: 800; line-height: 1;
    width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
  }
  
  .result-pass .result-icon {
    color: #4ade80; background: #0d2a0d;
  }
  
  .result-fail .result-icon {
    color: #f87171; background: #2a0000;
  }
  
  .result-na .result-icon {
    color: #aaa; background: #222235;
  }
  
  .result-info {
    display: flex; flex-direction: column; gap: 0.125rem;
  }
  
  .result-number {
    font-size: 1.25rem; font-weight: 800; line-height: 1;
  }
  
  .result-pass .result-number {
    color: #4ade80;
  }
  
  .result-fail .result-number {
    color: #f87171;
  }
  
  .result-na .result-number {
    color: #aaa;
  }
  
  .result-label {
    font-size: 0.55rem; letter-spacing: 0.12em; color: #ccc;
  }
  
  .summary-progress {
    display: flex; flex-direction: column; gap: 0.5rem;
  }
  
  .progress-label {
    display: flex; justify-content: space-between; align-items: center;
  }
  
  .progress-label > span:first-child {
    font-size: 0.62rem; letter-spacing: 0.15em; color: #ccc;
  }
  
  .progress-percent {
    font-size: 0.875rem; font-weight: 700; color: #fb923c;
  }
  
  .progress-bar {
    height: 8px; background: #2e2e42; border-radius: 4px; overflow: hidden;
  }
  
  .progress-fill {
    height: 100%; background: linear-gradient(90deg, #fb923c, #f97316);
    transition: width 0.3s ease;
  }
  
  .continue-btn {
    padding: 1.25rem; background: #fb923c; border: none; border-radius: 10px;
    color: #0a0a0f; font-family: inherit; font-size: 0.9rem; font-weight: 800;
    letter-spacing: 0.2em; cursor: pointer; transition: background 0.15s;
    margin-top: 0.5rem;
  }
  .continue-btn:hover { background: #f97316; }

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

  /* ── Summary element list ─────────────────────────────────────────────────*/
  .sum-el-title {
    font-size: 0.62rem; letter-spacing: 0.2em; color: #ccc; padding-top: 0.5rem;
  }
  .sum-el-list  { display: flex; flex-direction: column; gap: 0.5rem; }
  .sum-el-row   {
    background: #111122; border: 2px solid #2e2e42; border-radius: 8px;
    padding: 0.75rem 1rem;
  }
  .res-fail { border-color: #7f1d1d; }
  .res-pass { border-color: #166534; }
  .sum-el-top         { display: flex; align-items: center; gap: 0.5rem; }
  .sum-el-name-block  { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; min-width: 0; }
  .sum-el-id          { font-size: 0.9rem; font-weight: 700; color: #f0f0f0; font-variant-numeric: tabular-nums; }
  .sum-el-label       { font-size: 0.7rem; color: #fb923c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sum-el-sub         { font-size: 0.62rem; color: #ccc; background: #222235; padding: 0.15rem 0.4rem; border-radius: 3px; flex-shrink: 0; }
  .sum-el-res         { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; flex-shrink: 0; }
  .sum-el-res-pass    { color: #4ade80; }
  .sum-el-res-fail    { color: #f87171; }
  .sum-el-res-na      { color: #aaa; }
  .sum-el-notes       {
    font-size: 0.75rem; color: #ddd; margin-top: 0.4rem;
    padding-top: 0.4rem; border-top: 1px solid #2e2e42; font-style: italic;
  }
</style>
