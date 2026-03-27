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
        status: 'active',
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
    }
  };
}

export const v2protoStore = createV2ProtoStore();
