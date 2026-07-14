// src/lib/apps/building_assets/stores/spaceActions.js
// Spaces domain: named polygon areas drawn on floor plans.
// polygon: [{ x: float, y: float }] — fractional coordinates 0–1
// colour:  hex string WITHOUT leading '#', e.g. '3c9683'

import { api }           from '$lib/utils/api';
import { getLogger }     from '$lib/utils/logger';
import { logAudit }      from '$lib/utils/auditLogger';
import { requireUserId } from './helpers.js';
import { buildSpacesRegisterRows } from '../utils/spaceReport.js';
import { deriveSpaceName } from '$lib/utils/spaceRef.js';

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
      // label = multi-line plan-view display (preserve whitespace/newlines);
      // name = single-line report name (derived from the label when blank).
      label:      data.label ?? null,
      name:       data.name?.trim() || deriveSpaceName(data.label ?? ''),
      type:       data.type?.trim() || null,
      polygon:    roundPoly(data.polygon),
      colour:     normaliseColour(data.colour),
      height_m:   data.height_m          ?? null,
      show_label: data.show_label        ?? true,
      notes:      data.notes?.trim()     || null,
      kind:        data.kind === 'slot' ? 'slot' : 'space',
      assigned_id: data.assigned_id?.trim() || null,
      created_by: userId,
      updated_by: userId
    });
    update(s => ({ ...s, spaces: [...s.spaces, space] }));
    logger('Created space:', space.id, space.name);
    logAudit('create', 'space', space.id, space.name, { ...AUDIT_OPTS, afterData: space });
    return space;
  }

  // Updates editable metadata fields (name, type, colour, height_m, notes).
  // Polygon is intentionally excluded — use updateSpacePolygon for geometry changes.
  async function updateSpace(id, data) {
    const userId = requireUserId();
    const patch = {
      type:       data.type?.trim() || null,
      colour:     normaliseColour(data.colour),
      height_m:   data.height_m          ?? null,
      show_label: data.show_label        ?? true,
      notes:      data.notes?.trim()     || null,
      updated_by: userId
    };
    // label / name / kind / assigned_id are managed by the detail sidebar; only
    // patch them when provided so other callers can't inadvertently reset them.
    // label = multi-line plan display; name = single-line report (derived when blank).
    if (data.label       !== undefined) patch.label       = data.label ?? null;
    if (data.name        !== undefined) patch.name        = data.name?.trim() || deriveSpaceName(data.label ?? '');
    if (data.kind        !== undefined) patch.kind        = data.kind === 'slot' ? 'slot' : 'space';
    if (data.assigned_id !== undefined) patch.assigned_id = data.assigned_id?.trim() || null;
    const updated = await api.update('spaces', id, patch);
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

  // -- Membership overrides (space_component_overrides) --------------------
  // Manual include/exclude that layer over derived geometric membership (§4.3).
  // Upsert on the (space_id, component_id) unique key so toggling mode replaces.

  async function setMemberOverride(spaceId, componentId, mode, note = null) {
    const userId = requireUserId();
    const row = await api.upsert('space_component_overrides',
      { space_id: spaceId, component_id: componentId, mode, note, created_by: userId },
      { onConflict: 'space_id,component_id' });
    update(s => {
      const others = s.spaceOverrides.filter(
        o => !(o.space_id === spaceId && o.component_id === componentId));
      return { ...s, spaceOverrides: [...others, row] };
    });
    logger('Set member override:', mode, spaceId, componentId);
    logAudit('update', 'space_member_override', row.id, mode,
      { ...AUDIT_OPTS, afterData: row });
    return row;
  }

  async function removeMemberOverride(spaceId, componentId) {
    await api.deleteMany('space_component_overrides',
      { space_id: spaceId, component_id: componentId });
    update(s => ({
      ...s,
      spaceOverrides: s.spaceOverrides.filter(
        o => !(o.space_id === spaceId && o.component_id === componentId)),
    }));
    logger('Removed member override:', spaceId, componentId);
    logAudit('delete', 'space_member_override', `${spaceId}:${componentId}`, 'override cleared',
      { ...AUDIT_OPTS });
  }

  // -- Reporting (P3) -----------------------------------------------------
  // Building-wide spaces register (imperative snapshot): delegates to the pure
  // buildSpacesRegisterRows over current in-memory state. Reactive consumers
  // (SpacesTab) call the pure builder directly instead — calling this from a
  // reactive block would loop, because update() notifies subscribers.
  function buildSpacesRegister() {
    let rows = [];
    update(s => { rows = buildSpacesRegisterRows(s); return s; });
    return rows;
  }

  return {
    createSpace, updateSpace, updateSpacePolygon, deleteSpace,
    setMemberOverride, removeMemberOverride,
    buildSpacesRegister,
  };
}
