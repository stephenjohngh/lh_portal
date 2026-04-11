// src/lib/apps/v2proto/stores/componentActions.js
// Component domain: components[], component_attributes{}, component_inspections{}.
// Receives the writable `update` function from v2protoStore.

import { api }           from '$lib/utils/api';
import { getLogger }     from '$lib/utils/logger';
import { requireUserId, buildRef } from './helpers.js';

const logger = getLogger('v2proto');

// Factory — call once at store creation time.
export function createComponentActions(update) {

  // ── Load components (optionally filtered by plan) ─────────────────────
  async function loadComponents(planId = null) {
    update(s => ({ ...s, loadingComponents: true }));
    try {
      const opts = { orderBy: 'created_at', ascending: false };
      if (planId) opts.filters = { plan_id: planId };

      const components = await api.get('components', opts);

      // Index component_attributes by component_id
      const allAttrs = await api.get('component_attributes');
      const componentAttrs = {};
      for (const c of components) {
        componentAttrs[c.id] = allAttrs.filter(a => a.component_id === c.id);
      }

      // Keep only the latest inspection per component (desc by inspected_at)
      const allInspections = await api.get('component_inspections',
        { orderBy: 'inspected_at', ascending: false });
      const inspections = {};
      for (const insp of allInspections) {
        if (!inspections[insp.component_id]) {
          inspections[insp.component_id] = insp;
        }
      }

      update(s => ({ ...s, components, componentAttrs, inspections, loadingComponents: false }));
      logger(`Loaded ${components.length} components`);
    } catch (err) {
      logger('Load components error:', err.message);
      update(s => ({ ...s, loadingComponents: false, error: err.message }));
    }
  }

  // ── Create a component with its attribute values ──────────────────────
  // fields:     { plan_id, type_code, primary_attribute, label, asset_id,
  //               x_position, y_position, linked_component_ref? }
  // attrValues: [{ type_attribute_id, value }]
  async function createComponent(fields, attrValues) {
    const userId = requireUserId();

    const component = await api.create('components', {
      ...fields,
      status:     'ok',
      created_by: userId,
      updated_by: userId
    });

    const attrRows = attrValues
      .filter(av => av.value !== '' && av.value !== null && av.value !== undefined)
      .map(av => ({
        component_id:      component.id,
        type_attribute_id: av.type_attribute_id,
        value:             String(av.value)
      }));

    if (attrRows.length > 0) {
      await api.createMany('component_attributes', attrRows, false);
    }

    logger('Created component:', component.id);
    return component;
  }

  // ── Nulls linked_component_ref on every component referencing oldRef ──
  // Called automatically by updateComponent when identity fields change.
  async function clearStaleRefs(oldRef) {
    if (!oldRef) return;
    await api.updateMany('components',
      { linked_component_ref: oldRef },
      { linked_component_ref: null }
    );
    update(s => ({
      ...s,
      components: s.components.map(c =>
        c.linked_component_ref === oldRef
          ? { ...c, linked_component_ref: null }
          : c
      )
    }));
    logger('Cleared stale refs to:', oldRef);
  }

  // ── Update a component ────────────────────────────────────────────────
  // When identity fields (label, asset_id, type_code, plan_id) change,
  // computes the old ref string and clears it from any other components
  // that reference it before saving, so stale links don't accumulate.
  async function updateComponent(id, fields) {
    const userId = requireUserId();
    let oldRef = null;

    update(s => {
      const existing = s.components.find(c => c.id === id);
      if (existing) {
        const identityChanged =
          fields.floor_id  !== existing.floor_id  ||
          fields.label     !== existing.label      ||
          fields.asset_id  !== existing.asset_id   ||
          fields.type_code !== existing.type_code  ||
          fields.plan_id   !== existing.plan_id;
        if (identityChanged) {
          oldRef = buildRef(existing, s.floors, s.facilities, s.types);
        }
      }
      return s;
    });

    if (oldRef) await clearStaleRefs(oldRef);

    const updated = await api.update('components', id, {
      ...fields,
      updated_by: userId
    });

    update(s => ({
      ...s,
      components: s.components.map(c => c.id === id ? { ...c, ...updated } : c)
    }));

    return updated;
  }

  // ── Replace the full attribute set for a component ────────────────────
  // Deletes all existing rows then inserts the new set.
  // attrValues: { [type_attribute_id]: string }
  async function updateComponentAttrs(componentId, attrValues) {
    await api.deleteMany('component_attributes', { component_id: componentId });

    const rows = Object.entries(attrValues)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([type_attribute_id, value]) => ({
        component_id:      componentId,
        type_attribute_id,
        value:             String(value)
      }));

    if (rows.length > 0) {
      await api.createMany('component_attributes', rows, false);
    }

    update(s => ({
      ...s,
      componentAttrs: { ...s.componentAttrs, [componentId]: rows }
    }));
    logger('Updated component attrs:', componentId, rows.length, 'values');
  }

  // ── Move a component (drag-to-reposition / plan placement) ───────────
  // Lightweight position-only update — skips stale-ref logic because
  // x_position, y_position and plan_id don't affect the buildRef string.
  async function moveComponent(id, planId, x, y) {
    const userId = requireUserId();
    const rx = Math.round(x * 1000) / 1000;
    const ry = Math.round(y * 1000) / 1000;
    await api.update('components', id, {
      plan_id:    planId,
      x_position: rx,
      y_position: ry,
      updated_by: userId
    });
    update(s => ({
      ...s,
      components: s.components.map(c =>
        c.id === id ? { ...c, plan_id: planId, x_position: rx, y_position: ry } : c
      )
    }));
    logger('Moved component:', id, `→ plan:${planId} (${x.toFixed(3)}, ${y.toFixed(3)})`);
  }

  // ── Delete a component (cascades component_attributes) ───────────────
  async function deleteComponent(id) {
    await api.delete('components', id);
    update(s => ({
      ...s,
      components:     s.components.filter(c => c.id !== id),
      componentAttrs: Object.fromEntries(
        Object.entries(s.componentAttrs).filter(([k]) => k !== id)
      )
    }));
  }

  // ── Save an inspection result for a component ─────────────────────────
  // checklistResults: { [type_attribute_id]: boolean } — checkable attrs only.
  // walk_session_id is nullable for prototype/ad-hoc use.
  async function saveInspection(componentId, { result, notes, checklistResults }) {
    const userId = requireUserId();

    const inspection = await api.create('component_inspections', {
      component_id:      componentId,
      inspection_result: result,
      inspector_notes:   notes?.trim() || null,
      checklist_results: Object.keys(checklistResults).length > 0
        ? checklistResults
        : null,
      inspected_by: userId,
      inspected_at: new Date().toISOString()
      // walk_session_id intentionally omitted (null) in prototype context
    });

    await api.update('components', componentId, {
      status:             result,
      last_inspection_id: inspection.id,
      status_set_by:      userId,
      status_set_at:      new Date().toISOString(),
      updated_by:         userId
    });

    update(s => ({
      ...s,
      inspections: { ...s.inspections, [componentId]: inspection },
      components:  s.components.map(c =>
        c.id === componentId
          ? { ...c, status: result, last_inspection_id: inspection.id }
          : c
      )
    }));

    logger('Saved inspection for component:', componentId, result);
    return inspection;
  }

  return {
    loadComponents,
    createComponent,
    updateComponent,
    clearStaleRefs,
    updateComponentAttrs,
    moveComponent,
    deleteComponent,
    saveInspection,
  };
}
