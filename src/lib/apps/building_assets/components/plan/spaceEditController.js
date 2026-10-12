// plan/spaceEditController.js
// Manages all space polygon editing state: vertex dragging, polygon move, and
// the drawing-vertices buffer used while a new space is being drawn.
//
// Returns Svelte writable stores for `drawingVertices`, `vertexEditingActive`
// and `editingPolygon` so the parent can bind to them reactively.
//
// ctx: {
//   getCanvas():           HTMLElement | null
//   getSelectedSpace():    space | null
//   getPlanSpaces():       space[]
//   getDrawingMode():      string
//   setSelectedSpace(v):   void   — sync selectedSpace after polygon save
//   setError(msg):         void
// }

import { writable, get } from 'svelte/store';
import { buildingAssetsStore }  from '../../stores/buildingAssetsStore.js';

export function createSpaceEditController(ctx) {
  // -- Exposed stores --------------------------------------------------
  // drawingVertices: the in-progress polygon vertices while drawing a new space.
  // vertexEditingActive: true when the user has clicked "Edit shape" on a space.
  // editingPolygon: { spaceId, vertices } live copy during vertex drag or move.
  const drawingVertices    = writable([]);
  const vertexEditingActive = writable(false);
  const editingPolygon     = writable(null);

  // -- Internal-only state (no reactivity needed outside this module) --
  let vertexDragIndex     = null;
  let spaceMoveDragging   = false;
  let spaceMoveOrigin     = null;
  let spaceMoveBasePolygon = null;

  // -- Drawing buffer helpers ------------------------------------------

  // Append a vertex to the in-progress polygon.
  function addVertex(pt) {
    drawingVertices.update(v => [...v, pt]);
  }

  // Reset just the drawing buffer (called from the parent's cancelSpaceDrawing,
  // which also resets the form fields that live in the parent).
  function cancelDrawing() {
    drawingVertices.set([]);
  }

  // -- Vertex / move editing helpers -----------------------------------

  // Reset all vertex / move editing state (called from resetSelection and
  // onModeChange in the parent).
  function resetVertexState() {
    vertexEditingActive.set(false);
    editingPolygon.set(null);
    vertexDragIndex      = null;
    spaceMoveDragging    = false;
    spaceMoveOrigin      = null;
    spaceMoveBasePolygon = null;
  }

  // -- "Edit shape" / "Done editing" (dispatched by SpaceDetailSidebar) --

  function onEditShape() {
    const sp = ctx.getPlanSpaces().find(s => s.id === ctx.getSelectedSpace()?.id);
    if (!sp) return;
    vertexEditingActive.set(true);
    editingPolygon.set({ spaceId: sp.id, vertices: sp.polygon.map(v => ({ ...v })) });
  }

  function onDoneEditShape() {
    vertexEditingActive.set(false);
    editingPolygon.set(null);
    vertexDragIndex = null;
  }

  // -- Vertex drag (dispatched by PlanCanvas SVG vertex circles) -------

  function onVertexDragstart({ detail: { index } }) {
    const sel = ctx.getSelectedSpace();
    if (!sel || !get(vertexEditingActive)) return;
    // Snapshot the polygon before the first vertex move if not already done.
    if (!get(editingPolygon)) {
      const sp = ctx.getPlanSpaces().find(s => s.id === sel.id);
      if (!sp) return;
      editingPolygon.set({ spaceId: sel.id, vertices: sp.polygon.map(v => ({ ...v })) });
    }
    vertexDragIndex = index;
  }

  // -- Space polygon move (mousedown on polygon body) -------------------

  function onSpaceMoveDragstart({ detail: { space, x, y } }) {
    if (ctx.getDrawingMode() !== 'space') return;
    const sel = ctx.getSelectedSpace();
    if (!sel || sel.id !== space.id || get(vertexEditingActive)) return;
    const sp = ctx.getPlanSpaces().find(s => s.id === sel.id);
    if (!sp) return;
    spaceMoveDragging    = true;
    spaceMoveOrigin      = { x, y };
    spaceMoveBasePolygon = sp.polygon.map(v => ({ ...v }));
    editingPolygon.set({ spaceId: sp.id, vertices: sp.polygon.map(v => ({ ...v })) });
  }

  // -- Mouse move: update live polygon for vertex drag OR polygon move --

  function onMousemove(e) {
    if (vertexDragIndex === null && !spaceMoveDragging) return;
    const canvas = ctx.getCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
    const ep = get(editingPolygon);

    if (vertexDragIndex !== null && ep) {
      editingPolygon.set({
        ...ep,
        vertices: ep.vertices.map((v, i) => i === vertexDragIndex ? { x, y } : v),
      });
    } else if (spaceMoveDragging && spaceMoveBasePolygon && spaceMoveOrigin) {
      const dx = x - spaceMoveOrigin.x;
      const dy = y - spaceMoveOrigin.y;
      editingPolygon.set({
        spaceId: ctx.getSelectedSpace().id,
        vertices: spaceMoveBasePolygon.map(v => ({
          x: Math.max(0, Math.min(1, v.x + dx)),
          y: Math.max(0, Math.min(1, v.y + dy)),
        })),
      });
    }
  }

  // -- Typed corner position (SpaceDetailSidebar's corner list) ---------
  // The same coordinates a drag gives — a fraction of the schematic's width (x)
  // and height (y), 0 to 1 — the units a component's X / Y position uses.
  // Clamped and rounded to 3 places, then saved at once, as a drag is on release.
  async function setVertex(index, x, y) {
    const sel = ctx.getSelectedSpace();
    if (!sel || !get(vertexEditingActive)) return;
    let ep = get(editingPolygon);
    if (!ep || ep.spaceId !== sel.id) {
      const sp = ctx.getPlanSpaces().find(s => s.id === sel.id);
      if (!sp) return;
      ep = { spaceId: sel.id, vertices: sp.polygon.map(v => ({ ...v })) };
    }
    if (index < 0 || index >= ep.vertices.length) return;
    const fit = (n, old) => {
      // An emptied box is "not changed", not 0 — Number('') would be 0.
      if (n === '' || n == null || String(n).trim() === '') return old;
      const v = Number(n);
      return Number.isFinite(v) ? Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000 : old;
    };
    const vertices = ep.vertices.map((v, i) => i === index ? { x: fit(x, v.x), y: fit(y, v.y) } : v);
    editingPolygon.set({ spaceId: ep.spaceId, vertices });
    try {
      await buildingAssetsStore.updateSpacePolygon(ep.spaceId, vertices);
      const updated = get(buildingAssetsStore).spaces.find(s => s.id === ep.spaceId);
      if (updated && ctx.getSelectedSpace()?.id === updated.id) ctx.setSelectedSpace(updated);
    } catch (/** @type {any} */ err) {
      ctx.setError(err.message);
    }
  }

  // -- Mouse up: persist the finished vertex drag or polygon move -------

  async function onMouseup() {
    if (vertexDragIndex === null && !spaceMoveDragging) return;

    if (vertexDragIndex !== null) {
      vertexDragIndex = null;
      // Capture before the await — editingPolygon may be cleared (e.g. "Done
      // editing" pressed) while the DB round-trip is in flight.
      const poly = get(editingPolygon);
      if (!poly) return;
      try {
        await buildingAssetsStore.updateSpacePolygon(poly.spaceId, poly.vertices);
        // Sync selectedSpace so SpaceDetailSidebar shows the updated vertex count.
        const updated = get(buildingAssetsStore).spaces.find(s => s.id === poly.spaceId);
        const sel     = ctx.getSelectedSpace();
        if (updated && sel?.id === updated.id) ctx.setSelectedSpace(updated);
      } catch (/** @type {any} */ err) {
        ctx.setError(err.message);
      }

    } else if (spaceMoveDragging) {
      spaceMoveDragging    = false;
      spaceMoveOrigin      = null;
      spaceMoveBasePolygon = null;
      const poly = get(editingPolygon);
      if (!poly) return;
      try {
        await buildingAssetsStore.updateSpacePolygon(poly.spaceId, poly.vertices);
        const updated = get(buildingAssetsStore).spaces.find(s => s.id === poly.spaceId);
        const sel     = ctx.getSelectedSpace();
        if (updated && sel?.id === updated.id) ctx.setSelectedSpace(updated);
      } catch (/** @type {any} */ err) {
        ctx.setError(err.message);
      }
      // Clear live copy only when not simultaneously in vertex-edit mode.
      if (!get(vertexEditingActive)) editingPolygon.set(null);
    }
  }

  return {
    // Reactive stores — destructure and prefix with $ in the parent
    drawingVertices,
    vertexEditingActive,
    editingPolygon,
    // Drawing buffer
    addVertex,
    cancelDrawing,
    // Vertex / move state
    resetVertexState,
    // Event handlers — wire directly to PlanCanvas / SpaceDetailSidebar events
    onEditShape,
    onDoneEditShape,
    onVertexDragstart,
    setVertex,
    onSpaceMoveDragstart,
    onMousemove,
    onMouseup,
  };
}
