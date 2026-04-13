// src/lib/apps/building_assets/stores/annotationActions.js
// Annotations domain: free-form text labels placed on floor plan images.
// x_position and y_position are 0–1 fractions of the plan image dimensions.

import { api }           from '$lib/utils/api';
import { requireUserId } from './helpers.js';

// Factory — call once at store creation time.
export function createAnnotationActions(update) {

  // fields: { plan_id, floor_id, text, x_position, y_position, font_size, colour, bold }
  async function createAnnotation(fields) {
    const userId = requireUserId();
    const row = await api.create('plan_annotations', { ...fields, created_by: userId });
    update(s => ({ ...s, annotations: [...s.annotations, row] }));
    return row;
  }

  async function updateAnnotation(id, fields) {
    const userId = requireUserId();
    const row = await api.update('plan_annotations', id, { ...fields, updated_by: userId });
    update(s => ({
      ...s,
      annotations: s.annotations.map(a => a.id === id ? { ...a, ...row } : a)
    }));
    return row;
  }

  async function moveAnnotation(id, x, y) {
    const userId = requireUserId();
    await api.update('plan_annotations', id, {
      x_position: x,
      y_position: y,
      updated_by: userId
    });
    update(s => ({
      ...s,
      annotations: s.annotations.map(a =>
        a.id === id ? { ...a, x_position: x, y_position: y } : a
      )
    }));
  }

  async function deleteAnnotation(id) {
    await api.delete('plan_annotations', id);
    update(s => ({ ...s, annotations: s.annotations.filter(a => a.id !== id) }));
  }

  return { createAnnotation, updateAnnotation, moveAnnotation, deleteAnnotation };
}
