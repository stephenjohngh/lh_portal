// plan/annotationDragController.js
// Manages the drag-to-reposition state for text annotations on the canvas.
// Returns Svelte writable stores so the parent can derive `planAnnotations`
// with live drag-override positions reactively.
//
// ctx: { getCanvas(), setError(msg) }

import { writable, get } from 'svelte/store';
import { buildingAssetsStore }  from '../../stores/buildingAssetsStore.js';

export function createAnnotationDragController({ getCanvas, setError }) {
  const annotationDraggingId = writable(null);
  const annotationDragPos    = writable({});

  // Called from the annotation dragstart canvas event (after mode guard in parent).
  function onDragstart(annotation) {
    annotationDraggingId.set(annotation.id);
    annotationDragPos.set({
      [annotation.id]: { x: annotation.x_position, y: annotation.y_position }
    });
  }

  function onMousemove(e) {
    const id     = get(annotationDraggingId);
    const canvas = getCanvas();
    if (!id || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    annotationDragPos.set({ [id]: {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height)),
    }});
  }

  async function onMouseup() {
    const id = get(annotationDraggingId);
    if (!id) return;
    const pos = get(annotationDragPos)[id];
    if (pos) {
      try { await buildingAssetsStore.moveAnnotation(id, pos.x, pos.y); }
      catch (err) { setError(err.message); }
    }
    annotationDraggingId.set(null);
    annotationDragPos.set({});
  }

  // Called from onModeChange when leaving annotation mode.
  function reset() {
    annotationDraggingId.set(null);
    annotationDragPos.set({});
  }

  return { annotationDraggingId, annotationDragPos, onDragstart, onMousemove, onMouseup, reset };
}
