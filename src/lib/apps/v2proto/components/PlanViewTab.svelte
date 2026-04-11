<!-- src/lib/apps/v2proto/components/PlanViewTab.svelte -->
<!-- Plan view orchestrator.
     Owns all shared state (selection, drawing modes, sidebar, drag) and wires
     together the four sub-components:
       PlanToolbar        — floor/plan pickers, mode toggle, type legend, stats
       PlanCanvas         — image, SVG overlay, component markers
       sidebar panels     — QuickAddForm / ComponentDetailPanel / InspectionPanel /
                            SpaceDrawingSidebar / SpaceDetailSidebar /
                            SpaceDrawingSidebar / SpaceDetailSidebar /
                            ScaleInputSidebar / FilterSidebar                     -->
<script>
  import { v2protoStore }        from '../stores/v2protoStore.js';
  import { typeByCode, checkableDefs } from '../lookups.js';
  import { computeMetresPerUnit } from './plan/planMeasure.js';
  import PlanToolbar              from './plan/PlanToolbar.svelte';
  import PlanCanvas               from './plan/PlanCanvas.svelte';
  import SpaceDrawingSidebar      from './plan/SpaceDrawingSidebar.svelte';
  import SpaceDetailSidebar       from './plan/SpaceDetailSidebar.svelte';
  import ScaleInputSidebar        from './plan/ScaleInputSidebar.svelte';
  import FilterSidebar            from './plan/FilterSidebar.svelte';
  import ComponentInventory       from './plan/ComponentInventory.svelte';
  import ComponentDetailPanel     from './ComponentDetailPanel.svelte';
  import InspectionPanel          from './InspectionPanel.svelte';
  import QuickAddForm             from './QuickAddForm.svelte';
  import AnnotationSidebar        from './plan/AnnotationSidebar.svelte';

  // ── Store bindings ────────────────────────────────────────────────
  $: store          = $v2protoStore;
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
  const PREF_FLOOR = 'lh_v2proto_selectedFloorId';
  const PREF_PLAN  = 'lh_v2proto_selectedPlanId';
  let selectedFloorId = '';
  let selectedPlanId  = '';

  // ── Mode / sidebar state ──────────────────────────────────────────
  // drawingMode: 'off' | 'component' | 'space' | 'scale' | 'annotation'
  let drawingMode       = 'off';
  // sidebarMode: 'none' | 'form' | 'detail' | 'inspect' |
  //              'space-drawing' | 'space-detail' | 'scale-input' | 'annotation-detail'
  let sidebarMode       = 'none';
  let selectedComponent = null;
  let selectedSpace     = null;
  let newPos            = null;   // { x, y } pending component position
  let saving            = false;
  let errorMsg          = '';

  // ── Filter state ─────────────────────────────────────────────────
  let hiddenTypes       = new Set();  // type codes to hide (exclusive)
  let hiddenStatuses    = new Set();  // statuses to hide (exclusive; empty = show all)
  let searchQuery       = '';         // free-text match on label / asset_id / notes

  // ── Drag state ────────────────────────────────────────────────────
  let draggingId  = null;
  let dragPos     = {};   // { [componentId]: { x, y } }
  let canvasEl    = null; // bound from PlanCanvas; used for drag rect calculation

  // ── Space drawing state ───────────────────────────────────────────
  // name/type/colour are two-way bound to SpaceDrawingSidebar so that the
  // parent can call handleFinishDrawing when the user closes the polygon
  // by clicking the first vertex on the canvas.
  let drawingVertices  = [];
  let drawingSpaceName = '';
  let drawingSpaceType = '';
  let drawingColourHex = '#a855f7';
  let drawingShowLabel = true;

  // ── Space display / filter state ─────────────────────────────────
  let showSpaces          = true;

  // ── Vertex editing state ──────────────────────────────────────────
  // Enabled via "Edit shape" button in SpaceDetailSidebar.
  // editingPolygon holds a live copy of the polygon being dragged so
  // PlanCanvas can render it without waiting for a DB round-trip.
  let vertexEditingActive = false;
  let editingPolygon      = null;   // { spaceId, vertices: [{x,y}] }
  let vertexDragIndex     = null;   // index of vertex being dragged

  // ── Space move state ──────────────────────────────────────────────
  // Active when user mousedowns on a selected (non-vertex-editing) polygon.
  // editingPolygon is reused as the live copy during the move.
  let spaceMoveDragging    = false;
  let spaceMoveOrigin      = null;   // { x, y } mouse position when move drag started
  let spaceMoveBasePolygon = null;   // original polygon vertices before move

  // ── Annotation state ──────────────────────────────────────────────
  let selectedAnnotation   = null;   // the annotation being edited
  let annotationDraggingId = null;
  let annotationDragPos    = {};     // { [annotationId]: { x, y } }

  // ── Scale calibration state ───────────────────────────────────────
  let scalePoint1      = null;   // { x, y } first reference click
  let scalePoint2      = null;   // { x, y } second reference click
  let scaleSaving      = false;
  let imageAspectRatio = null;   // captured from <img> naturalWidth/naturalHeight

  // ── Derived: floor / plan views ───────────────────────────────────
  $: plansForFloor      = selectedFloorId
    ? plans.filter(p => p.floor_id === selectedFloorId) : [];
  $: selectedPlan       = plans.find(p => p.id === selectedPlanId) ?? null;
  $: selectedFloor      = floors.find(f => f.id === selectedFloorId) ?? null;
  $: planComponents     = selectedPlanId
    ? components.filter(c => c.plan_id === selectedPlanId) : [];
  $: planSpaces         = selectedPlanId
    ? spaces.filter(s => s.plan_id === selectedPlanId) : [];
  // Substitute the live editingPolygon for the selected space so vertex drags
  // are rendered immediately without waiting for the DB round-trip.
  // Capture ep once so the truthy check and the inner property accesses
  // always refer to the same value (guards against Svelte reading the reactive
  // source twice and getting null on the second read if it changed in between).
  $: displaySpaces = (() => {
    const ep = editingPolygon;
    if (!ep) return planSpaces;
    return planSpaces.map(s => s.id === ep.spaceId
      ? { ...s, polygon: ep.vertices }
      : s);
  })();
  $: planAnnotations    = selectedPlanId
    ? annotations.filter(a => a.plan_id === selectedPlanId).map(a => {
        const ov = annotationDragPos[a.id];
        return ov ? { ...a, x_position: ov.x, y_position: ov.y } : a;
      })
    : [];
  $: unplacedComponents = selectedFloorId
    ? components.filter(c => c.floor_id === selectedFloorId && !c.plan_id) : [];

  // ── Derived: filters ──────────────────────────────────────────────
  $: visibleComponents = planComponents.filter(c => {
    // Type filter — exclusive: hidden types are excluded
    if (hiddenTypes.has(c.type_code)) return false;
    // Status filter — exclusive: hidden statuses are excluded
    // Normalise to lowercase so legacy 'OK' rows match the 'ok' STATUSES value
    const status = (c.status || 'ok').toLowerCase();
    if (hiddenStatuses.has(status)) return false;
    // Text search across label, asset_id, notes
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (!(c.label    ?? '').toLowerCase().includes(q) &&
          !(c.asset_id ?? '').toLowerCase().includes(q) &&
          !(c.notes    ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Apply drag overrides — this reactive statement is what makes the marker move
  // during drag (a plain function call would not re-evaluate when dragPos changes).
  $: positionedComponents = visibleComponents.map(c => {
    const ov = dragPos[c.id];
    return ov ? { ...c, x_position: ov.x, y_position: ov.y } : c;
  });

  // ── Derived: inspection panel context ────────────────────────────
  $: selType           = selectedComponent
    ? typeByCode(types, selectedComponent.type_code) : null;
  $: selCheckable      = selectedComponent
    ? checkableDefs(attrDefs, types, selectedComponent.type_code) : [];
  $: selLastInspection = selectedComponent
    ? (inspections[selectedComponent.id] ?? null) : null;

  // ── Derived: scale ────────────────────────────────────────────────
  $: planAR        = selectedPlan?.image_aspect_ratio ?? imageAspectRatio;
  $: metresPerUnit = computeMetresPerUnit(selectedPlan?.scale_ref, planAR);

  // ── Auto-select: restore saved floor/plan, else first floor with plans ──
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
      if (f) {
        selectedFloorId = f.id;
        selectedPlanId  = plans.find(p => p.floor_id === f.id)?.id ?? '';
      }
    }
    autoSelected = true;
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function resetSelection() {
    selectedComponent    = null;
    selectedSpace        = null;
    selectedAnnotation   = null;
    sidebarMode          = 'none';
    newPos               = null;
    vertexEditingActive  = false;
    editingPolygon       = null;
    vertexDragIndex      = null;
    spaceMoveDragging    = false;
    spaceMoveOrigin      = null;
    spaceMoveBasePolygon = null;
  }

  function cancelSpaceDrawing() {
    drawingVertices  = [];
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
    if (drawingMode !== 'component')  { draggingId = null; dragPos = {}; newPos = null; }
    if (drawingMode !== 'scale')      clearScaleDrawing();
    if (drawingMode !== 'annotation') { annotationDraggingId = null; annotationDragPos = {}; }
    // Stop vertex editing on any mode switch
    vertexEditingActive = false; editingPolygon = null; vertexDragIndex = null;
    if (sidebarMode === 'form'              && drawingMode !== 'component')  sidebarMode = 'none';
    if (sidebarMode === 'space-drawing'     && drawingMode !== 'space')      sidebarMode = 'none';
    if (sidebarMode === 'scale-input'       && drawingMode !== 'scale')      sidebarMode = 'none';
    if (sidebarMode === 'annotation-detail' && drawingMode !== 'annotation') sidebarMode = 'none';
  }

  // FilterSidebar dispatches replacement Sets so we can trigger Svelte reactivity
  // with a simple assignment rather than mutate-then-reassign.
  function onChangeTypes({ detail: { hidden } })    { hiddenTypes    = hidden; }
  function onChangeStatuses({ detail: { hidden } }) { hiddenStatuses = hidden; }

  function onSearchChange({ detail: { query } }) { searchQuery = query; }
  function onChangeShowSpaces({ detail: { show } }) { showSpaces = show; }

  function onClearFilters() {
    hiddenTypes    = new Set();
    hiddenStatuses = new Set();
    searchQuery    = '';
  }

  // ── Canvas event handlers ─────────────────────────────────────────
  function onPlanClick({ detail: pos }) {
    const { x, y } = pos;

    if (drawingMode === 'scale') {
      if      (!scalePoint1) { scalePoint1 = { x, y }; }
      else if (!scalePoint2) { scalePoint2 = { x, y }; sidebarMode = 'scale-input'; }
      return;
    }

    if (drawingMode === 'space') {
      // Click near first vertex (< 3% of image width) → close polygon
      if (drawingVertices.length >= 3) {
        const first = drawingVertices[0];
        if (Math.hypot(first.x - x, first.y - y) < 0.03) {
          handleFinishDrawing();
          return;
        }
      }
      drawingVertices = [...drawingVertices, { x, y }];
      sidebarMode = 'space-drawing';
      return;
    }

    if (drawingMode === 'annotation') {
      // Place a new annotation at click position
      handleCreateAnnotation(x, y);
      return;
    }

    if (drawingMode === 'component') {
      newPos            = { x, y };
      selectedComponent = null;
      selectedSpace     = null;
      sidebarMode       = 'form';
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
      // If mid-draw, cancel it before switching to edit
      if (drawingVertices.length > 0) cancelSpaceDrawing();
      // Cancel vertex editing when switching to a different space
      if (selectedSpace?.id !== space.id) {
        vertexEditingActive = false;
        editingPolygon      = null;
        vertexDragIndex     = null;
      }
    }
    selectedSpace     = space;
    selectedComponent = null;
    sidebarMode       = 'space-detail';
  }

  function onClosePoly() {
    // User clicked the first vertex circle on the canvas — same as pressing Finish
    handleFinishDrawing();
  }

  function onImgLoad({ detail: { aspectRatio } }) {
    imageAspectRatio = aspectRatio;
  }

  // ── Drag to reposition ────────────────────────────────────────────
  function onMarkerDragstart({ detail }) {
    if (drawingMode !== 'component') return;
    const { component } = detail;
    draggingId = component.id;
    dragPos    = { [component.id]: { x: component.x_position, y: component.y_position } };
  }

  function handleMousemove(e) {
    if (!draggingId || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    dragPos = { [draggingId]: {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height)),
    }};
  }

  async function handleMouseup() {
    if (!draggingId) return;
    const pos = dragPos[draggingId];
    if (pos) {
      try { await v2protoStore.moveComponent(draggingId, selectedPlanId, pos.x, pos.y); }
      catch (err) { errorMsg = err.message; }
    }
    draggingId = null;
    dragPos    = {};
  }

  // ── Component quick-add ───────────────────────────────────────────
  async function handleQuickAdd(e) {
    const { fields, attrValues } = e.detail;
    saving = true; errorMsg = '';
    try {
      await v2protoStore.createComponent({
        ...fields,
        floor_id:   selectedFloorId,
        plan_id:    selectedPlanId,
        x_position: Math.round((newPos?.x ?? 0.5) * 1000) / 1000,
        y_position: Math.round((newPos?.y ?? 0.5) * 1000) / 1000,
      }, attrValues);
      await v2protoStore.loadComponents();
      sidebarMode = 'none';
      newPos      = null;
    } catch (err) { errorMsg = err.message; }
    finally       { saving = false; }
  }

  // ── Space drawing ─────────────────────────────────────────────────
  // Called by: Finish button in SpaceDrawingSidebar, or canvas closepoly event.
  // name / type / colour come from the two-way bound state vars.
  async function handleFinishDrawing() {
    if (drawingVertices.length < 3 || !drawingSpaceName.trim()) return;
    saving = true; errorMsg = '';
    try {
      const newSpace = await v2protoStore.createSpace({
        plan_id:    selectedPlanId,
        floor_id:   selectedFloorId || null,
        name:       drawingSpaceName.trim(),
        space_type: drawingSpaceType || null,
        colour:     drawingColourHex === 'none' ? 'none' : drawingColourHex.replace('#', ''),
        polygon:    drawingVertices,
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
      await v2protoStore.updatePlanScale(selectedPlanId, {
        x1: scalePoint1.x, y1: scalePoint1.y,
        x2: scalePoint2.x, y2: scalePoint2.y,
        metres,
      }, ar);
      clearScaleDrawing();
      drawingMode = 'off';
    } catch (err) { errorMsg = err.message; }
    finally       { scaleSaving = false; }
  }

  async function handleClearScale() {
    if (!confirm('Remove the scale from this plan? Measurements will no longer be shown.')) return;
    try { await v2protoStore.updatePlanScale(selectedPlanId, null, null); }
    catch (err) { errorMsg = err.message; }
  }

  // ── Component detail panel callbacks ─────────────────────────────
  function handleDetailSaved() {
    if (selectedComponent) {
      selectedComponent = $v2protoStore.components
        .find(c => c.id === selectedComponent.id) ?? null;
    }
  }

  function handleDetailInspect(e) {
    selectedComponent = e.detail.component;
    sidebarMode       = 'inspect';
  }

  // ── Annotation handlers ───────────────────────────────────────────
  async function handleCreateAnnotation(x, y) {
    try {
      const ann = await v2protoStore.createAnnotation({
        plan_id:    selectedPlanId,
        floor_id:   selectedFloorId || null,
        text:       'New note',
        x_position: x,
        y_position: y,
        font_size:  'sm',
        colour:     'fbbf24',
        bold:       false,
      });
      selectedAnnotation = ann;
      sidebarMode        = 'annotation-detail';
    } catch (err) { errorMsg = err.message; }
  }

  function onAnnotationClick({ detail: { annotation } }) {
    if (drawingMode !== 'annotation') return;
    selectedAnnotation = annotation;
    sidebarMode        = 'annotation-detail';
  }

  function onAnnotationDragstart({ detail: { annotation } }) {
    if (drawingMode !== 'annotation') return;
    annotationDraggingId = annotation.id;
    annotationDragPos    = {
      [annotation.id]: { x: annotation.x_position, y: annotation.y_position }
    };
  }

  function handleMousemoveAnnotation(e) {
    if (!annotationDraggingId || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    annotationDragPos = { [annotationDraggingId]: {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height)),
    }};
  }

  async function handleMouseupAnnotation() {
    if (!annotationDraggingId) return;
    const pos = annotationDragPos[annotationDraggingId];
    if (pos) {
      try { await v2protoStore.moveAnnotation(annotationDraggingId, pos.x, pos.y); }
      catch (err) { errorMsg = err.message; }
    }
    annotationDraggingId = null;
    annotationDragPos    = {};
  }

  // ── Space vertex drag ─────────────────────────────────────────────
  function onVertexDragstart({ detail: { index } }) {
    if (!selectedSpace || !vertexEditingActive) return;
    // Snapshot current polygon if not already done (before setting vertexDragIndex
    // so we never have a non-null dragIndex with a null editingPolygon).
    if (!editingPolygon) {
      const sp = displaySpaces.find(s => s.id === selectedSpace.id);
      if (!sp) return;
      editingPolygon = { spaceId: selectedSpace.id, vertices: sp.polygon.map(v => ({ ...v })) };
    }
    vertexDragIndex = index;
  }

  function handleMousemoveVertex(e) {
    if (vertexDragIndex === null && !spaceMoveDragging) return;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));

    if (vertexDragIndex !== null && editingPolygon) {
      editingPolygon = {
        ...editingPolygon,
        vertices: editingPolygon.vertices.map((v, i) => i === vertexDragIndex ? { x, y } : v),
      };
    } else if (spaceMoveDragging && spaceMoveBasePolygon && spaceMoveOrigin) {
      const dx = x - spaceMoveOrigin.x;
      const dy = y - spaceMoveOrigin.y;
      editingPolygon = {
        spaceId: selectedSpace.id,
        vertices: spaceMoveBasePolygon.map(v => ({
          x: Math.max(0, Math.min(1, v.x + dx)),
          y: Math.max(0, Math.min(1, v.y + dy)),
        })),
      };
    }
  }

  async function handleMouseupVertex() {
    if (vertexDragIndex === null && !spaceMoveDragging) return;

    if (vertexDragIndex !== null) {
      vertexDragIndex = null;
      // Capture before the await — editingPolygon could be cleared (e.g. user
      // presses "Done editing") while the store round-trip is in flight.
      const poly = editingPolygon;
      if (!poly) return;
      try {
        await v2protoStore.updateSpacePolygon(poly.spaceId, poly.vertices);
        // Sync selectedSpace so SpaceDetailSidebar shows the updated vertex count
        const updated = $v2protoStore.spaces.find(s => s.id === poly.spaceId);
        if (updated && selectedSpace?.id === updated.id) selectedSpace = updated;
      } catch (err) {
        errorMsg = err.message;
      }
    } else if (spaceMoveDragging) {
      spaceMoveDragging    = false;
      spaceMoveOrigin      = null;
      spaceMoveBasePolygon = null;
      const poly = editingPolygon;
      if (!poly) return;
      try {
        await v2protoStore.updateSpacePolygon(poly.spaceId, poly.vertices);
        const updated = $v2protoStore.spaces.find(s => s.id === poly.spaceId);
        if (updated && selectedSpace?.id === updated.id) selectedSpace = updated;
      } catch (err) {
        errorMsg = err.message;
      }
      // Clear live copy only when not also vertex-editing
      if (!vertexEditingActive) editingPolygon = null;
    }
  }

  function onEditShape() {
    vertexEditingActive = true;
    const sp = planSpaces.find(s => s.id === selectedSpace?.id);
    if (sp) {
      editingPolygon = { spaceId: sp.id, vertices: sp.polygon.map(v => ({ ...v })) };
    }
  }

  function onDoneEditShape() {
    vertexEditingActive  = false;
    editingPolygon       = null;
    vertexDragIndex      = null;
  }

  // ── Space polygon move ─────────────────────────────────────────────
  function onSpaceMoveDragstart({ detail: { space, x, y } }) {
    if (drawingMode !== 'space') return;  // move only allowed in Spaces mode
    if (!selectedSpace || selectedSpace.id !== space.id || vertexEditingActive) return;
    const sp = planSpaces.find(s => s.id === selectedSpace.id);
    if (!sp) return;
    spaceMoveDragging    = true;
    spaceMoveOrigin      = { x, y };
    spaceMoveBasePolygon = sp.polygon.map(v => ({ ...v }));
    editingPolygon       = { spaceId: sp.id, vertices: sp.polygon.map(v => ({ ...v })) };
  }
</script>

<svelte:window
  on:mousemove={e => { handleMousemove(e); handleMousemoveAnnotation(e); handleMousemoveVertex(e); }}
  on:mouseup={async () => { await handleMouseup(); await handleMouseupAnnotation(); await handleMouseupVertex(); }}
/>

<div class="flex flex-col gap-3">

  <!-- ── Toolbar ───────────────────────────────────────────────────── -->
  <PlanToolbar
    {floors}
    {plansForFloor}
    {selectedFloorId}
    {selectedPlanId}
    {drawingMode}
    {planComponents}
    {visibleComponents}
    {planSpaces}
    {unplacedComponents}
    hasScale={!!selectedPlan?.scale_ref}
    {metresPerUnit}
    on:floorchange={onFloorChange}
    on:planchange={onPlanChange}
    on:modechange={onModeChange}
    on:clearscale={handleClearScale}
  />

  <!-- ── Mode hint bar ─────────────────────────────────────────────── -->
  {#if drawingMode === 'component'}
    <div class="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20
                text-xs text-amber-300/80 flex items-center gap-2">
      <span>✏</span>
      <span>Click a blank area to place a component. Drag existing markers to reposition.</span>
    </div>

  {:else if drawingMode === 'space'}
    <div class="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20
                text-xs text-purple-300/80 flex items-center gap-2">
      <span>⬡</span>
      <span>
        {#if drawingVertices.length > 0}
          Click on the plan to add polygon vertices.
          {#if drawingVertices.length >= 3}
            Click the first vertex <strong>●</strong> to close, or press <strong>Finish</strong>.
          {:else}
            {3 - drawingVertices.length} more {3 - drawingVertices.length === 1 ? 'vertex' : 'vertices'} needed.
          {/if}
        {:else}
          Click an existing space to select and edit it, or click a blank area to draw a new space.
        {/if}
      </span>
    </div>

  {:else if drawingMode === 'scale'}
    <div class="px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20
                text-xs text-teal-300/80 flex items-center gap-2">
      <span>📏</span>
      <span>
        {#if !scalePoint1}
          Click the <strong>first point</strong> of a known distance on the plan.
        {:else if !scalePoint2}
          Click the <strong>second point</strong> of the same known distance.
        {:else}
          Enter the real-world distance in the panel and press <strong>Apply</strong>.
        {/if}
      </span>
    </div>

  {:else if drawingMode === 'annotation'}
    <div class="px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20
                text-xs text-sky-300/80 flex items-center gap-2">
      <span>🏷</span>
      <span>Click anywhere on the plan to drop a text note. Drag existing notes to reposition.</span>
    </div>
  {/if}

  {#if vertexEditingActive}
    <div class="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20
                text-xs text-purple-300/80 flex items-center gap-2">
      <span>✦</span>
      <span>Drag the <strong class="text-purple-400">●</strong> vertex handles to reshape
        the space. Press <strong>Done editing</strong> in the panel when finished.</span>
    </div>
  {/if}

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
          No image for this plan. Upload one in the Plans app.
        </div>

      {:else}
        <PlanCanvas
          plan={selectedPlan}
          floor={selectedFloor}
          planSpaces={displaySpaces}
          {positionedComponents}
          {planAnnotations}
          {types}
          {selectedComponent}
          {selectedSpace}
          {selectedAnnotation}
          {showSpaces}
          {vertexEditingActive}
          {drawingMode}
          {drawingVertices}
          {scalePoint1}
          {scalePoint2}
          showNewPosDot={sidebarMode === 'form'}
          {newPos}
          bind:containerEl={canvasEl}
          on:planclick={onPlanClick}
          on:markerclick={onMarkerClick}
          on:markerdragstart={onMarkerDragstart}
          on:spaceclick={onSpaceClick}
          on:spacevertexdragstart={onVertexDragstart}
          on:spacemovedragstart={onSpaceMoveDragstart}
          on:annotationclick={onAnnotationClick}
          on:annotationdragstart={onAnnotationDragstart}
          on:closepoly={onClosePoly}
          on:imgload={onImgLoad}
        />
      {/if}
    </div>

    <!-- Sidebar column -->
    <div class="w-80 shrink-0 max-h-[80vh] overflow-y-auto">

      {#if sidebarMode === 'form'}
        <!-- Quick-add form: place new component at newPos -->
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
            <button
              on:click={() => { sidebarMode = 'none'; newPos = null; }}
              class="text-slate-500 hover:text-white transition-colors"
            >✕</button>
          </div>
          <QuickAddForm
            {types} {systems} {attrDefs} {attrOptions} {saving}
            on:submit={handleQuickAdd}
            on:cancel={() => { sidebarMode = 'none'; newPos = null; }}
          />
        </div>

      {:else if sidebarMode === 'inspect' && selectedComponent}
        <InspectionPanel
          component={selectedComponent}
          typeConfig={selType}
          checkableAttrs={selCheckable}
          lastInspection={selLastInspection}
          on:saved={() => { sidebarMode = 'detail'; }}
          on:close={() => sidebarMode = 'detail'}
        />

      {:else if sidebarMode === 'detail' && selectedComponent}
        <ComponentDetailPanel
          component={selectedComponent}
          {types} {systems} {floors} {facilities} {plans}
          {attrDefs} {attrOptions}
          components={$v2protoStore.components}
          attrs={componentAttrs[selectedComponent.id] ?? []}
          readOnly={drawingMode === 'off'}
          on:saved={handleDetailSaved}
          on:close={() => { selectedComponent = null; sidebarMode = 'none'; }}
          on:inspect={handleDetailInspect}
          on:deleted={() => { selectedComponent = null; sidebarMode = 'none'; }}
        />

      {:else if sidebarMode === 'space-drawing'}
        <SpaceDrawingSidebar
          vertices={drawingVertices}
          {saving}
          bind:spaceName={drawingSpaceName}
          bind:spaceType={drawingSpaceType}
          bind:colourHex={drawingColourHex}
          bind:showLabel={drawingShowLabel}
          on:finish={handleFinishDrawing}
          on:undo={() => {
            drawingVertices = drawingVertices.slice(0, -1);
            if (drawingVertices.length === 0) sidebarMode = 'none';
          }}
          on:cancel={() => { cancelSpaceDrawing(); drawingMode = 'off'; }}
        />

      {:else if sidebarMode === 'space-detail' && selectedSpace}
        <SpaceDetailSidebar
          space={selectedSpace}
          {floors}
          {metresPerUnit}
          {planAR}
          {vertexEditingActive}
          readOnly={drawingMode === 'off'}
          on:saved={({ detail }) => { selectedSpace = detail.space; }}
          on:close={() => { selectedSpace = null; sidebarMode = 'none'; resetSelection(); }}
          on:deleted={() => { resetSelection(); }}
          on:editshape={onEditShape}
          on:doneeditshape={onDoneEditShape}
        />

      {:else if sidebarMode === 'scale-input'}
        <ScaleInputSidebar
          point1={scalePoint1}
          point2={scalePoint2}
          saving={scaleSaving}
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
        <!-- Default: search + type/system filter tree + status + unplaced -->
        <FilterSidebar
          {planComponents}
          {unplacedComponents}
          planSpaces={planSpaces}
          {types}
          {systems}
          {hiddenTypes}
          {hiddenStatuses}
          {searchQuery}
          {showSpaces}
          {selectedFloor}
          {drawingMode}
          on:changetypes={onChangeTypes}
          on:changestatuses={onChangeStatuses}
          on:searchchange={onSearchChange}
          on:changeshowspaces={onChangeShowSpaces}
          on:selectcomponent={({ detail: { component } }) => {
            selectedComponent = component;
            sidebarMode = 'detail';
          }}
        />
      {/if}

    </div><!-- /.sidebar -->
  </div><!-- /.main area -->

  <!-- ── Inventory table (full width, below plan) ──────────────── -->
  {#if selectedPlanId && (planComponents.length > 0 || visibleComponents.length > 0)}
    <ComponentInventory
      components={visibleComponents}
      {componentAttrs}
      {types}
      {systems}
      {attrDefs}
      {floors}
      on:selectcomponent={({ detail: { component } }) => {
        selectedComponent = component;
        sidebarMode       = 'detail';
      }}
      on:inspect={({ detail: { component } }) => {
        selectedComponent = component;
        sidebarMode       = 'inspect';
      }}
      on:deletecomponent={async ({ detail: { component } }) => {
        try {
          await v2protoStore.deleteComponent(component.id);
          if (selectedComponent?.id === component.id) {
            selectedComponent = null;
            sidebarMode       = 'none';
          }
        } catch (err) { errorMsg = err.message; }
      }}
    />
  {/if}

</div>
