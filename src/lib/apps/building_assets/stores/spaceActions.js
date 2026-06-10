// src/lib/apps/building_assets/stores/spaceActions.js
// Spaces domain: named polygon areas drawn on floor plans.
// polygon: [{ x: float, y: float }] — fractional coordinates 0–1
// colour:  hex string WITHOUT leading '#', e.g. '3c9683'

import { api }           from '$lib/utils/api';
import { getLogger }     from '$lib/utils/logger';
import { logAudit }      from '$lib/utils/auditLogger';
import { requireUserId } from './helpers.js';

const logger = getLogger('BuildingAssets');

const AUDIT_OPTS = { appId: 'building_assets', eventCategory: 'building_assets' };

const round3 = v => Math.round(v * 1000) / 1000;
const roundPoly = polygon => polygon.map(v => ({ x: round3(v.x), y: round3(v.y) }));
const normaliseColour = c => c === 'none' ? 'none' : (c?.replace('#', '') || '3c9683');

// Factory — call once at store creation time.
export function createSpaceActions(update) {

  async function createSpace(data) {
    const userId = requireUserId();
    const space = await api.create('spaces', {
      plan_id:    data.plan_id,
      floor_id:   data.floor_id   || null,
      name:       data.name,      // preserve leading whitespace — users may indent plan labels
      space_type: data.space_type?.trim() || null,
      polygon:    roundPoly(data.polygon),
      colour:     normaliseColour(data.colour),
      height_m:   data.height_m          ?? null,
      show_label: data.show_label        ?? true,
      notes:      data.notes?.trim()     || null,
      created_by: userId,
      updated_by: userId
    });
    update(s => ({ ...s, spaces: [...s.spaces, space] }));
    logger('Created space:', space.id, space.name);
    logAudit('create', 'space', space.id, space.name, { ...AUDIT_OPTS, afterData: space });
    return space;
  }

  // Updates editable metadata fields (name, space_type, colour, height_m, notes).
  // Polygon is intentionally excluded — use updateSpacePolygon for geometry changes.
  async function updateSpace(id, data) {
    const userId = requireUserId();
    const updated = await api.update('spaces', id, {
      name:       data.name,      // preserve leading whitespace — users may indent plan labels
      space_type: data.space_type?.trim() || null,
      colour:     normaliseColour(data.colour),
      height_m:   data.height_m          ?? null,
      show_label: data.show_label        ?? true,
      notes:      data.notes?.trim()     || null,
      updated_by: userId
    });
    update(s => ({
      ...s,
      spaces: s.spaces.map(sp => sp.id === id ? { ...sp, ...updated } : sp)
    }));
    logger('Updated space:', id, updated.name);
    logAudit('update', 'space', id, updated.name, { ...AUDIT_OPTS, afterData: updated });
    return updated;
  }

  async function updateSpacePolygon(id, polygon) {
    const userId  = requireUserId();
    const rounded = roundPoly(polygon);
    const updated = await api.update('spaces', id, { polygon: rounded, updated_by: userId });
    update(s => ({
      ...s,
      spaces: s.spaces.map(sp => sp.id === id ? { ...sp, ...updated } : sp)
    }));
    logger('Updated space polygon:', id, polygon.length, 'vertices');
  }

  async function deleteSpace(id) {
    let before = null;
    update(s => { before = s.spaces.find(sp => sp.id === id) ?? null; return s; });
    await api.delete('spaces', id);
    update(s => ({ ...s, spaces: s.spaces.filter(sp => sp.id !== id) }));
    logger('Deleted space:', id);
    logAudit('delete', 'space', id, before?.name || id,
      { ...AUDIT_OPTS, beforeData: before });
  }

  return { createSpace, updateSpace, updateSpacePolygon, deleteSpace };
}
