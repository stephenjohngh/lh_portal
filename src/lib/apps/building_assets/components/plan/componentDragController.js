// plan/componentDragController.js
// Manages the drag-to-reposition state for component markers on the canvas.
// Returns Svelte writable stores for `draggingId` and `dragPos` so the parent
// can subscribe reactively (e.g. to derive `positionedComponents`).
//
// ctx: { getCanvas(), getPlanId(), setError(msg) }

import { writable, get }  from 'svelte/store';
import { buildingAssetsStore }   from '../../stores/buildingAssetsStore.js';

export function createComponentDragController({ getCanvas, getPlanId, setError }) {
  const draggingId = writable(null);
  const dragPos    = writable({});

  // Called from onMarkerDragstart canvas event (after mode guard in parent).
  function onDragstart(component) {
    draggingId.set(component.id);
    dragPos.set({ [component.id]: { x: component.x_position, y: component.y_position } });
  }

  function onMousemove(e) {
    const id     = get(draggingId);
    const canvas = getCanvas();
    if (!id || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    dragPos.set({ [id]: {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height)),
    }});
  }

  async function onMouseup() {
    const id = get(draggingId);
    if (!id) return;
    const pos = get(dragPos)[id];
    if (pos) {
      try { await buildingAssetsStore.moveComponent(id, getPlanId(), pos.x, pos.y); }
      catch (err) { setError(err.message); }
    }
    draggingId.set(null);
    dragPos.set({});
  }

  // Called from onModeChange when leaving component mode.
  function reset() {
    draggingId.set(null);
    dragPos.set({});
  }

  return { draggingId, dragPos, onDragstart, onMousemove, onMouseup, reset };
}
