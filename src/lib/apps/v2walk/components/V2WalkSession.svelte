<!-- src/lib/apps/v2walk/components/V2WalkSession.svelte -->
<!-- Core v2 walk screen: navigate components, record inspections, edit, jump, close -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger }    from '$lib/utils/logger';
  import { v2walkStore }  from '../stores/v2walkStore.js';
  import { resultLabel, presetLabel, sessionFloorLabel } from '../utils/v2walkHelpers.js';
  import V2WalkInspectionPanel       from './V2WalkInspectionPanel.svelte';
  import V2WalkComponentEditor       from './V2WalkComponentEditor.svelte';
  import V2WalkJumpList              from './V2WalkJumpList.svelte';
  import V2WalkPlanViewer            from './V2WalkPlanViewer.svelte';
  import V2WalkComponentPlanViewer   from './V2WalkComponentPlanViewer.svelte';
  import WalkStatsBars from '$lib/apps/walk/components/WalkStatsBars.svelte';
  import WalkBadge     from '$lib/apps/walk/components/common/WalkBadge.svelte';
  import WalkTextarea  from '$lib/apps/walk/components/common/WalkTextarea.svelte';
  import WalkButton    from '$lib/apps/walk/components/common/WalkButton.svelte';
  import WalkError     from '$lib/apps/walk/components/common/WalkError.svelte';

  const logger   = getLogger('V2WalkSession');
  const dispatch = createEventDispatcher();

  export let canEdit = false;

  // View states: 'card' | 'inspect' | 'edit' | 'jump' | 'close' | 'plan' | 'component-plan'
  let view       = 'card';
  let closeNotes = '';
  let closing    = false;
  let closeError = null;

  $: session      = $v2walkStore.activeSession;
  $: components   = $v2walkStore.walkComponents;
  $: currentIndex = $v2walkStore.currentIndex;
  $: inspections  = $v2walkStore.inspections;
  $: currentFloor = $v2walkStore.currentFloor;
  $: floorProgress = $v2walkStore.floorProgress;
  $: buildingFloors = $v2walkStore.buildingFloors;
  $: types        = $v2walkStore.types;
  $: floors       = $v2walkStore.floors;
  $: plans        = $v2walkStore.plans;

  $: currentComponent  = components[currentIndex];
  $: currentType       = currentComponent ? types.find(t => t.code === currentComponent.type_code) : null;
  $: currentInspection = currentComponent ? (inspections[currentComponent.id] ?? null) : null;
  // Plan for the component-plan view — only set when component is placed on a plan
  $: currentPlan = currentComponent?.plan_id
    ? (plans.find(p => p.id === currentComponent.plan_id) ?? null)
    : null;

  $: isFirst    = v2walkStore.isAtStartOfBuilding()
    ? true
    : (session?.session_scope !== 'building' && currentIndex === 0);
  $: isLast     = v2walkStore.isAtEndOfBuilding()
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

  function handlePrev() { view = 'card'; v2walkStore.goPrev(); }
  function handleNext() { view = 'card'; v2walkStore.goNext(); }
  function handleJumpTo(e) { view = 'card'; v2walkStore.goToIndex(e.detail.index); }
  function handleEditSaved() { view = 'card'; }

  function handleInspectionSaved() {
    if (isRepair) {
      dispatch('backtorepair');
    } else {
      view = 'card';
    }
  }

  async function handlePause() {
    try { await v2walkStore.pauseSession(); } catch (err) { logger('Pause:', err.message); }
    dispatch('paused');
  }

  async function handleCloseSession() {
    closing = true; closeError = null;
    try {
      await v2walkStore.completeSession(session.id, closeNotes);
      dispatch('closed');
    } catch (err) {
      logger('Close failed:', err.message);
      closeError = err.message;
    } finally { closing = false; }
  }
</script>

<div class="ws">

  <!-- ── Session bar ──────────────────────────────────────────────────────── -->
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
      </div>
    </div>
    <div class="sbar-r">
      {#if isBuilding && buildingFloors.length > 0}
        <div class="sbar-floors">{currentFloorIndex}/{buildingFloors.length} floors</div>
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

  <!-- Progress bar (hidden for repair sessions) -->
  {#if !isRepair}
    <div class="prog-track"><div class="prog-fill" style="width:{progress*100}%"></div></div>
  {/if}

  <!-- ── Stats bars ──────────────────────────────────────────────────────── -->
  {#if !isRepair && view === 'card'}
    <WalkStatsBars
      total={totalComponents}
      inspected={inspectedCount}
      passCount={statsOk}
      failCount={statsFailed}
      problemCount={statsProblem}
      inactiveCount={statsInactive}
    />
  {/if}

  <!-- ── View router ──────────────────────────────────────────────────────── -->

  {#if view === 'inspect' && currentComponent}
    <V2WalkInspectionPanel
      component={currentComponent}
      floor={currentFloor}
      type={currentType}
      session={session}
      on:saved={handleInspectionSaved}
      on:cancel={() => view = 'card'}
    />

  {:else if view === 'edit' && currentComponent}
    <V2WalkComponentEditor
      component={currentComponent}
      floor={currentFloor}
      on:saved={handleEditSaved}
      on:cancel={() => view = 'card'}
    />

  {:else if view === 'jump'}
    <V2WalkJumpList
      {components}
      {currentIndex}
      {inspections}
      floor={currentFloor}
      {types}
      on:jump={handleJumpTo}
      on:close={() => view = 'card'}
    />

  {:else if view === 'plan'}
    <V2WalkPlanViewer
      {components}
      {currentIndex}
      {inspections}
      floor={currentFloor}
      {types}
      on:select={handleJumpTo}
      on:close={() => view = 'card'}
    />

  {:else if view === 'component-plan' && currentComponent && currentPlan}
    <V2WalkComponentPlanViewer
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

  {:else if view === 'card'}
    <!-- ── Component card ───────────────────────────────────────────────── -->
    {#if currentComponent}
      <div class="ccard" class:ccard-repair={isRepair}>

        <!-- Component identity -->
        <div class="cid">
          <div class="cid-top">
            {#if currentType}
              <div class="ctype-dot" style="background:#{currentType.colour}">{currentType.initial}</div>
            {:else}
              <div class="ctype-dot">?</div>
            {/if}
            <div class="cid-info">
              <div class="cref">{currentFloor?.short_name ?? '?'} / {currentComponent.asset_id ?? '?'}</div>
              {#if currentComponent.label}
                <div class="clabel">{currentComponent.label}</div>
              {/if}
            </div>
            <div class="cstatus-pill {statusCls(currentComponent.status)}">
              {currentComponent.status?.toUpperCase() ?? '–'}
            </div>
          </div>
          {#if currentType}
            <div class="ctype-name">{currentType.name}</div>
          {/if}
        </div>

        <!-- Last inspection result for this session (if any) -->
        {#if currentInspection}
          <div class="cinsp cinsp-{currentInspection.inspection_result}">
            <span class="cinsp-label">{resultLabel(currentInspection.inspection_result)}</span>
            {#if currentInspection.inspector_notes}
              <span class="cinsp-notes">{currentInspection.inspector_notes}</span>
            {/if}
          </div>
        {:else}
          <div class="cinsp-none">Not yet inspected</div>
        {/if}

        <!-- Navigation row -->
        <div class="nav-row">
          <button class="nav-btn" on:click={handlePrev} disabled={currentIndex === 0 && v2walkStore.isAtStartOfBuilding()}>
            ‹ PREV
          </button>
          <div class="nav-ctr">
            <button class="jump-btn" on:click={() => view = 'jump'}>☰ LIST</button>
            <button class="map-btn"  on:click={() => view = 'plan'}>⊞ STATUS</button>
            <button class="plan-btn" on:click={() => view = 'component-plan'}
              disabled={!currentPlan}
              title={currentPlan ? 'Show on floor plan' : 'Component not placed on a plan'}>
              📍
            </button>
          </div>
          <button class="nav-btn" on:click={handleNext}
            disabled={v2walkStore.isAtEndOfBuilding() || (!isBuilding && currentIndex >= components.length - 1)}>
            NEXT ›
          </button>
        </div>

        <!-- Action buttons -->
        <div class="act-row">
          {#if canEdit}
            <WalkButton variant="secondary" size="sm" on:click={() => view = 'edit'}>✎ EDIT</WalkButton>
          {/if}
          <WalkButton variant="primary" size="full" on:click={() => view = 'inspect'}>
            {currentInspection ? '✎ RE-INSPECT' : '✓ INSPECT'}
          </WalkButton>
        </div>

      </div>

      <!-- Building-wide floor progress strip -->
      {#if isBuilding && currentFloor && buildingFloors.length > 0}
        <div class="floor-strip">
          {#each buildingFloors as fl}
            {@const fp = floorProgress[fl.id] ?? { inspected: 0, total: 0 }}
            <div class="fl-cell" class:fl-active={fl.id === currentFloor.id}>
              <div class="fl-name">{fl.short_name}</div>
              <div class="fl-prog">{fp.inspected}/{fp.total}</div>
            </div>
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

  /* ── Session bar ─────────────────────────────────────────────────────────── */
  .sbar { display:flex; align-items:center; justify-content:space-between; padding:0.75rem 1rem; background:#111122; border-bottom:1px solid #2e2e42; gap:0.5rem; min-height:56px; }
  .sbar-l { flex:1; min-width:0; }
  .sbar-name { font-size:0.82rem; font-weight:700; color:#f0f0f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sbar-meta { display:flex; align-items:center; gap:0.5rem; margin-top:0.15rem; font-size:0.68rem; color:#aaa; }
  .floor-pill { background:#1a1a30; color:#93c5fd; padding:0.1rem 0.4rem; border-radius:4px; font-size:0.62rem; font-weight:700; border:1px solid #334155; }
  .sbar-r { display:flex; align-items:center; gap:0.5rem; flex-shrink:0; }
  .sbar-floors { font-size:0.65rem; color:#888; }
  .sbar-count { font-size:0.78rem; font-weight:700; color:#ccc; }
  .ctrl-btn { background:none; border:1px solid #3e3e58; border-radius:5px; color:#ccc; font-family:inherit; font-size:0.65rem; font-weight:700; letter-spacing:0.08em; padding:0.35rem 0.65rem; cursor:pointer; }
  .ctrl-btn:hover { border-color:#fb923c; color:#fb923c; }
  .finish-btn { background:#166534; border:none; border-radius:5px; color:#4ade80; font-family:inherit; font-size:0.65rem; font-weight:800; letter-spacing:0.08em; padding:0.35rem 0.65rem; cursor:pointer; }
  .finish-btn:hover { background:#15803d; }

  /* ── Progress bar ────────────────────────────────────────────────────────── */
  .prog-track { height:3px; background:#1a1a2e; }
  .prog-fill  { height:100%; background:#fb923c; transition:width 0.3s; }

  /* ── Component card ──────────────────────────────────────────────────────── */
  .ccard { display:flex; flex-direction:column; gap:0; }
  .ccard-repair { background:#0d0a00; }

  .cid { padding:1.25rem 1rem 1rem; border-bottom:1px solid #1a1a2e; }
  .cid-top { display:flex; align-items:center; gap:0.875rem; }
  .ctype-dot { width:2.5rem; height:2.5rem; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:700; color:#fff; flex-shrink:0; background:#444; }
  .cid-info { flex:1; min-width:0; }
  .cref   { font-size:1.1rem; font-weight:700; color:#f0f0f0; font-variant-numeric:tabular-nums; }
  .clabel { font-size:0.72rem; color:#fb923c; margin-top:0.1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ctype-name { font-size:0.72rem; color:#888; margin-top:0.5rem; }

  .cstatus-pill { font-size:0.58rem; font-weight:700; letter-spacing:0.1em; padding:0.2rem 0.5rem; border-radius:4px; border:1px solid; flex-shrink:0; }
  .st-ok       { color:#4ade80; border-color:#166534; background:#0a1f0a; }
  .st-fail     { color:#f87171; border-color:#7f1d1d; background:#1f0a0a; }
  .st-problem  { color:#fbbf24; border-color:#713f12; background:#1a1200; }
  .st-inactive { color:#888;    border-color:#3e3e58; background:#1a1a2e; }

  /* ── Inspection result badge ─────────────────────────────────────────────── */
  .cinsp { display:flex; align-items:baseline; gap:0.75rem; padding:0.875rem 1rem; border-left:3px solid; }
  .cinsp-ok       { border-color:#22c55e; background:#071207; }
  .cinsp-failed   { border-color:#ef4444; background:#120707; }
  .cinsp-problem  { border-color:#fb923c; background:#100a00; }
  .cinsp-inactive { border-color:#4b5563; background:#111122; }
  .cinsp-label { font-size:0.8rem; font-weight:700; }
  .cinsp-ok     .cinsp-label { color:#4ade80; }
  .cinsp-failed .cinsp-label { color:#f87171; }
  .cinsp-problem .cinsp-label { color:#fb923c; }
  .cinsp-inactive .cinsp-label { color:#888; }
  .cinsp-notes { font-size:0.72rem; color:#ccc; font-style:italic; flex:1; }
  .cinsp-none { padding:0.875rem 1rem; font-size:0.78rem; color:#555; font-style:italic; }

  /* ── Navigation ──────────────────────────────────────────────────────────── */
  .nav-row { display:flex; align-items:center; padding:0.875rem 1rem; gap:0.5rem; border-bottom:1px solid #1a1a2e; }
  .nav-btn { flex:1; padding:0.875rem; background:#111122; border:1px solid #2e2e42; border-radius:8px; color:#f0f0f0; font-family:inherit; font-size:0.8rem; font-weight:700; cursor:pointer; transition:all 0.15s; }
  .nav-btn:hover:not(:disabled) { border-color:#fb923c; color:#fb923c; }
  .nav-btn:disabled { opacity:0.3; cursor:not-allowed; }
  .nav-ctr { display:flex; gap:0.4rem; flex-shrink:0; }
  .jump-btn, .map-btn, .plan-btn { padding:0.875rem 0.875rem; background:#111122; border:1px solid #2e2e42; border-radius:8px; color:#aaa; font-family:inherit; font-size:0.78rem; cursor:pointer; transition:all 0.15s; }
  .jump-btn:hover, .map-btn:hover, .plan-btn:hover:not(:disabled) { border-color:#fb923c; color:#fb923c; }
  .plan-btn:disabled { opacity:0.3; cursor:not-allowed; }

  /* ── Action buttons ──────────────────────────────────────────────────────── */
  .act-row { display:flex; gap:0.75rem; padding:1rem; }

  /* ── Building floor strip ────────────────────────────────────────────────── */
  .floor-strip { display:flex; gap:0; border-top:2px solid #2e2e42; background:#0a0a18; overflow-x:auto; }
  .fl-cell { flex:1; min-width:3.5rem; display:flex; flex-direction:column; align-items:center; padding:0.5rem 0.25rem; border-right:1px solid #1a1a2e; }
  .fl-cell:last-child { border-right:none; }
  .fl-active { background:#1a0e00; border-top:2px solid #fb923c; }
  .fl-name { font-size:0.65rem; font-weight:700; color:#ccc; }
  .fl-prog { font-size:0.6rem; color:#888; margin-top:0.2rem; }
  .fl-active .fl-name { color:#fb923c; }

  /* ── Close sheet ─────────────────────────────────────────────────────────── */
  .close-sheet { display:flex; flex-direction:column; flex:1; }
  .close-hdr { display:flex; align-items:center; gap:1rem; padding:1rem 1.25rem; background:#111122; border-bottom:1px solid #2e2e42; }
  .close-title { font-size:0.65rem; letter-spacing:0.25em; color:#fb923c; flex:1; text-align:center; }
  .close-body { display:flex; flex-direction:column; gap:1.5rem; padding:1.5rem; flex:1; }
  .close-sec { display:flex; flex-direction:column; gap:0.5rem; }
  .close-sec-lbl { font-size:0.62rem; letter-spacing:0.2em; color:#fb923c; font-weight:700; }

  /* ── Empty state ─────────────────────────────────────────────────────────── */
  .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; gap:1rem; color:#555; font-size:0.85rem; padding:4rem 2rem; }
  .empty-icon  { font-size:3rem; color:#2e2e42; }

  /* Result colour helpers */
  .r-ok       { color:#4ade80; }
  .r-fail     { color:#f87171; }
  .r-problem  { color:#fb923c; }
  .r-inactive { color:#888; }
</style>
