<!-- src/lib/apps/building_assets/components/PlanViewTab.svelte -->
<!-- Plan view orchestrator.
     Owns navigation, mode/sidebar state, filters and plan admin.
     Complex drag/edit logic is delegated to three JS controllers:
       componentDragController  — marker drag-to-reposition
       annotationDragController — annotation drag-to-reposition
       spaceEditController      — space drawing buffer, vertex drag, polygon move  -->
<script>
  import { buildingAssetsStore }                 from '../stores/buildingAssetsStore.js';
  import { typeByCode, checkableDefs }    from '../lookups.js';
  import { computeMetresPerUnit }         from './plan/planMeasure.js';
  import { permissions }                  from '$lib/stores/permissions';
  import { createComponentDragController }  from './plan/componentDragController.js';
  import { createAnnotationDragController } from './plan/annotationDragController.js';
  import { createSpaceEditController }      from './plan/spaceEditController.js';
  import PlanToolbar         from './plan/PlanToolbar.svelte';
  import PlanCanvas          from './plan/PlanCanvas.svelte';
  import PlanModeHints       from './plan/PlanModeHints.svelte';
  import SpaceDrawingSidebar from './plan/SpaceDrawingSidebar.svelte';
  import SpaceDetailSidebar  from './plan/SpaceDetailSidebar.svelte';
  import ScaleInputSidebar   from './plan/ScaleInputSidebar.svelte';
  import FilterSidebar       from './plan/FilterSidebar.svelte';
  import ComponentInventory  from './plan/ComponentInventory.svelte';
  import ComponentDetailPanel from './ComponentDetailPanel.svelte';
  import InspectionPanel     from './InspectionPanel.svelte';
  import QuickAddForm        from './QuickAddForm.svelte';
  import AnnotationSidebar   from './plan/AnnotationSidebar.svelte';
  import PlanAdminModal      from './plan/PlanAdminModal.svelte';

  // ── Store bindings ────────────────────────────────────────────────
  $: store          = $buildingAssetsStore;
  $: facilities     = store.facilities;
  $: floors         = store.floors;
  $: plans          = store.plans;
  $: components     = store.components;
  $: componentAttrs = store.componentAttrs;
  $: types          = store.types;
  $: systems        = store.systems;
  $: attrDefs       = store.attrDefs;
  $: attrOptions    = store.attrOptions;
  $: inspections    = store.inspections;
  $: spaces         = store.spaces;
  $: annotations    = store.annotations ?? [];

  // ── Navigation state ─────────────────────────────────────────────
  const PREF_FLOOR = 'lh_building_assets_selectedFloorId';
  const PREF_PLAN  = 'lh_building_assets_selectedPlanId';
  let selectedFloorId = '';
  let selectedPlanId  = '';

  // ── Mode / sidebar / selection state ─────────────────────────────
  // drawingMode: 'off' | 'component' | 'space' | 'scale' | 'annotation'
  // sidebarMode: 'none' | 'form' | 'detail' | 'inspect' |
  //              'space-drawing' | 'space-detail' | 'scale-input' | 'annotation-detail'
  let drawingMode       = 'off';
  let sidebarMode       = 'none';
  let selectedComponent = null;
  let selectedSpace     = null;
  let selectedAnnotation = null;
  let newPos            = null;   // { x, y } pending component position
  let saving            = false;
  let errorMsg          = '';

  // ── Filter state ─────────────────────────────────────────────────
  let hiddenTypes    = new Set();
  let hiddenStatuses = new Set();
  let searchQuery    = '';
  let showSpaces     = true;

  // ── Space drawing form state (bind: targets in SpaceDrawingSidebar) ─
  let drawingSpaceName = '';
  let drawingSpaceType = '';
  let drawingColourHex = '#a855f7';
  let drawingShowLabel = true;

  // ── Scale calibration state ───────────────────────────────────────
  let scalePoint1      = null;
  let scalePoint2      = null;
  let scaleSaving      = false;
  let imageAspectRatio = null;

  // ── Plan admin modal state ────────────────────────────────────────
  let planAdminOpen = false;
  let planAdminMode = 'new';

  // ── Canvas element (bound from PlanCanvas, used by controllers) ──
  let canvasEl = null;

  // ── Controllers ───────────────────────────────────────────────────
  const dragCtrl = createComponentDragController({
    getCanvas:  () => canvasEl,
    getPlanId:  () => selectedPlanId,
    setError:   msg => errorMsg = msg,
  });
  const { draggingId, dragPos } = dragCtrl;

  const annCtrl = createAnnotationDragController({
    getCanvas: () => canvasEl,
    setError:  msg => errorMsg = msg,
  });
  const { annotationDragPos } = annCtrl;

  const spaceCtrl = createSpaceEditController({
    getCanvas:        () => canvasEl,
    getSelectedSpace: () => selectedSpace,
    getPlanSpaces:    () => planSpaces,
    getDrawingMode:   () => drawingMode,
    setSelectedSpace: v  => selectedSpace = v,
    setError:         msg => errorMsg = msg,
  });
  const { drawingVertices, vertexEditingActive, editingPolygon } = spaceCtrl;

  // ── Derived: floor / plan views ───────────────────────────────────
  $: plansForFloor  = selectedFloorId ? plans.filter(p => p.floor_id === selectedFloorId) : [];
  $: selectedPlan   = plans.find(p => p.id === selectedPlanId) ?? null;
  $: selectedFloor  = floors.find(f => f.id === selectedFloorId) ?? null;
  $: planComponents = selectedPlanId ? components.filter(c => c.plan_id === selectedPlanId) : [];
  $: planSpaces     = selectedPlanId ? spaces.filter(s => s.plan_id === selectedPlanId) : [];

  // Substitute the live editingPolygon while vertex dragging / moving, so
  // PlanCanvas renders it immediately without waiting for a DB round-trip.
  // Capture ep once to guard against Svelte reading the store twice in a cycle.
  $: displaySpaces = (() => {
    const ep = $editingPolygon;
    if (!ep) return planSpaces;
    return planSpaces.map(s => s.id === ep.spaceId ? { ...s, polygon: ep.vertices } : s);
  })();

  // Apply annotation drag-position overrides reactively.
  $: planAnnotations = selectedPlanId
    ? annotations.filter(a => a.plan_id === selectedPlanId).map(a => {
        const ov = $annotationDragPos[a.id];
        return ov ? { ...a, x_position: ov.x, y_position: ov.y } : a;
      })
    : [];

  $: unplacedComponents = selectedFloorId
    ? components.filter(c => c.floor_id === selectedFloorId && !c.plan_id) : [];

  // ── Derived: filters ──────────────────────────────────────────────
  $: visibleComponents = planComponents.filter(c => {
    if (hiddenTypes.has(c.type_code)) return false;
    const status = (c.status || 'ok').toLowerCase();
    if (hiddenStatuses.has(status)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (!(c.label    ?? '').toLowerCase().includes(q) &&
          !(c.asset_id ?? '').toLowerCase().includes(q) &&
          !(c.notes    ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Apply component drag-position overrides reactively.
  $: positionedComponents = visibleComponents.map(c => {
    const ov = $dragPos[c.id];
    return ov ? { ...c, x_position: ov.x, y_position: ov.y } : c;
  });

  // ── Derived: inspection panel context ────────────────────────────
  $: selType           = selectedComponent ? typeByCode(types, selectedComponent.type_code) : null;
  $: selCheckable      = selectedComponent ? checkableDefs(attrDefs, types, selectedComponent.type_code) : [];
  $: selLastInspection = selectedComponent ? (inspections[selectedComponent.id] ?? null) : null;

  // ── Derived: scale ────────────────────────────────────────────────
  $: planAR        = selectedPlan?.image_aspect_ratio ?? imageAspectRatio;
  $: metresPerUnit = computeMetresPerUnit(selectedPlan?.scale_ref, planAR);

  // ── Auto-select: restore saved floor/plan preference ─────────────
  let autoSelected = false;
  $: if (!autoSelected && floors.length > 0 && plans.length > 0) {
    const savedFloor = localStorage.getItem(PREF_FLOOR);
    const savedPlan  = localStorage.getItem(PREF_PLAN);
    const floorOk    = savedFloor && floors.some(f => f.id === savedFloor) && plans.some(p => p.floor_id === savedFloor);
    if (floorOk) {
      selectedFloorId = savedFloor;
      const planOk = savedPlan && plans.some(p => p.id === savedPlan && p.floor_id === savedFloor);
      selectedPlanId = planOk ? savedPlan : (plans.find(p => p.floor_id === savedFloor)?.id ?? '');
    } else {
      const f = floors.find(fl => plans.some(p => p.floor_id === fl.id));
      if (f) { selectedFloorId = f.id; selectedPlanId = plans.find(p => p.floor_id === f.id)?.id ?? ''; }
    }
    autoSelected = true;
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function resetSelection() {
    selectedComponent  = null;
    selectedSpace      = null;
    selectedAnnotation = null;
    sidebarMode        = 'none';
    newPos             = null;
    spaceCtrl.resetVertexState();
  }

  function cancelSpaceDrawing() {
    spaceCtrl.cancelDrawing();   // resets drawingVertices store
    drawingSpaceName = '';
    drawingSpaceType = '';
    drawingColourHex = '#a855f7';
    drawingShowLabel = true;
    if (sidebarMode === 'space-drawing') sidebarMode = 'none';
  }

  function clearScaleDrawing() {
    scalePoint1 = null;
    scalePoint2 = null;
    if (sidebarMode === 'scale-input') sidebarMode = 'none';
  }

  // ── Navigation handlers ───────────────────────────────────────────
  function onFloorChange({ detail: { floorId } }) {
    selectedFloorId = floorId;
    selectedPlanId  = '';
    resetSelection();
    cancelSpaceDrawing();
    clearScaleDrawing();
    const p = plans.find(pl => pl.floor_id === floorId);
    if (p) selectedPlanId = p.id;
    localStorage.setItem(PREF_FLOOR, floorId);
    if (selectedPlanId) localStorage.setItem(PREF_PLAN, selectedPlanId);
  }

  function onPlanChange({ detail: { planId } }) {
    selectedPlanId = planId;
    resetSelection();
    cancelSpaceDrawing();
    clearScaleDrawing();
    localStorage.setItem(PREF_PLAN, planId);
  }

  // ── Mode toggle ───────────────────────────────────────────────────
  function onModeChange({ detail: { mode } }) {
    drawingMode = (drawingMode === mode) ? 'off' : mode;
    if (drawingMode !== 'space')      cancelSpaceDrawing();
    if (drawingMode !== 'component')  { dragCtrl.reset(); newPos = null; }
    if (drawingMode !== 'scale')      clearScaleDrawing();
    if (drawingMode !== 'annotation') annCtrl.reset();
    spaceCtrl.resetVertexState();
    if (sidebarMode === 'form'              && drawingMode !== 'component')  sidebarMode = 'none';
    if (sidebarMode === 'space-drawing'     && drawingMode !== 'space')      sidebarMode = 'none';
    if (sidebarMode === 'scale-input'       && drawingMode !== 'scale')      sidebarMode = 'none';
    if (sidebarMode === 'annotation-detail' && drawingMode !== 'annotation') sidebarMode = 'none';
  }

  // ── Filter handlers ───────────────────────────────────────────────
  function onChangeTypes({ detail: { hidden } })    { hiddenTypes    = hidden; }
  function onChangeStatuses({ detail: { hidden } }) { hiddenStatuses = hidden; }
  function onSearchChange({ detail: { query } })    { searchQuery    = query;  }
  function onChangeShowSpaces({ detail: { show } }) { showSpaces     = show;   }

  // ── Canvas click handler ──────────────────────────────────────────
  function onPlanClick({ detail: pos }) {
    const { x, y } = pos;

    if (drawingMode === 'scale') {
      if      (!scalePoint1) { scalePoint1 = { x, y }; }
      else if (!scalePoint2) { scalePoint2 = { x, y }; sidebarMode = 'scale-input'; }
      return;
    }

    if (drawingMode === 'space') {
      if ($drawingVertices.length >= 3) {
        const first = $drawingVertices[0];
        if (Math.hypot(first.x - x, first.y - y) < 0.03) { handleFinishDrawing(); return; }
      }
      spaceCtrl.addVertex({ x, y });
      sidebarMode = 'space-drawing';
      return;
    }

    if (drawingMode === 'annotation') { handleCreateAnnotation(x, y); return; }

    if (drawingMode === 'component') {
      newPos = { x, y }; selectedComponent = null; selectedSpace = null; sidebarMode = 'form';
      return;
    }

    resetSelection();
  }

  function onMarkerClick({ detail }) {
    selectedComponent = detail.component;
    selectedSpace     = null;
    sidebarMode       = 'detail';
    newPos            = null;
  }

  function onSpaceClick({ detail: { space } }) {
    if (drawingMode !== 'space' && drawingMode !== 'off') return;
    if (drawingMode === 'space') {
      if ($drawingVertices.length > 0) cancelSpaceDrawing();
      if (selectedSpace?.id !== space.id) spaceCtrl.resetVertexState();
    }
    selectedSpace     = space;
    selectedComponent = null;
    sidebarMode       = 'space-detail';
  }

  function onImgLoad({ detail: { aspectRatio } }) { imageAspectRatio = aspectRatio; }

  // ── Marker drag — delegate to componentDragController ────────────
  function onMarkerDragstart({ detail }) {
    if (drawingMode !== 'component') return;
    dragCtrl.onDragstart(detail.component);
  }

  // ── Annotation events — delegate to annotationDragController ─────
  function onAnnotationClick({ detail: { annotation } }) {
    if (drawingMode !== 'annotation') return;
    selectedAnnotation = annotation;
    sidebarMode        = 'annotation-detail';
  }

  function onAnnotationDragstart({ detail: { annotation } }) {
    if (drawingMode !== 'annotation') return;
    annCtrl.onDragstart(annotation);
  }

  // ── Component quick-add ───────────────────────────────────────────
  async function handleQuickAdd(e) {
    const { fields, attrValues } = e.detail;
    saving = true; errorMsg = '';
    try {
      await buildingAssetsStore.createComponent({
        ...fields,
        floor_id:   selectedFloorId,
        plan_id:    selectedPlanId,
        x_position: Math.round((newPos?.x ?? 0.5) * 1000) / 1000,
        y_position: Math.round((newPos?.y ?? 0.5) * 1000) / 1000,
      }, attrValues);
      await buildingAssetsStore.loadComponents();
      sidebarMode = 'none'; newPos = null;
    } catch (err) { errorMsg = err.message; }
    finally       { saving = false; }
  }

  // ── Space drawing finish ──────────────────────────────────────────
  async function handleFinishDrawing() {
    if ($drawingVertices.length < 3 || !drawingSpaceName.trim()) return;
    saving = true; errorMsg = '';
    try {
      const newSpace = await buildingAssetsStore.createSpace({
        plan_id:    selectedPlanId,
        floor_id:   selectedFloorId || null,
        name:       drawingSpaceName.trim(),
        space_type: drawingSpaceType || null,
        colour:     drawingColourHex === 'none' ? 'none' : drawingColourHex.replace('#', ''),
        polygon:    $drawingVertices,
        show_label: drawingShowLabel,
      });
      cancelSpaceDrawing();
      drawingMode = 'off';
      if (newSpace) { selectedSpace = newSpace; sidebarMode = 'space-detail'; }
    } catch (err) { errorMsg = err.message; }
    finally       { saving = false; }
  }

  // ── Scale calibration ─────────────────────────────────────────────
  async function handleApplyScale({ detail: { metres } }) {
    if (!scalePoint1 || !scalePoint2 || !metres) return;
    scaleSaving = true; errorMsg = '';
    try {
      const ar = imageAspectRatio ?? selectedPlan?.image_aspect_ratio ?? 1;
      await buildingAssetsStore.updatePlanScale(selectedPlanId,
        { x1: scalePoint1.x, y1: scalePoint1.y, x2: scalePoint2.x, y2: scalePoint2.y, metres }, ar);
      clearScaleDrawing();
      drawingMode = 'off';
    } catch (err) { errorMsg = err.message; }
    finally       { scaleSaving = false; }
  }

  async function handleClearScale() {
    if (!confirm('Remove the scale from this plan? Measurements will no longer be shown.')) return;
    try { await buildingAssetsStore.updatePlanScale(selectedPlanId, null, null); }
    catch (err) { errorMsg = err.message; }
  }

  // ── Component detail panel callbacks ─────────────────────────────
  function handleDetailSaved() {
    if (selectedComponent) {
      selectedComponent = $buildingAssetsStore.components.find(c => c.id === selectedComponent.id) ?? null;
    }
  }

  function handleDetailInspect(e) {
    selectedComponent = e.detail.component;
    sidebarMode       = 'inspect';
  }

  // ── Annotation create ─────────────────────────────────────────────
  async function handleCreateAnnotation(x, y) {
    try {
      const ann = await buildingAssetsStore.createAnnotation({
        plan_id: selectedPlanId, floor_id: selectedFloorId || null,
        text: 'New note', x_position: x, y_position: y,
        font_size: 'sm', colour: 'fbbf24', bold: false,
      });
      selectedAnnotation = ann;
      sidebarMode        = 'annotation-detail';
    } catch (err) { errorMsg = err.message; }
  }

  // ── Plan admin ────────────────────────────────────────────────────
  function onPlanAdmin({ detail: { mode } }) { planAdminMode = mode; planAdminOpen = true; }

  function handlePlanAdminDone({ detail: { plan, action } }) {
    planAdminOpen = false;
    if (action === 'created' || action === 'copied') {
      if (plan.floor_id) { selectedFloorId = plan.floor_id; localStorage.setItem(PREF_FLOOR, plan.floor_id); }
      selectedPlanId = plan.id;
      localStorage.setItem(PREF_PLAN, plan.id);
      resetSelection(); cancelSpaceDrawing(); clearScaleDrawing();
    }
  }

  function handlePlanAdminDeleted({ detail: { planId } }) {
    planAdminOpen = false;
    if (selectedPlanId === planId) {
      selectedPlanId = '';
      resetSelection(); cancelSpaceDrawing(); clearScaleDrawing();
      const fallback = plans.find(p => p.floor_id === selectedFloorId && p.id !== planId);
      if (fallback) { selectedPlanId = fallback.id; localStorage.setItem(PREF_PLAN, fallback.id); }
      else          { localStorage.removeItem(PREF_PLAN); }
    }
  }
</script>

<svelte:window
  on:mousemove={e => { dragCtrl.onMousemove(e); annCtrl.onMousemove(e); spaceCtrl.onMousemove(e); }}
  on:mouseup={async () => { await dragCtrl.onMouseup(); await annCtrl.onMouseup(); await spaceCtrl.onMouseup(); }}
/>

<div class="flex flex-col gap-3">

  <!-- ── Toolbar ───────────────────────────────────────────────────── -->
  <PlanToolbar
    {floors} {plansForFloor} {selectedFloorId} {selectedPlanId}
    {drawingMode} {planComponents} {visibleComponents} {planSpaces} {unplacedComponents}
    hasScale={!!selectedPlan?.scale_ref} {metresPerUnit}
    showPlanAdmin={$permissions.isAdmin} hasPlan={!!selectedPlan}
    on:floorchange={onFloorChange}
    on:planchange={onPlanChange}
    on:modechange={onModeChange}
    on:clearscale={handleClearScale}
    on:planadmin={onPlanAdmin}
  />

  <!-- ── Mode hint bar ─────────────────────────────────────────────── -->
  <PlanModeHints
    {drawingMode}
    vertexEditingActive={$vertexEditingActive}
    drawingVertices={$drawingVertices}
    {scalePoint1}
    {scalePoint2}
  />

  <!-- ── Error bar ─────────────────────────────────────────────────── -->
  {#if errorMsg}
    <div class="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-sm text-red-400
                flex justify-between items-center">
      {errorMsg}
      <button on:click={() => errorMsg = ''} class="text-red-600 hover:text-red-400 ml-3">✕</button>
    </div>
  {/if}

  <!-- ── Main area: canvas + sidebar ───────────────────────────────── -->
  <div class="flex gap-4 items-start">

    <!-- Canvas column -->
    <div class="flex-1 min-w-0">
      {#if !selectedFloorId}
        <div class="h-64 rounded-xl bg-slate-800 border border-slate-700
                    flex items-center justify-center text-slate-500 text-sm">
          Select a floor above to view its plan.
        </div>

      {:else if plansForFloor.length === 0}
        <div class="h-64 rounded-xl bg-slate-800 border border-slate-700
                    flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
          <p class="text-4xl">🗺</p>
          <p>No plans for <strong class="text-slate-400">{selectedFloor?.name}</strong>.</p>
          <p class="text-xs text-slate-600">Upload a floor plan in the Plans app to get started.</p>
        </div>

      {:else if !selectedPlan?.image_url}
        <div class="h-64 rounded-xl bg-slate-800 border border-slate-700
                    flex items-center justify-center text-slate-500 text-sm">
          No image for this plan. Upload one via Plan Admin.
        </div>

      {:else}
        <PlanCanvas
          plan={selectedPlan} floor={selectedFloor}
          planSpaces={displaySpaces} {positionedComponents} {planAnnotations}
          {types} {selectedComponent} {selectedSpace} {selectedAnnotation}
          {showSpaces} vertexEditingActive={$vertexEditingActive}
          {drawingMode} drawingVertices={$drawingVertices}
          {scalePoint1} {scalePoint2}
          showNewPosDot={sidebarMode === 'form'} {newPos}
          bind:containerEl={canvasEl}
          on:planclick={onPlanClick}
          on:markerclick={onMarkerClick}
          on:markerdragstart={onMarkerDragstart}
          on:spaceclick={onSpaceClick}
          on:spacevertexdragstart={spaceCtrl.onVertexDragstart}
          on:spacemovedragstart={spaceCtrl.onSpaceMoveDragstart}
          on:annotationclick={onAnnotationClick}
          on:annotationdragstart={onAnnotationDragstart}
          on:closepoly={handleFinishDrawing}
          on:imgload={onImgLoad}
        />
      {/if}
    </div>

    <!-- Sidebar column -->
    <div class="w-80 shrink-0 max-h-[80vh] overflow-y-auto">

      {#if sidebarMode === 'form'}
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="font-semibold text-white text-sm">Place Component</p>
              {#if newPos}
                <p class="text-xs text-slate-500 font-mono mt-0.5">
                  {selectedFloor?.short_name} · {(newPos.x * 100).toFixed(1)}% × {(newPos.y * 100).toFixed(1)}%
                </p>
              {/if}
            </div>
            <button on:click={() => { sidebarMode = 'none'; newPos = null; }}
              class="text-slate-500 hover:text-white transition-colors">✕</button>
          </div>
          <QuickAddForm
            {types} {systems} {attrDefs} {attrOptions} {saving}
            on:submit={handleQuickAdd}
            on:cancel={() => { sidebarMode = 'none'; newPos = null; }}
          />
        </div>

      {:else if sidebarMode === 'inspect' && selectedComponent}
        <InspectionPanel
          component={selectedComponent} typeConfig={selType}
          checkableAttrs={selCheckable} lastInspection={selLastInspection}
          on:saved={() => { sidebarMode = 'detail'; }}
          on:close={() => sidebarMode = 'detail'}
        />

      {:else if sidebarMode === 'detail' && selectedComponent}
        <ComponentDetailPanel
          component={selectedComponent}
          {types} {systems} {floors} {facilities} {plans} {attrDefs} {attrOptions}
          components={$buildingAssetsStore.components}
          attrs={componentAttrs[selectedComponent.id] ?? []}
          readOnly={drawingMode === 'off'}
          on:saved={handleDetailSaved}
          on:close={() => { selectedComponent = null; sidebarMode = 'none'; }}
          on:inspect={handleDetailInspect}
          on:deleted={() => { selectedComponent = null; sidebarMode = 'none'; }}
        />

      {:else if sidebarMode === 'space-drawing'}
        <SpaceDrawingSidebar
          vertices={$drawingVertices} {saving}
          bind:spaceName={drawingSpaceName}
          bind:spaceType={drawingSpaceType}
          bind:colourHex={drawingColourHex}
          bind:showLabel={drawingShowLabel}
          on:finish={handleFinishDrawing}
          on:undo={() => {
            drawingVertices.update(v => {
              const next = v.slice(0, -1);
              if (next.length === 0) sidebarMode = 'none';
              return next;
            });
          }}
          on:cancel={() => { cancelSpaceDrawing(); drawingMode = 'off'; }}
        />

      {:else if sidebarMode === 'space-detail' && selectedSpace}
        <SpaceDetailSidebar
          space={selectedSpace} {floors} {metresPerUnit} {planAR}
          vertexEditingActive={$vertexEditingActive}
          readOnly={drawingMode === 'off'}
          on:saved={({ detail }) => { selectedSpace = detail.space; }}
          on:close={() => { selectedSpace = null; sidebarMode = 'none'; resetSelection(); }}
          on:deleted={() => { resetSelection(); }}
          on:editshape={spaceCtrl.onEditShape}
          on:doneeditshape={spaceCtrl.onDoneEditShape}
        />

      {:else if sidebarMode === 'scale-input'}
        <ScaleInputSidebar
          point1={scalePoint1} point2={scalePoint2} saving={scaleSaving}
          on:apply={handleApplyScale}
          on:repick={() => { scalePoint2 = null; sidebarMode = 'none'; }}
          on:cancel={() => { clearScaleDrawing(); drawingMode = 'off'; }}
        />

      {:else if sidebarMode === 'annotation-detail' && selectedAnnotation}
        <AnnotationSidebar
          annotation={selectedAnnotation}
          on:saved={({ detail }) => { selectedAnnotation = detail.annotation; }}
          on:deleted={() => { selectedAnnotation = null; sidebarMode = 'none'; }}
          on:close={() => { selectedAnnotation = null; sidebarMode = 'none'; }}
        />

      {:else}
        <FilterSidebar
          {planComponents} {unplacedComponents} planSpaces={planSpaces}
          {types} {systems} {hiddenTypes} {hiddenStatuses} {searchQuery} {showSpaces}
          {selectedFloor} {drawingMode}
          on:changetypes={onChangeTypes}
          on:changestatuses={onChangeStatuses}
          on:searchchange={onSearchChange}
          on:changeshowspaces={onChangeShowSpaces}
          on:selectcomponent={({ detail: { component } }) => {
            selectedComponent = component; sidebarMode = 'detail';
          }}
        />
      {/if}

    </div><!-- /.sidebar -->
  </div><!-- /.main area -->

  <!-- ── Plan admin modal ──────────────────────────────────────────── -->
  <PlanAdminModal
    bind:show={planAdminOpen} mode={planAdminMode} plan={selectedPlan} {floors}
    on:done={handlePlanAdminDone}
    on:deleted={handlePlanAdminDeleted}
    on:close={() => planAdminOpen = false}
  />

  <!-- ── Inventory table (full width, below plan) ──────────────────── -->
  {#if selectedPlanId && (planComponents.length > 0 || visibleComponents.length > 0)}
    <ComponentInventory
      components={visibleComponents} {componentAttrs} componentLinks={store.componentLinks} {types} {systems} {attrDefs} {floors}
      on:selectcomponent={({ detail: { component } }) => {
        selectedComponent = component; sidebarMode = 'detail';
      }}
      on:inspect={({ detail: { component } }) => {
        selectedComponent = component; sidebarMode = 'inspect';
      }}
      on:deletecomponent={async ({ detail: { component } }) => {
        try {
          await buildingAssetsStore.deleteComponent(component.id);
          if (selectedComponent?.id === component.id) { selectedComponent = null; sidebarMode = 'none'; }
        } catch (err) { errorMsg = err.message; }
      }}
    />
  {/if}

</div>
