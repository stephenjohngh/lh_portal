// src/lib/apps/v2proto/stores/v2protoStore.js
import { writable, get } from 'svelte/store';
import { api } from '$lib/utils/api';
import { getLogger } from '$lib/utils/logger';
import { auth } from '$lib/stores/auth';

const logger = getLogger('v2proto');

function createV2ProtoStore() {
  const { subscribe, update } = writable({
    // Type hierarchy
    systems:       [],   // building_systems[]
    types:         [],   // component_types[]
    attrDefs:      {},   // { [typeId]: type_attributes[] }
    attrOptions:   {},   // { [attrDefId]: type_attribute_options[] }
    regime:        {},   // { [typeId]: maintenance_regime[] }
    // Component data
    components:    [],   // components[]
    componentAttrs:{},   // { [componentId]: component_attributes[] }
    // Supporting data
    plans:         [],   // existing plans[] (for plan picker)
    // UI state
    loading:       false,
    loadingComponents: false,
    error:         null
  });

  return {
    subscribe,

    // ── Load the type hierarchy and plans ──────────────────────────────
    async load() {
      update(s => ({ ...s, loading: true, error: null }));
      try {
        const [systems, types, defs, options, regime, plans] = await Promise.all([
          api.get('building_systems',       { orderBy: 'presentation_order' }),
          api.get('component_types',        { orderBy: 'presentation_order' }),
          api.get('type_attributes',        { orderBy: 'presentation_order' }),
          api.get('type_attribute_options', { orderBy: 'presentation_order' }),
          api.get('maintenance_regime'),
          api.get('plans', { orderBy: 'building', ascending: true })
        ]);

        const attrDefs   = {};
        const attrOptions = {};
        const regimeMap  = {};

        for (const t of types) {
          attrDefs[t.id]  = defs.filter(d => d.component_type_id === t.id);
          regimeMap[t.id] = regime.filter(r => r.type_id === t.id);
        }
        for (const d of defs) {
          attrOptions[d.id] = options.filter(o => o.type_attribute_id === d.id);
        }

        update(s => ({
          ...s,
          systems, types, attrDefs, attrOptions,
          regime: regimeMap,
          plans,
          loading: false
        }));
        logger('Loaded type hierarchy and plans');
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

        update(s => ({ ...s, components, componentAttrs, loadingComponents: false }));
        logger(`Loaded ${components.length} components`);
      } catch (err) {
        logger('Load components error:', err.message);
        update(s => ({ ...s, loadingComponents: false, error: err.message }));
      }
    },

    // ── Create a component with its attribute values ───────────────────
    async createComponent(fields, attrValues) {
      // fields:     { plan_id, type_code, primary_attribute, label, asset_id, x_position, y_position }
      // attrValues: [{ type_attribute_id, value }]
      const userId = get(auth).user?.id;

      const component = await api.create('components', {
        ...fields,
        status: 'OK',
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

        const attrDefs   = {};
        const attrOptions = {};
        const regimeMap  = {};

        for (const t of types) {
          attrDefs[t.id]  = defs.filter(d => d.component_type_id === t.id);
          regimeMap[t.id] = regime.filter(r => r.type_id === t.id);
        }
        for (const d of defs) {
          attrOptions[d.id] = options.filter(o => o.type_attribute_id === d.id);
        }

        update(s => ({
          ...s,
          systems, types, attrDefs, attrOptions,
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

    // ── Attribute Definitions CRUD ──────────────────────────────────────
    // Note: type_attributes has no created_by / updated_by columns
    async createAttrDef(data) {
      return await api.create('type_attributes', {
        component_type_id:  data.component_type_id,
        name:               data.name?.trim(),
        display_type:       data.display_type || 'text',
        required:           data.required ?? false,
        default_value:      data.default_value?.trim() || null,
        is_primary:         data.is_primary ?? false,
        presentation_order: Number(data.presentation_order) || 0,
        visible:            data.visible ?? true
      });
    },

    async updateAttrDef(id, data) {
      return await api.update('type_attributes', id, {
        name:               data.name?.trim(),
        display_type:       data.display_type,
        required:           data.required,
        default_value:      data.default_value?.trim() || null,
        is_primary:         data.is_primary,
        presentation_order: Number(data.presentation_order) || 0,
        visible:            data.visible
      });
    },

    // Clear is_primary on all sibling attr defs before setting a new primary.
    // Call this before updateAttrDef(..., { is_primary: true, ... }).
    async clearPrimaryForType(typeId) {
      let siblings = [];
      update(s => {
        siblings = (s.attrDefs[typeId] ?? []).filter(d => d.is_primary);
        return s;
      });
      for (const d of siblings) {
        await api.update('type_attributes', d.id, { is_primary: false });
      }
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
    }
  };
}

export const v2protoStore = createV2ProtoStore();
