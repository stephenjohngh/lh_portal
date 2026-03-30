// src/lib/apps/v2proto/stores/v2protoStore.js
import { writable, get } from 'svelte/store';
import { api } from '$lib/utils/api';
import { getLogger } from '$lib/utils/logger';
import { auth } from '$lib/stores/auth';

const logger = getLogger('v2proto');

// ── Component reference helper ─────────────────────────────────────────────
// Builds the canonical human-readable reference string for a component.
// Format: "{facility short_name} / {floor short_name} / {type name} / {asset_id or label}"
// e.g.   "BH / G / Fire Door / FD-042"
// Used for linked_component_ref values and for the datalist in the form.
export function buildRef(component, floors, facilities, types) {
  if (!component) return '';
  const floor    = floors.find(f => f.id === component.floor_id);
  const facility = floor ? facilities.find(f => f.id === floor.facility_id) : null;
  const type     = types.find(t => t.code === component.type_code);
  const facName  = facility?.short_name ?? '?';
  const flrName  = floor?.short_name    ?? '?';
  const typeName = type?.name ?? component.type_code ?? '?';
  const id       = component.asset_id || component.label || component.id?.slice(0, 8) || '?';
  return `${facName} / ${flrName} / ${typeName} / ${id}`;
}

// ── Inheritance resolution ─────────────────────────────────────────────────
// Called once at load/reload. Separates raw defs into:
//   systemAttrDefs — indexed by systemId  (system-scoped rows only)
//   attrDefs       — indexed by typeId    (effective = system-inherited + type-own)
//                    each row carries _scope: 'system' | 'type' for the admin UI
//   attrOptions    — indexed by attrDefId (unchanged — all options regardless of scope)
//   regimeMap      — indexed by typeId
//
// DATA LOADING STRATEGY:
//   All type_attributes rows (both scopes) are fetched in a single query.
//   JS separates them by scope, then builds the effective attribute list per type
//   by merging system-inherited attrs (first) + type-own attrs, ordered by
//   presentation_order. After init, every render simply looks up attrDefs[typeId]
//   with no further DB calls. At ~700 components per building this is well under
//   100ms total load time.
function resolveHierarchy(systems, types, defs, options, regime) {
  const systemAttrDefs = {};
  const attrDefs       = {};
  const attrOptions    = {};
  const regimeMap      = {};

  // Partition raw defs by scope
  const systemDefs = defs.filter(d => d.building_system_id != null);
  const typeDefs   = defs.filter(d => d.component_type_id  != null);

  // Index system-level attrs for admin management
  for (const sys of systems) {
    systemAttrDefs[sys.id] = systemDefs.filter(d => d.building_system_id === sys.id);
  }

  // Build effective attribute set per type (inherited + own), mark scope
  for (const t of types) {
    const inherited  = (systemAttrDefs[t.building_system_id] ?? [])
      .map(a => ({ ...a, _scope: 'system' }));
    const own        = typeDefs
      .filter(d => d.component_type_id === t.id)
      .map(a => ({ ...a, _scope: 'type' }));
    attrDefs[t.id]   = [...inherited, ...own]
      .sort((a, b) => a.presentation_order - b.presentation_order);
    regimeMap[t.id]  = regime.filter(r => r.type_id === t.id);
  }

  // Index options by attr def id (works for both system and type attrs)
  for (const d of defs) {
    attrOptions[d.id] = options.filter(o => o.type_attribute_id === d.id);
  }

  return { systemAttrDefs, attrDefs, attrOptions, regimeMap };
}

function createV2ProtoStore() {
  const { subscribe, update } = writable({
    // Location hierarchy
    facilities:       [],   // facilities[]  — usually one row (the default building)
    floors:           [],   // floors[] ordered by level_order
    // Type hierarchy
    systems:          [],   // building_systems[]
    types:            [],   // component_types[]
    attrDefs:         {},   // { [typeId]: effective attrs (system-inherited + type-own), each with _scope: 'system'|'type' }
    systemAttrDefs:   {},   // { [systemId]: system-level type_attributes[] } — for admin management of system attrs
    attrOptions:      {},   // { [attrDefId]: type_attribute_options[] }
    regime:           {},   // { [typeId]: maintenance_regime[] }
    // Component data
    components:       [],   // components[]
    componentAttrs:   {},   // { [componentId]: component_attributes[] }
    inspections:      {},   // { [componentId]: latest component_inspections row }
    // Supporting data
    plans:            [],   // existing plans[] (for plan picker, filtered by floor)
    spaces:           [],   // spaces[] — named polygon areas on floor plans
    annotations:      [],   // plan_annotations[] — free-form text labels on floor plans
    // UI state
    loading:          false,
    loadingComponents: false,
    error:            null
  });

  return {
    subscribe,

    // ── Load the type hierarchy and plans ──────────────────────────────
    async load() {
      update(s => ({ ...s, loading: true, error: null }));
      try {
        const [facilities, floors, systems, types, defs, options, regime, plans] = await Promise.all([
          api.get('facilities'),
          api.get('floors', { orderBy: 'level_order', ascending: true }),
          api.get('building_systems',       { orderBy: 'presentation_order' }),
          api.get('component_types',        { orderBy: 'presentation_order' }),
          api.get('type_attributes',        { orderBy: 'presentation_order' }),
          api.get('type_attribute_options', { orderBy: 'presentation_order' }),
          api.get('maintenance_regime'),
          api.get('plans', { orderBy: 'building', ascending: true })
        ]);

        const { attrDefs, systemAttrDefs, attrOptions, regimeMap } =
          resolveHierarchy(systems, types, defs, options, regime);

        // Load spaces with graceful degradation (migration 018 may not be applied yet)
        let spaces = [];
        try {
          spaces = await api.get('spaces', { orderBy: 'created_at', ascending: false });
        } catch (_err) {
          logger('Spaces table not available — run migration 018 to enable');
        }

        // Load annotations with graceful degradation (migration 021 may not be applied yet)
        let annotations = [];
        try {
          annotations = await api.get('plan_annotations', { orderBy: 'created_at', ascending: false });
        } catch (_err) {
          logger('plan_annotations table not available — run migration 021 to enable');
        }

        update(s => ({
          ...s,
          facilities, floors,
          systems, types, attrDefs, systemAttrDefs, attrOptions,
          regime: regimeMap,
          plans,
          spaces,
          annotations,
          loading: false
        }));
        logger('Loaded location hierarchy, type hierarchy, plans, spaces and annotations');
      } catch (err) {
        logger('Load error:', err.message);
        update(s => ({ ...s, loading: false, error: err.message }));
      }
    },

    // ── Load components (optionally filtered by plan) ──────────────────
    async loadComponents(planId = null) {
      update(s => ({ ...s, loadingComponents: true }));
      try {
        const opts = { orderBy: 'created_at', ascending: false };
        if (planId) opts.filters = { plan_id: planId };

        const components = await api.get('components', opts);

        // Load all component_attributes and index by component_id
        const allAttrs = await api.get('component_attributes');
        const componentAttrs = {};
        for (const c of components) {
          componentAttrs[c.id] = allAttrs.filter(a => a.component_id === c.id);
        }

        // Load latest inspection per component
        const allInspections = await api.get('component_inspections',
          { orderBy: 'inspected_at', ascending: false });
        const inspections = {};
        for (const insp of allInspections) {
          // Keep only the most recent per component (array is desc by inspected_at)
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
    },

    // ── Create a component with its attribute values ───────────────────
    async createComponent(fields, attrValues) {
      // fields:     { plan_id, type_code, primary_attribute, label, asset_id,
      //               x_position, y_position, linked_component_ref? }
      // attrValues: [{ type_attribute_id, value }]
      const userId = get(auth).user?.id;

      const component = await api.create('components', {
        ...fields,
        status: 'ok',
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
    },

    // ── Update a component ─────────────────────────────────────────────
    // When identity fields (label, asset_id, type_code, plan_id) change,
    // computes the old ref string and clears it from any other components
    // that reference it before saving, so stale links don't accumulate.
    async updateComponent(id, fields) {
      const userId = get(auth).user?.id;
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

      // Clear any other components that reference the old string
      if (oldRef) await this.clearStaleRefs(oldRef);

      const updated = await api.update('components', id, {
        ...fields,
        updated_by: userId
      });

      update(s => ({
        ...s,
        components: s.components.map(c => c.id === id ? { ...c, ...updated } : c)
      }));

      return updated;
    },

    // Nulls linked_component_ref on every component that references oldRef.
    // Called automatically by updateComponent when identity fields change.
    async clearStaleRefs(oldRef) {
      if (!oldRef) return;
      // Update in DB — filter to rows that match oldRef, set to null
      await api.updateMany('components',
        { linked_component_ref: oldRef },
        { linked_component_ref: null }
      );
      // Patch local state immediately
      update(s => ({
        ...s,
        components: s.components.map(c =>
          c.linked_component_ref === oldRef
            ? { ...c, linked_component_ref: null }
            : c
        )
      }));
      logger('Cleared stale refs to:', oldRef);
    },

    // ── Update attribute values for a component ────────────────────────
    // Replaces the full set: deletes all existing rows then inserts the new set.
    // attrValues: { [type_attribute_id]: string }
    async updateComponentAttrs(componentId, attrValues) {
      // Delete all current attrs for this component
      await api.deleteMany('component_attributes', { component_id: componentId });

      // Insert non-empty attrs
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

      // Patch local state
      update(s => ({
        ...s,
        componentAttrs: { ...s.componentAttrs, [componentId]: rows }
      }));
      logger('Updated component attrs:', componentId, rows.length, 'values');
    },

    // ── Move a component (plan placement / drag-to-reposition) ────────
    // Lightweight position update — skips identity change / stale-ref logic
    // because x_position, y_position and plan_id don't affect buildRef.
    async moveComponent(id, planId, x, y) {
      const userId = get(auth).user?.id;
      await api.update('components', id, {
        plan_id:    planId,
        x_position: x,
        y_position: y,
        updated_by: userId
      });
      update(s => ({
        ...s,
        components: s.components.map(c =>
          c.id === id ? { ...c, plan_id: planId, x_position: x, y_position: y } : c
        )
      }));
      logger('Moved component:', id, `→ plan:${planId} (${x.toFixed(3)}, ${y.toFixed(3)})`);
    },

    // ── Delete a component (cascades component_attributes) ─────────────
    async deleteComponent(id) {
      await api.delete('components', id);
      update(s => ({
        ...s,
        components: s.components.filter(c => c.id !== id),
        componentAttrs: Object.fromEntries(
          Object.entries(s.componentAttrs).filter(([k]) => k !== id)
        )
      }));
    },

    // ── Reload all type hierarchy data ──────────────────────────────────
    async reload() {
      update(s => ({ ...s, loading: true, error: null }));
      try {
        const [systems, types, defs, options, regime] = await Promise.all([
          api.get('building_systems',       { orderBy: 'presentation_order' }),
          api.get('component_types',        { orderBy: 'presentation_order' }),
          api.get('type_attributes',        { orderBy: 'presentation_order' }),
          api.get('type_attribute_options', { orderBy: 'presentation_order' }),
          api.get('maintenance_regime')
        ]);

        const { attrDefs, systemAttrDefs, attrOptions, regimeMap } =
          resolveHierarchy(systems, types, defs, options, regime);

        update(s => ({
          ...s,
          systems, types, attrDefs, systemAttrDefs, attrOptions,
          regime: regimeMap,
          loading: false
        }));
        logger('Reloaded type hierarchy');
      } catch (err) {
        logger('Reload error:', err.message);
        update(s => ({ ...s, loading: false, error: err.message }));
      }
    },

    // ── Systems CRUD ────────────────────────────────────────────────────
    async createSystem(data) {
      const userId = get(auth).user?.id;
      const row = await api.create('building_systems', {
        name:               data.name?.trim(),
        uniclass_code:      data.uniclass_code?.trim() || null,
        description:        data.description?.trim() || null,
        notes:              data.notes?.trim() || null,
        presentation_order: Number(data.presentation_order) || 0,
        visible:            data.visible ?? true,
        created_by:         userId,
        updated_by:         userId
      });
      logger('Created system:', row.id);
      return row;
    },

    async deleteSystem(id) {
      await api.delete('building_systems', id);
      logger('Deleted system:', id);
    },

    async updateSystem(id, data) {
      const userId = get(auth).user?.id;
      return await api.update('building_systems', id, {
        name:               data.name?.trim(),
        uniclass_code:      data.uniclass_code?.trim() || null,
        description:        data.description?.trim() || null,
        notes:              data.notes?.trim() || null,
        presentation_order: Number(data.presentation_order) || 0,
        visible:            data.visible,
        updated_by:         userId
      });
    },

    // ── Component Types CRUD ────────────────────────────────────────────
    async createType(data) {
      const userId = get(auth).user?.id;
      return await api.create('component_types', {
        building_system_id: data.building_system_id,
        code:               data.code?.trim().toLowerCase().replace(/\s+/g, '_'),
        name:               data.name?.trim(),
        description:        data.description?.trim() || null,
        initial:            data.initial?.trim().charAt(0).toUpperCase() || '?',
        colour:             data.colour?.replace('#', '') || '888888',
        icon_params:        data.icon_params || null,
        marker_shape:       data.marker_shape || 'circle',
        marker_size:        data.marker_size  || 'md',
        attribute_group:    data.attribute_group?.trim() || null,
        inspection_panel:   data.inspection_panel?.trim() || 'standard',
        default_attribute:  data.default_attribute?.trim() || null,
        priority_base:      data.priority_base || 'medium',
        presentation_order: Number(data.presentation_order) || 0,
        visible:            data.visible ?? true,
        notes:              data.notes?.trim() || null,
        created_by:         userId,
        updated_by:         userId
      });
    },

    async updateType(id, data) {
      const userId = get(auth).user?.id;
      return await api.update('component_types', id, {
        name:               data.name?.trim(),
        description:        data.description?.trim() || null,
        initial:            data.initial?.trim().charAt(0).toUpperCase() || '?',
        colour:             data.colour?.replace('#', '') || '888888',
        marker_shape:       data.marker_shape,
        marker_size:        data.marker_size || 'md',
        attribute_group:    data.attribute_group?.trim() || null,
        inspection_panel:   data.inspection_panel?.trim() || 'standard',
        default_attribute:  data.default_attribute?.trim() || null,
        priority_base:      data.priority_base,
        presentation_order: Number(data.presentation_order) || 0,
        visible:            data.visible,
        notes:              data.notes?.trim() || null,
        updated_by:         userId
      });
    },

    async deleteType(id) {
      await api.delete('component_types', id);
      logger('Deleted type:', id);
    },

    // ── Attribute Definitions CRUD ──────────────────────────────────────
    // Note: type_attributes has no created_by / updated_by columns
    //
    // Scope is determined by which FK is provided:
    //   data.component_type_id  set → type-level attribute
    //   data.building_system_id set → system-level attribute (inherited by all types in system)
    async createAttrDef(data) {
      const payload = {
        name:               data.name?.trim(),
        display_type:       data.display_type || 'text',
        required:           data.required ?? false,
        default_value:      data.default_value?.trim() || null,
        is_primary:         data.is_primary ?? false,
        checkable:          data.checkable ?? false,
        presentation_order: Number(data.presentation_order) || 0,
        visible:            data.visible ?? true
      };
      if (data.building_system_id) {
        payload.building_system_id = data.building_system_id;
      } else {
        payload.component_type_id = data.component_type_id;
      }
      return await api.create('type_attributes', payload);
    },

    async updateAttrDef(id, data) {
      return await api.update('type_attributes', id, {
        name:               data.name?.trim(),
        display_type:       data.display_type,
        required:           data.required,
        default_value:      data.default_value?.trim() || null,
        is_primary:         data.is_primary,
        checkable:          data.checkable ?? false,
        presentation_order: Number(data.presentation_order) || 0,
        visible:            data.visible
      });
    },

    // Clear is_primary on all attr defs in the effective set for a type.
    // Covers both system-inherited and type-own primaries.
    // Call this before updateAttrDef(..., { is_primary: true, ... }).
    async clearPrimaryForType(typeId) {
      let primaries = [];
      update(s => {
        // attrDefs[typeId] is the full effective set (system + type, all with _scope)
        primaries = (s.attrDefs[typeId] ?? []).filter(d => d.is_primary);
        return s;
      });
      for (const d of primaries) {
        await api.update('type_attributes', d.id, { is_primary: false });
      }
    },

    async deleteAttrDef(id) {
      await api.delete('type_attributes', id);
      logger('Deleted attr def:', id);
    },

    // ── Options CRUD ────────────────────────────────────────────────────
    // Note: type_attribute_options has no created_by / updated_by columns
    async createOption(data) {
      return await api.create('type_attribute_options', {
        type_attribute_id:  data.type_attribute_id,
        value:              data.value?.trim(),
        presentation_order: Number(data.presentation_order) || 0,
        visible:            data.visible ?? true,
        priority_override:  data.priority_override || null
      });
    },

    async deleteOption(id) {
      await api.delete('type_attribute_options', id);
      logger('Deleted option:', id);
    },

    async updateOption(id, data) {
      return await api.update('type_attribute_options', id, {
        value:              data.value?.trim(),
        presentation_order: Number(data.presentation_order) || 0,
        visible:            data.visible,
        priority_override:  data.priority_override || null
      });
    },

    // ── Maintenance Regime CRUD ─────────────────────────────────────────
    // Note: maintenance_regime has created_by but no updated_by, no updated_at trigger
    async createRegime(data) {
      const userId = get(auth).user?.id;
      return await api.create('maintenance_regime', {
        type_id:          data.type_id,
        attribute_filter: data.attribute_filter?.trim() || null,
        task_name:        data.task_name?.trim(),
        frequency_days:   parseInt(data.frequency_days),
        created_by:       userId
      });
    },

    async updateRegime(id, data) {
      // No updated_by column on maintenance_regime
      return await api.update('maintenance_regime', id, {
        attribute_filter: data.attribute_filter?.trim() || null,
        task_name:        data.task_name?.trim(),
        frequency_days:   parseInt(data.frequency_days)
      });
    },

    async deleteRegime(id) {
      await api.delete('maintenance_regime', id);
      logger('Deleted regime:', id);
    },

    // ── Spaces CRUD ─────────────────────────────────────────────────────
    // Spaces are named polygon areas drawn on a floor plan.
    // polygon: [{x: float, y: float}] — fractional coordinates 0–1
    // colour:  hex string WITHOUT leading '#', e.g. 'a855f7'

    async createSpace(data) {
      const userId = get(auth).user?.id;
      const space = await api.create('spaces', {
        plan_id:    data.plan_id,
        floor_id:   data.floor_id  || null,
        name:       data.name.trim(),
        space_type: data.space_type?.trim() || null,
        polygon:    data.polygon,          // [{x, y}]
        colour:     data.colour === 'none' ? 'none' : (data.colour?.replace('#', '') || 'a855f7'),
        height_m:   data.height_m          ?? null,
        show_label: data.show_label ?? true,
        notes:      data.notes?.trim()     || null,
        created_by: userId,
        updated_by: userId
      });
      update(s => ({ ...s, spaces: [...s.spaces, space] }));
      logger('Created space:', space.id, space.name);
      return space;
    },

    // Updates editable fields on a space (name, space_type, colour, height_m, notes).
    // Polygon is intentionally excluded — use updateSpacePolygon for that.
    async updateSpace(id, data) {
      const userId = get(auth).user?.id;
      const updated = await api.update('spaces', id, {
        name:       data.name.trim(),
        space_type: data.space_type?.trim() || null,
        colour:     data.colour === 'none' ? 'none' : (data.colour?.replace('#', '') || 'a855f7'),
        height_m:   data.height_m           ?? null,
        show_label: data.show_label ?? true,
        notes:      data.notes?.trim()      || null,
        updated_by: userId
      });
      update(s => ({
        ...s,
        spaces: s.spaces.map(sp => sp.id === id ? { ...sp, ...updated } : sp)
      }));
      logger('Updated space:', id, updated.name);
      return updated;
    },

    async updateSpacePolygon(id, polygon) {
      const userId = get(auth).user?.id;
      const updated = await api.update('spaces', id, { polygon, updated_by: userId });
      update(s => ({
        ...s,
        spaces: s.spaces.map(sp => sp.id === id ? { ...sp, ...updated } : sp)
      }));
      logger('Updated space polygon:', id, polygon.length, 'vertices');
    },

    async deleteSpace(id) {
      await api.delete('spaces', id);
      update(s => ({ ...s, spaces: s.spaces.filter(sp => sp.id !== id) }));
      logger('Deleted space:', id);
    },

    // ── Annotations CRUD ─────────────────────────────────────────────
    // Free-form text labels placed on a floor plan image.
    // x_position and y_position are 0–1 fractions of the plan image dimensions.

    async createAnnotation(fields) {
      // fields: { plan_id, floor_id, text, x_position, y_position, font_size, colour, bold }
      const userId = get(auth).user?.id;
      const row = await api.create('plan_annotations', { ...fields, created_by: userId });
      update(s => ({ ...s, annotations: [...s.annotations, row] }));
      return row;
    },

    async updateAnnotation(id, fields) {
      const userId = get(auth).user?.id;
      const row = await api.update('plan_annotations', id, { ...fields, updated_by: userId });
      update(s => ({ ...s, annotations: s.annotations.map(a => a.id === id ? { ...a, ...row } : a) }));
      return row;
    },

    async moveAnnotation(id, x, y) {
      const userId = get(auth).user?.id;
      await api.update('plan_annotations', id, { x_position: x, y_position: y, updated_by: userId });
      update(s => ({ ...s, annotations: s.annotations.map(a => a.id === id ? { ...a, x_position: x, y_position: y } : a) }));
    },

    async deleteAnnotation(id) {
      await api.delete('plan_annotations', id);
      update(s => ({ ...s, annotations: s.annotations.filter(a => a.id !== id) }));
    },

    // ── Plan scale calibration ──────────────────────────────────────
    // Saves a scale reference line and the image aspect ratio on a plan.
    // scaleRef:  { x1, y1, x2, y2, metres }
    // aspectRatio: number — native image W / H
    async updatePlanScale(planId, scaleRef, aspectRatio) {
      const updated = await api.update('plans', planId, {
        scale_ref:          scaleRef,
        image_aspect_ratio: aspectRatio
      });
      update(s => ({
        ...s,
        plans: s.plans.map(p => p.id === planId ? { ...p, ...updated } : p)
      }));
      logger('Updated plan scale:', planId, `ref=${scaleRef.metres}m AR=${aspectRatio}`);
      return updated;
    },

    // ── Inspection CRUD ─────────────────────────────────────────────────
    // Saves a walk inspection result for a component.
    // checklistResults: { [type_attribute_id]: boolean } — only checkable attrs.
    // walk_session_id is nullable for prototype/ad-hoc use; in the production
    // walk app it will always be set from the active walk session.
    async saveInspection(componentId, { result, notes, checklistResults }) {
      const userId = get(auth).user?.id;

      const inspection = await api.create('component_inspections', {
        component_id:      componentId,
        inspection_result: result,
        inspector_notes:   notes?.trim() || null,
        checklist_results: Object.keys(checklistResults).length > 0
          ? checklistResults
          : null,
        inspected_by:      userId,
        inspected_at:      new Date().toISOString()
        // walk_session_id intentionally omitted (null) in prototype context
      });

      // Update the component status and last_inspection_id to match
      await api.update('components', componentId, {
        status:             result,
        last_inspection_id: inspection.id,
        status_set_by:      userId,
        status_set_at:      new Date().toISOString(),
        updated_by:         userId
      });

      // Update local store state immediately (no reload needed)
      update(s => ({
        ...s,
        inspections: { ...s.inspections, [componentId]: inspection },
        components:  s.components.map(c =>
          c.id === componentId ? { ...c, status: result, last_inspection_id: inspection.id } : c
        )
      }));

      logger('Saved inspection for component:', componentId, result);
      return inspection;
    }
  };
}

export const v2protoStore = createV2ProtoStore();
