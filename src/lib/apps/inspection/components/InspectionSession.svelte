<!-- src/lib/apps/inspection/components/InspectionSession.svelte -->
<!-- Core inspection walk screen: navigate components, record inspections, edit, jump, close -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger }    from '$lib/utils/logger';
  import { buildComponentRef } from '$lib/utils/componentRef.js';
  import { inspectionStore }  from '../stores/inspectionStore.js';
  import { presetLabel, sessionFloorLabel } from '../utils/inspectionHelpers.js';
  import InspectionPanel             from './InspectionPanel.svelte';
  import InspectionComponentEditor   from './InspectionComponentEditor.svelte';
  import InspectionJumpList          from './InspectionJumpList.svelte';
  import InspectionComponentPlanViewer from './InspectionComponentPlanViewer.svelte';
  import WalkStatsBars from '$lib/apps/inspection/components/common/WalkStatsBars.svelte';
  import WalkBadge     from '$lib/apps/inspection/components/common/WalkBadge.svelte';
  import WalkTextarea  from '$lib/apps/inspection/components/common/WalkTextarea.svelte';
  import WalkButton    from '$lib/apps/inspection/components/common/WalkButton.svelte';
  import WalkError     from '$lib/apps/inspection/components/common/WalkError.svelte';

  const logger   = getLogger('InspectionSession');
  const dispatch = createEventDispatcher();

  export let canEdit = false;

  // View states: 'card' | 'inspect' | 'edit' | 'jump' | 'close' | 'component-plan' | 'floordir'
  let view       = 'card';
  // Full-screen editing sub-views own their whole screen: their own header,
  // back button and component ref. The session bar (with PAUSE/FINISH) and the
  // progress bar are hidden for them — to pause/finish you go back to the card.
  $: focusedView = view === 'inspect' || view === 'edit';
  let closeNotes = '';
  let closing    = false;
  let closeError = null;

  $: session      = $inspectionStore.activeSession;
  $: components   = $inspectionStore.walkComponents;
  $: currentIndex = $inspectionStore.currentIndex;
  $: inspections  = $inspectionStore.inspections;
  $: currentFloor = $inspectionStore.currentFloor;
  $: floorProgress = $inspectionStore.floorProgress;
  $: buildingFloors = $inspectionStore.buildingFloors;
  $: types        = $inspectionStore.types;
  $: floors       = $inspectionStore.floors;
  $: plans        = $inspectionStore.plans;

  $: currentComponent  = components[currentIndex];
  $: currentType       = currentComponent ? types.find(t => t.code === currentComponent.type_code) : null;
  $: currentInspection = currentComponent ? (inspections[currentComponent.id] ?? null) : null;
  // Canonical portal ref — "{floor}/{typeInitial}/{assetId}", the same string
  // component_links stores and the Building Assets tables show.
  $: componentRef = currentComponent ? buildComponentRef(currentComponent, floors, types) : '?';

  // The "was" side of the status line. Until this session inspects a component
  // its live status IS the truth; once it has, components.status holds the NEW
  // result, so the prior value comes from the store (captured at record time, or
  // rebuilt from inspection history on resume). Null renders as "–" — the prior
  // status is genuinely unknown, which beats asserting a wrong one.
  $: statusBefore = $inspectionStore.statusBefore;
  $: priorStatus  = !currentComponent
    ? null
    : (currentInspection ? (statusBefore[currentComponent.id] ?? null) : currentComponent.status);
  // Plan for the component-plan view — only set when component is placed on a plan
  $: currentPlan = currentComponent?.plan_id
    ? (plans.find(p => p.id === currentComponent.plan_id) ?? null)
    : null;

  $: isFirst    = inspectionStore.isAtStartOfBuilding()
    ? true
    : (session?.session_scope !== 'building' && currentIndex === 0);
  $: isLast     = inspectionStore.isAtEndOfBuilding()
    ? true
    : (session?.session_scope !== 'building' && currentIndex >= components.length - 1);
  $: isRepair   = session?.session_type === 'repair';
  $: isBuilding = session?.session_scope === 'building';

  $: progress       = components.length > 0 ? (currentIndex + 1) / components.length : 0;
  $: inspectedCount = Object.keys(inspections).length;

  // Stats from current session inspections object
  $: inspVals = Object.values(inspections);
  $: statsOk       = inspVals.filter(i => i.inspection_result === 'ok').length;
  $: statsFailed   = inspVals.filter(i => i.inspection_result === 'failed').length;
  $: statsProblem  = inspVals.filter(i => i.inspection_result === 'problem').length;
  $: statsInactive = inspVals.filter(i => i.inspection_result === 'inactive').length;

  // For building-wide sessions: per-floor progress counter
  $: currentFloorProgress = (isBuilding && currentFloor)
    ? floorProgress[currentFloor.id]
    : null;
  $: currentFloorIndex = isBuilding
    ? buildingFloors.findIndex(f => f.id === currentFloor?.id) + 1
    : 1;

  // Session header label
  $: headerLabel = session?.session_name
    ? session.session_name
    : sessionFloorLabel(session ?? {}, floors);

  // Preset display
  $: preset = presetLabel(session?.session_preset ?? '');

  // Total for stats bars
  $: totalComponents = session?.total_components_count ?? components.length;

  // Result colour class for the current component card
  function resultCls(r) {
    return { ok: 'r-ok', failed: 'r-fail', problem: 'r-problem', inactive: 'r-inactive' }[r] ?? '';
  }
  function statusCls(s) {
    return { ok: 'st-ok', failed: 'st-fail', problem: 'st-problem', inactive: 'st-inactive' }[s] ?? 'st-inactive';
  }

  // -- Per-floor walk direction (building-wide walks) ---------------------
  // Walk order is defined left-to-right, so a floor is naturally walked in the
  // opposite direction to the one below it. On arriving at a floor the walk
  // pauses and asks which way this floor runs; REVERSE flips the floor's list so
  // the walk starts at the highest walk-order component. Asked on every arrival,
  // including the first floor and when stepping back with PREV.
  let reversedFloor = false;
  let lastFloorId   = null;
  $: {
    const fid = currentFloor?.id ?? null;
    if (fid !== lastFloorId) {
      lastFloorId   = fid;
      reversedFloor = false;
      // Nothing to choose on a single-component floor — don't interrupt.
      if (isBuilding && !isRepair && fid && components.length > 1) view = 'floordir';
    }
  }
  function chooseFloorOrder(reverse) {
    if (reverse) {
      inspectionStore.reverseFloorOrder();
      reversedFloor = true;
    }
    view = 'card';
  }

  function handlePrev() { view = 'card'; inspectionStore.goPrev(); }
  function handleNext() { view = 'card'; inspectionStore.goNext(); }
  function handleJumpTo(e) { view = 'card'; inspectionStore.goToIndex(e.detail.index); }
  function handleEditSaved() { view = 'card'; }

  function handleInspectionSaved() {
    if (isRepair) {
      dispatch('backtorepair');
    } else {
      view = 'card';
    }
  }

  async function handlePause() {
    try { await inspectionStore.pauseSession(); } catch (err) { logger('Pause:', err.message); }
    dispatch('paused');
  }

  async function handleCloseSession() {
    closing = true; closeError = null;
    try {
      await inspectionStore.completeSession(session.id, closeNotes);
      dispatch('closed');
    } catch (err) {
      logger('Close failed:', err.message);
      closeError = err.message;
    } finally { closing = false; }
  }
</script>

<div class="ws">

  <!-- -- Session bar (hidden on the focused inspect/edit sub-views) --------- -->
  {#if !focusedView}
  <div class="sbar">
    <div class="sbar-l">
      <div class="sbar-name">{headerLabel}</div>
      <div class="sbar-meta">
        {preset}
        {#if session?.emergency_only}
          <WalkBadge color="orange">Emergency</WalkBadge>
        {/if}
        {#if isBuilding && currentFloor}
          <span class="floor-pill">Floor {currentFloor.short_name}</span>
        {/if}
        {#if reversedFloor}
          <span class="rev-pill" title="This floor is being walked in reverse walk order — highest first">R</span>
        {/if}
      </div>
    </div>
    <div class="sbar-r">
      {#if isBuilding && buildingFloors.length > 0}
        <!-- &nbsp; not a plain space: Svelte trims leading whitespace inside the span -->
        <div class="sbar-floors">{currentFloorIndex}/{buildingFloors.length}<span class="floors-word">&nbsp;floors</span></div>
      {/if}
      <div class="sbar-count">{currentIndex + 1}/{components.length}</div>
      {#if isRepair}
        <button class="ctrl-btn" on:click={() => dispatch('backtorepair')}>← LIST</button>
      {:else if session?.session_type === 'inspection'}
        <button class="ctrl-btn" on:click={handlePause}>PAUSE</button>
        <button class="finish-btn" on:click={() => view = 'close'}>FINISH</button>
      {:else}
        <button class="ctrl-btn" on:click={handlePause}>PAUSE</button>
        <button class="finish-btn" on:click={() => view = 'close'}>FINISH</button>
      {/if}
    </div>
  </div>
  {/if}

  <!-- Progress bar (hidden for repair sessions and focused sub-views) -->
  {#if !isRepair && !focusedView}
    <div class="prog-track"><div class="prog-fill" style="width:{progress*100}%"></div></div>
  {/if}

  <!-- -- Stats bars -------------------------------------------------------- -->
  {#if !isRepair && view === 'card'}
    <WalkStatsBars
      compact
      total={totalComponents}
      inspected={inspectedCount}
      passCount={statsOk}
      failCount={statsFailed}
      problemCount={statsProblem}
      inactiveCount={statsInactive}
    />
  {/if}

  <!-- -- View router -------------------------------------------------------- -->

  {#if view === 'inspect' && currentComponent}
    <InspectionPanel
      component={currentComponent}
      floor={currentFloor}
      type={currentType}
      session={session}
      on:saved={handleInspectionSaved}
      on:cancel={() => view = 'card'}
    />

  {:else if view === 'edit' && currentComponent}
    <InspectionComponentEditor
      component={currentComponent}
      on:saved={handleEditSaved}
      on:cancel={() => view = 'card'}
    />

  {:else if view === 'jump'}
    <InspectionJumpList
      {components}
      {currentIndex}
      {inspections}
      {floors}
      {types}
      on:jump={handleJumpTo}
      on:close={() => view = 'card'}
    />

  {:else if view === 'component-plan' && currentComponent && currentPlan}
    <InspectionComponentPlanViewer
      component={currentComponent}
      plan={currentPlan}
      floor={currentFloor}
      on:close={() => view = 'card'}
    />

  {:else if view === 'close'}
    <div class="close-sheet">
      <div class="close-hdr">
        <WalkButton variant="ghost" size="sm" on:click={() => view = 'card'}>← Back</WalkButton>
        <span class="close-title">FINISH SESSION</span>
      </div>
      <div class="close-body">
        <WalkStatsBars
          total={totalComponents}
          inspected={inspectedCount}
          passCount={statsOk}
          failCount={statsFailed}
          problemCount={statsProblem}
          inactiveCount={statsInactive}
        />
        <div class="close-sec">
          <div class="close-sec-lbl">CLOSING NOTES (optional)</div>
          <WalkTextarea bind:value={closeNotes} placeholder="Any final notes for this session…" rows={4} />
        </div>
        <WalkError message={closeError || ''} />
        <WalkButton variant="success" size="full" loading={closing} on:click={handleCloseSession}>
          {closing ? 'CLOSING…' : 'CONFIRM FINISH ✓'}
        </WalkButton>
      </div>
    </div>

  {:else if view === 'floordir' && currentFloor}
    <!-- -- Floor arrival: which direction is this floor walked? ----------- -->
    <div class="fd-sheet">
      <div class="fd-hdr"><span class="fd-title">WALK DIRECTION</span></div>
      <div class="fd-body">
        <div class="fd-floor">FLOOR {currentFloor.short_name}</div>
        <div class="fd-ask">Which way are you walking this floor?</div>
        <button class="fd-opt" on:click={() => chooseFloorOrder(false)}>
          <span class="fd-opt-lbl">NORMAL</span>
          <span class="fd-opt-sub">Walk order low → high · start at {components[0]?.asset_id ?? '?'}</span>
        </button>
        <button class="fd-opt fd-opt-rev" on:click={() => chooseFloorOrder(true)}>
          <span class="fd-opt-lbl">⇅ REVERSE</span>
          <span class="fd-opt-sub">Walk order high → low · start at {components[components.length - 1]?.asset_id ?? '?'}</span>
        </button>
      </div>
    </div>

  {:else if view === 'card'}
    <!-- -- Component card ------------------------------------------------- -->
    {#if currentComponent}
      <div class="ccard" class:ccard-repair={isRepair}>

        <!-- Component identity: canonical ref, then type and label. The 📍 sits
             here (not in the nav row) because it shows THIS component's position
             on the floor plan — it belongs to the component, not to navigation. -->
        <div class="cid">
          <div class="cid-info">
            <div class="cref">{componentRef}</div>
            <div class="cmeta">
              {#if currentType}<span class="ctype-name">{currentType.name}</span>{/if}
              {#if currentComponent.label}<span class="clabel">{currentComponent.label}</span>{/if}
            </div>
          </div>
          <button class="plan-btn" on:click={() => view = 'component-plan'}
            disabled={!currentPlan}
            title={currentPlan ? 'Show on floor plan' : 'Component not placed on a plan'}>
            📍
          </button>
        </div>

        <!-- Status: what it was on arrival → what this session set it to -->
        <div class="cstat">
          <span class="cstat-k">STATUS</span>
          <span class="cpill {statusCls(priorStatus)}">{priorStatus?.toUpperCase() ?? '–'}</span>
          <span class="cstat-arr">→</span>
          {#if currentInspection}
            <span class="cpill {statusCls(currentInspection.inspection_result)}">
              {currentInspection.inspection_result?.toUpperCase()}
            </span>
          {:else}
            <span class="cpill cpill-na">N/A</span>
          {/if}
        </div>
        {#if currentInspection?.inspector_notes}
          <div class="cnotes">{currentInspection.inspector_notes}</div>
        {/if}

        <!-- Actions on this component -->
        <div class="act-row">
          {#if canEdit}
            <WalkButton variant="secondary" size="lg" on:click={() => view = 'edit'}>✎ EDIT</WalkButton>
          {/if}
          <WalkButton variant="primary" size="full" on:click={() => view = 'inspect'}>
            {currentInspection ? '✎ RE-INSPECT' : '✓ INSPECT'}
          </WalkButton>
        </div>

        <!-- Walk position: step, or jump to any component -->
        <div class="nav-row">
          <button class="nav-btn" on:click={handlePrev} disabled={currentIndex === 0 && inspectionStore.isAtStartOfBuilding()}>
            ‹ PREV
          </button>
          <button class="nav-btn" on:click={() => view = 'jump'}>☰ JUMP</button>
          <button class="nav-btn" on:click={handleNext}
            disabled={inspectionStore.isAtEndOfBuilding() || (!isBuilding && currentIndex >= components.length - 1)}>
            NEXT ›
          </button>
        </div>

      </div>

      <!-- Building-wide floor strip: progress AND navigation — tap a floor to
           jump there. The floor-change watcher then asks the walk direction,
           same as arriving by NEXT/PREV. Floors with nothing in scope are
           disabled rather than hidden, so the building shape stays visible. -->
      {#if isBuilding && currentFloor && buildingFloors.length > 0}
        <div class="floor-strip">
          {#each buildingFloors as fl}
            {@const fp = floorProgress[fl.id] ?? { inspected: 0, total: 0 }}
            <button class="fl-cell" class:fl-active={fl.id === currentFloor.id}
              disabled={fp.total === 0}
              on:click={() => { view = 'card'; inspectionStore.goToFloor(fl.id); }}>
              <div class="fl-name">{fl.short_name}</div>
              <div class="fl-prog">{fp.inspected}/{fp.total}</div>
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="empty-state">
        <div class="empty-icon">◫</div>
        <div>No components in this walk scope</div>
      </div>
    {/if}
  {/if}

</div>

<style>
  .ws { display:flex; flex-direction:column; min-height:calc(100vh - 64px); background:#0d0d14; color:#f0f0f0; font-family:'DM Mono','Courier New',monospace; }

  /* -- Session bar ----------------------------------------------------------- */
  .sbar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; padding:0.75rem 1rem; background:#111122; border-bottom:1px solid #2e2e42; gap:0.5rem; min-height:56px; }
  .sbar-l { flex:1; min-width:0; }
  .sbar-name { font-size:0.82rem; font-weight:700; color:#f0f0f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sbar-meta { display:flex; align-items:center; gap:0.5rem; margin-top:0.15rem; font-size:0.68rem; color:#aaa; }
  .floor-pill { background:#1a1a30; color:#93c5fd; padding:0.1rem 0.4rem; border-radius:4px; font-size:0.62rem; font-weight:700; border:1px solid #334155; white-space:nowrap; }
  .rev-pill   { background:#1a0e00; color:#fb923c; padding:0.1rem 0.4rem; border-radius:4px; font-size:0.62rem; font-weight:800; border:1px solid #fb923c; white-space:nowrap; }
  .sbar-r { display:flex; align-items:center; gap:0.5rem; flex-shrink:0; margin-left:auto; }
  .sbar-floors { font-size:0.65rem; color:#888; }
  .sbar-count { font-size:0.78rem; font-weight:700; color:#ccc; }
  .ctrl-btn { background:none; border:1px solid #3e3e58; border-radius:5px; color:#ccc; font-family:inherit; font-size:0.65rem; font-weight:700; letter-spacing:0.08em; padding:0.35rem 0.65rem; cursor:pointer; }
  .ctrl-btn:hover { border-color:#fb923c; color:#fb923c; }
  .finish-btn { background:#166534; border:none; border-radius:5px; color:#4ade80; font-family:inherit; font-size:0.65rem; font-weight:800; letter-spacing:0.08em; padding:0.35rem 0.65rem; cursor:pointer; }
  .finish-btn:hover { background:#15803d; }

  /* -- Progress bar ---------------------------------------------------------- */
  .prog-track { height:3px; background:#1a1a2e; }
  .prog-fill  { height:100%; background:#fb923c; transition:width 0.3s; }

  /* -- Component card -------------------------------------------------------- */
  .ccard { display:flex; flex-direction:column; gap:0; }
  .ccard-repair { background:#0d0a00; }

  .cid { display:flex; align-items:center; gap:0.875rem; padding:1rem; }
  .cid-info { flex:1; min-width:0; }
  .cref   { font-size:1.25rem; font-weight:700; color:#f0f0f0; font-variant-numeric:tabular-nums; letter-spacing:0.02em; }
  .cmeta  { display:flex; align-items:baseline; gap:0.5rem; margin-top:0.15rem; min-width:0; }
  .ctype-name { font-size:0.72rem; color:#888; flex-shrink:0; }
  .clabel { font-size:0.72rem; color:#fb923c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* -- Status: was → now ----------------------------------------------------- */
  .cstat { display:flex; align-items:center; gap:0.5rem; padding:0.625rem 1rem; background:#0a0a18; border-top:1px solid #1a1a2e; border-bottom:1px solid #1a1a2e; }
  .cstat-k   { font-size:0.5rem; letter-spacing:0.15em; color:#666; font-weight:700; }
  .cstat-arr { font-size:0.8rem; color:#666; }
  .cnotes { padding:0.5rem 1rem; font-size:0.72rem; color:#ccc; font-style:italic; border-bottom:1px solid #1a1a2e; }

  .cpill { font-size:0.62rem; font-weight:700; letter-spacing:0.1em; padding:0.2rem 0.5rem; border-radius:4px; border:1px solid; flex-shrink:0; }
  .cpill-na    { color:#555;    border-color:#2e2e42; background:#111122; }
  .st-ok       { color:#4ade80; border-color:#166534; background:#0a1f0a; }
  .st-fail     { color:#f87171; border-color:#7f1d1d; background:#1f0a0a; }
  .st-problem  { color:#fbbf24; border-color:#713f12; background:#1a1200; }
  .st-inactive { color:#888;    border-color:#3e3e58; background:#1a1a2e; }

  /* -- Navigation ------------------------------------------------------------ */
  .nav-row { display:flex; align-items:center; padding:0.875rem 1rem; gap:0.5rem; border-bottom:1px solid #1a1a2e; }
  .nav-btn { flex:1; padding:0.875rem; background:#111122; border:1px solid #2e2e42; border-radius:8px; color:#f0f0f0; font-family:inherit; font-size:0.8rem; font-weight:700; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
  .nav-btn:hover:not(:disabled) { border-color:#fb923c; color:#fb923c; }
  .nav-btn:disabled { opacity:0.3; cursor:not-allowed; }
  .plan-btn { padding:0.875rem 0.875rem; background:#111122; border:1px solid #2e2e42; border-radius:8px; color:#aaa; font-family:inherit; font-size:0.78rem; cursor:pointer; transition:all 0.15s; white-space:nowrap; flex-shrink:0; }
  .plan-btn:hover:not(:disabled) { border-color:#fb923c; color:#fb923c; }
  .plan-btn:disabled { opacity:0.3; cursor:not-allowed; }

  /* -- Action buttons -------------------------------------------------------- */
  .act-row { display:flex; gap:0.75rem; padding:1rem; }

  /* -- Floor-direction prompt ------------------------------------------------ */
  .fd-sheet { display:flex; flex-direction:column; flex:1; }
  .fd-hdr   { display:flex; align-items:center; padding:1rem 1.25rem; background:#111122; border-bottom:1px solid #2e2e42; }
  .fd-title { font-size:0.65rem; letter-spacing:0.25em; color:#fb923c; flex:1; text-align:center; }
  .fd-body  { display:flex; flex-direction:column; gap:1rem; padding:1.5rem; flex:1; }
  .fd-floor { font-size:1.5rem; font-weight:700; color:#f0f0f0; text-align:center; }
  .fd-ask   { font-size:0.78rem; color:#888; text-align:center; margin-bottom:0.5rem; }
  .fd-opt   { display:flex; flex-direction:column; align-items:flex-start; gap:0.3rem; min-height:64px; padding:1rem; background:#111122; border:1px solid #2e2e42; border-radius:8px; font-family:inherit; text-align:left; cursor:pointer; transition:all 0.15s; }
  .fd-opt:hover { border-color:#fb923c; }
  .fd-opt-lbl { font-size:0.9rem; font-weight:700; letter-spacing:0.06em; color:#f0f0f0; }
  .fd-opt-sub { font-size:0.68rem; color:#888; }
  .fd-opt:hover .fd-opt-lbl { color:#fb923c; }
  .fd-opt-rev { background:#100a00; }

  /* -- Building floor strip -------------------------------------------------- */
  .floor-strip { display:flex; gap:0; border-top:2px solid #2e2e42; background:#0a0a18; overflow-x:auto; }
  .fl-cell { flex:1; min-width:3.5rem; min-height:44px; display:flex; flex-direction:column; align-items:center; padding:0.5rem 0.25rem; background:none; border:none; border-right:1px solid #1a1a2e; font-family:inherit; cursor:pointer; }
  .fl-cell:last-child { border-right:none; }
  .fl-cell:disabled { opacity:0.35; cursor:default; }
  .fl-cell:hover:not(:disabled):not(.fl-active) .fl-name { color:#fb923c; }
  .fl-active { background:#1a0e00; border-top:2px solid #fb923c; }
  .fl-name { font-size:0.65rem; font-weight:700; color:#ccc; }
  .fl-prog { font-size:0.6rem; color:#888; margin-top:0.2rem; }
  .fl-active .fl-name { color:#fb923c; }

  /* -- Close sheet ----------------------------------------------------------- */
  .close-sheet { display:flex; flex-direction:column; flex:1; }
  .close-hdr { display:flex; align-items:center; gap:1rem; padding:1rem 1.25rem; background:#111122; border-bottom:1px solid #2e2e42; }
  .close-title { font-size:0.65rem; letter-spacing:0.25em; color:#fb923c; flex:1; text-align:center; }
  .close-body { display:flex; flex-direction:column; gap:1.5rem; padding:1.5rem; flex:1; }
  .close-sec { display:flex; flex-direction:column; gap:0.5rem; }
  .close-sec-lbl { font-size:0.62rem; letter-spacing:0.2em; color:#fb923c; font-weight:700; }

  /* -- Empty state ----------------------------------------------------------- */
  .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; gap:1rem; color:#555; font-size:0.85rem; padding:4rem 2rem; }
  .empty-icon  { font-size:3rem; color:#2e2e42; }

  /* Result colour helpers */
  .r-ok       { color:#4ade80; }
  .r-fail     { color:#f87171; }
  .r-problem  { color:#fb923c; }
  .r-inactive { color:#888; }

  /* -- Narrow phones (≤430px) ------------------------------------------------
     The app column is max-width:480px, so this only ever fires on real phones
     (375–412 logical px) — the desktop layout never matches it.
     Two rows must compress rather than break:
       session bar — stacks: name+meta on line 1, counts+PAUSE/FINISH on line 2
       (sbar-l goes full-width; sbar's flex-wrap + sbar-r's margin-left:auto do
       the rest). Fixes the truncated name and the pill colliding with counts.
       nav row — its min-content (~460px) exceeds the viewport, which is what
       wrapped PREV/NEXT internally and clipped NEXT off-screen. Tighter padding
       + smaller font bring it to ~340px; min-height keeps the 44px targets. */
  @media (max-width: 430px) {
    .sbar-l { flex:1 1 100%; }
    .floors-word { display:none; }
    .sbar-r { gap:0.4rem; }
    .nav-row { padding:0.75rem 0.5rem; gap:0.35rem; }
    .nav-btn { padding:0.75rem 0.4rem; font-size:0.72rem; min-height:44px; }
    .plan-btn { padding:0.75rem 0.5rem; font-size:0.7rem; min-height:44px; }
  }
</style>
