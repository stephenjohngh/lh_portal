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

/**
 * The four corners of the rectangle pulled out from `a` to the opposite corner
 * `b` (2026-10-23): top-left, top-right, bottom-right, bottom-left, whichever
 * way it was pulled. Plan coordinates are fractions of the schematic's width and
 * height, so an axis-aligned rectangle here is one on screen.
 * @param {{x:number,y:number}} a @param {{x:number,y:number}} b
 */
export function rectangleCorners(a, b) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

/** A pull too short in either direction is a stray click, not a space. */
export const MIN_RECTANGLE_SIDE = 0.004;
/** @param {{x:number,y:number}[]} corners */
export function isUsableRectangle(corners) {
  if (corners.length !== 4) return false;
  return corners[1].x - corners[0].x >= MIN_RECTANGLE_SIDE && corners[2].y - corners[1].y >= MIN_RECTANGLE_SIDE;
}

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
  // The corner a rectangle is being pulled out from, while the button is down.
  /** @type {{x:number,y:number}|null} */
  let rectOrigin = null;

  // -- Drawing buffer helpers ------------------------------------------

  // Append a vertex to the in-progress polygon.
  function addVertex(pt) {
    drawingVertices.update(v => [...v, pt]);
  }

  // -- Rectangle: press on one corner, pull to the opposite one, release.
  // The four corners are the drawing buffer, live while pulling, so the usual
  // preview and the usual Finish apply.
  function startRectangle(pt) {
    rectOrigin = { ...pt };
    drawingVertices.set([]);
  }

  // Reset just the drawing buffer (called from the parent's cancelSpaceDrawing,
  // which also resets the form fields that live in the parent).
  function cancelDrawing() {
    rectOrigin = null;
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
    if (vertexDragIndex === null && !spaceMoveDragging && !rectOrigin) return;
    const canvas = ctx.getCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
    if (rectOrigin) { drawingVertices.set(rectangleCorners(rectOrigin, { x, y })); return; }
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
    if (rectOrigin) {
      rectOrigin = null;
      if (isUsableRectangle(get(drawingVertices))) ctx.onRectangleDrawn?.();
      else drawingVertices.set([]);
      return;
    }
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
    startRectangle,
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
