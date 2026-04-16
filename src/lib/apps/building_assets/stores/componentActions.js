// src/lib/apps/building_assets/stores/componentActions.js
// Component domain: components[], component_attributes{}, component_inspections{}.
// Receives the writable `update` function from buildingAssetsStore.

import { api }           from '$lib/utils/api';
import { getLogger }     from '$lib/utils/logger';
import { requireUserId } from './helpers.js';

const logger = getLogger('BuildingAssets');

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

      // Index component_links by from_component_id (graceful degradation if table missing)
      let componentLinks = {};
      try {
        const allLinks = await api.get('component_links', { orderBy: 'created_at', ascending: true });
        for (const link of allLinks) {
          if (!componentLinks[link.from_component_id]) componentLinks[link.from_component_id] = [];
          componentLinks[link.from_component_id].push(link);
        }
      } catch {
        logger('component_links table not available — run migration 033 to enable');
      }

      update(s => ({ ...s, components, componentAttrs, componentLinks, inspections, loadingComponents: false }));
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

  // ── Update a component ────────────────────────────────────────────────
  async function updateComponent(id, fields) {
    const userId = requireUserId();

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
  // Lightweight position-only update — skips full updateComponent overhead.
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

  // ── Component links CRUD ─────────────────────────────────────────────
  // component_links: { id, from_component_id, to_component_ref, link_type, created_at }

  async function addComponentLink(fromComponentId, toRef, linkType) {
    const userId = requireUserId();
    const link = await api.create('component_links', {
      from_component_id: fromComponentId,
      to_component_ref:  toRef.trim(),
      link_type:         linkType?.trim() || null,
      created_by:        userId
    });
    update(s => {
      const existing = s.componentLinks[fromComponentId] ?? [];
      return {
        ...s,
        componentLinks: { ...s.componentLinks, [fromComponentId]: [...existing, link] }
      };
    });
    logger('Added component link:', link.id);
    return link;
  }

  async function updateComponentLink(linkId, fromComponentId, linkType) {
    const updated = await api.update('component_links', linkId,
      { link_type: linkType?.trim() || null });
    update(s => ({
      ...s,
      componentLinks: {
        ...s.componentLinks,
        [fromComponentId]: (s.componentLinks[fromComponentId] ?? []).map(l =>
          l.id === linkId ? { ...l, link_type: updated.link_type } : l
        )
      }
    }));
    logger('Updated component link:', linkId);
  }

  async function deleteComponentLink(linkId, fromComponentId) {
    await api.delete('component_links', linkId);
    update(s => ({
      ...s,
      componentLinks: {
        ...s.componentLinks,
        [fromComponentId]: (s.componentLinks[fromComponentId] ?? []).filter(l => l.id !== linkId)
      }
    }));
    logger('Deleted component link:', linkId);
  }

  return {
    loadComponents,
    createComponent,
    updateComponent,
    updateComponentAttrs,
    moveComponent,
    deleteComponent,
    saveInspection,
    addComponentLink,
    updateComponentLink,
    deleteComponentLink,
  };
}
