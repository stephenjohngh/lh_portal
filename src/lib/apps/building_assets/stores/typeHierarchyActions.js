// src/lib/apps/building_assets/stores/typeHierarchyActions.js
// Type hierarchy domain: building_systems, component_types, type_attributes,
// type_attribute_options and the reload() orchestrator.
//
// maintenance_regime USED to live here too — a per-type "task + frequency" rule
// this app owned despite the name. Its definitions moved into the shared
// statutory-obligation library (owned by Inspection, edited in Admin →
// Inspections); see docs/requirements/build_plans/Obligation_Library_Promotion_Build_Plan.md.
// Building Assets no longer defines maintenance work at all.
// Receives the writable `update` function from buildingAssetsStore so all mutations
// land in the single shared store state.

import { api }              from '$lib/utils/api';
import { getLogger }        from '$lib/utils/logger';
import { logAudit }         from '$lib/utils/auditLogger';
import { resolveHierarchy } from '$lib/utils/attrResolution.js';
import { requireUserId }    from './helpers.js';

const logger = getLogger('BuildingAssets');

const AUDIT_OPTS = { appId: 'building_assets', eventCategory: 'building_assets' };

// Factory — call once at store creation time.
// update: the writable store's update function.
export function createTypeHierarchyActions(update) {

  // -- Reload all type hierarchy data ------------------------------------
  async function reload() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const [systems, types, defs, options] = await Promise.all([
        api.get('building_systems',       { orderBy: 'presentation_order' }),
        api.get('component_types',        { orderBy: 'presentation_order' }),
        api.get('type_attributes',        { orderBy: 'presentation_order' }),
        api.get('type_attribute_options', { orderBy: 'presentation_order' }),
      ]);

      const { attrDefs, systemAttrDefs, attrOptions } =
        resolveHierarchy(systems, types, defs, options);

      update(s => ({
        ...s,
        systems, types, attrDefs, systemAttrDefs, attrOptions,
        loading: false
      }));
      logger('Reloaded type hierarchy');
    } catch (err) {
      logger('Reload error:', err.message);
      update(s => ({ ...s, loading: false, error: err.message }));
    }
  }

  // -- Building Systems CRUD ---------------------------------------------
  async function createSystem(data) {
    const userId = requireUserId();
    const row = await api.create('building_systems', {
      name:               data.name?.trim(),
      uniclass_code:      data.uniclass_code?.trim() || null,
      description:        data.description?.trim()   || null,
      notes:              data.notes?.trim()          || null,
      presentation_order: Number(data.presentation_order) || 0,
      visible:            data.visible ?? true,
      created_by:         userId,
      updated_by:         userId
    });
    logger('Created system:', row.id);
    logAudit('create', 'building_system', row.id, row.name,
      { ...AUDIT_OPTS, afterData: row });
    return row;
  }

  async function updateSystem(id, data) {
    const userId = requireUserId();
    const row = await api.update('building_systems', id, {
      name:               data.name?.trim(),
      uniclass_code:      data.uniclass_code?.trim() || null,
      description:        data.description?.trim()   || null,
      notes:              data.notes?.trim()          || null,
      presentation_order: Number(data.presentation_order) || 0,
      visible:            data.visible,
      updated_by:         userId
    });
    logAudit('update', 'building_system', id, row.name,
      { ...AUDIT_OPTS, afterData: row });
    return row;
  }

  async function deleteSystem(id) {
    await api.delete('building_systems', id);
    logger('Deleted system:', id);
    logAudit('delete', 'building_system', id, id, { ...AUDIT_OPTS });
  }

  // -- Component Types CRUD ----------------------------------------------
  async function createType(data) {
    const userId = requireUserId();
    const row = await api.create('component_types', {
      building_system_id: data.building_system_id,
      code:               data.code?.trim().toLowerCase().replace(/\s+/g, '_'),
      name:               data.name?.trim(),
      description:        data.description?.trim()       || null,
      initial:            data.initial?.trim().charAt(0).toUpperCase() || '?',
      colour:             data.colour?.replace('#', '')  || '888888',
      icon_params:        data.icon_params               || null,
      marker_shape:       data.marker_shape              || 'circle',
      marker_size:        data.marker_size               || 'md',
      attribute_group:    data.attribute_group?.trim()   || null,
      inspection_panel:   data.inspection_panel?.trim()  || 'standard',
      default_attribute:  data.default_attribute?.trim() || null,
      priority_base:      data.priority_base             || 'medium',
      presentation_order: Number(data.presentation_order) || 0,
      visible:             data.visible ?? true,
      notes:               data.notes?.trim()              || null,
      highlight_attribute: data.highlight_attribute?.trim() || null,
      highlight_colour:    data.highlight_colour?.replace('#', '').trim() || null,
      created_by:          userId,
      updated_by:          userId
    });
    logAudit('create', 'component_type', row.id, row.name,
      { ...AUDIT_OPTS, afterData: row });
    return row;
  }

  async function updateType(id, data) {
    const userId = requireUserId();
    const row = await api.update('component_types', id, {
      name:               data.name?.trim(),
      description:        data.description?.trim()       || null,
      initial:            data.initial?.trim().charAt(0).toUpperCase() || '?',
      colour:             data.colour?.replace('#', '')  || '888888',
      marker_shape:       data.marker_shape,
      marker_size:        data.marker_size               || 'md',
      attribute_group:    data.attribute_group?.trim()   || null,
      inspection_panel:   data.inspection_panel?.trim()  || 'standard',
      default_attribute:  data.default_attribute?.trim() || null,
      priority_base:      data.priority_base,
      presentation_order: Number(data.presentation_order) || 0,
      visible:             data.visible,
      notes:               data.notes?.trim()              || null,
      highlight_attribute: data.highlight_attribute?.trim() || null,
      highlight_colour:    data.highlight_colour?.replace('#', '').trim() || null,
      updated_by:          userId
    });
    logAudit('update', 'component_type', id, row.name,
      { ...AUDIT_OPTS, afterData: row });
    return row;
  }

  async function deleteType(id) {
    await api.delete('component_types', id);
    logger('Deleted type:', id);
    logAudit('delete', 'component_type', id, id, { ...AUDIT_OPTS });
  }

  // -- Attribute Definitions CRUD ----------------------------------------
  // type_attributes has no created_by / updated_by columns.
  // Scope is determined by which FK is provided:
  //   data.component_type_id  → type-level attribute
  //   data.building_system_id → system-level attribute (inherited by all types in system)
  async function createAttrDef(data) {
    const payload = {
      name:               data.name?.trim(),
      display_type:       data.display_type              || 'text',
      required:           data.required                  ?? false,
      default_value:      data.default_value?.trim()     || null,
      is_primary:         data.is_primary                ?? false,
      checkable:          data.checkable                 ?? false,
      presentation_order: Number(data.presentation_order) || 0,
      visible:            data.visible                   ?? true,
      help_notes:         data.help_notes?.trim()        || null
    };
    if (data.building_system_id) {
      payload.building_system_id = data.building_system_id;
    } else {
      payload.component_type_id = data.component_type_id;
    }
    const row = await api.create('type_attributes', payload);
    logAudit('create', 'type_attribute', row.id, row.name,
      { ...AUDIT_OPTS, afterData: row });
    return row;
  }

  async function updateAttrDef(id, data) {
    const row = await api.update('type_attributes', id, {
      name:               data.name?.trim(),
      display_type:       data.display_type,
      required:           data.required,
      default_value:      data.default_value?.trim()     || null,
      is_primary:         data.is_primary,
      checkable:          data.checkable                 ?? false,
      presentation_order: Number(data.presentation_order) || 0,
      visible:            data.visible,
      help_notes:         data.help_notes?.trim()        || null
    });
    logAudit('update', 'type_attribute', id, row.name,
      { ...AUDIT_OPTS, afterData: row });
    return row;
  }

  // Clear is_primary on all attr defs in the effective set for a type.
  // Covers both system-inherited and type-own primaries.
  // Call this before updateAttrDef(..., { is_primary: true, ... }).
  async function clearPrimaryForType(typeId) {
    let primaries = [];
    update(s => {
      primaries = (s.attrDefs[typeId] ?? []).filter(d => d.is_primary);
      return s;
    });
    for (const d of primaries) {
      await api.update('type_attributes', d.id, { is_primary: false });
    }
  }

  async function deleteAttrDef(id) {
    await api.delete('type_attributes', id);
    logger('Deleted attr def:', id);
    logAudit('delete', 'type_attribute', id, id, { ...AUDIT_OPTS });
  }

  // -- Type Attribute Options CRUD ---------------------------------------
  // type_attribute_options has no created_by / updated_by columns.
  async function createOption(data) {
    const row = await api.create('type_attribute_options', {
      type_attribute_id:  data.type_attribute_id,
      value:              data.value?.trim(),
      presentation_order: Number(data.presentation_order) || 0,
      visible:            data.visible                   ?? true,
      priority_override:  data.priority_override         || null
    });
    logAudit('create', 'type_attribute_option', row.id, row.value,
      { ...AUDIT_OPTS, afterData: row });
    return row;
  }

  async function updateOption(id, data) {
    const row = await api.update('type_attribute_options', id, {
      value:              data.value?.trim(),
      presentation_order: Number(data.presentation_order) || 0,
      visible:            data.visible,
      priority_override:  data.priority_override         || null
    });
    logAudit('update', 'type_attribute_option', id, row.value,
      { ...AUDIT_OPTS, afterData: row });
    return row;
  }

  async function deleteOption(id) {
    await api.delete('type_attribute_options', id);
    logger('Deleted option:', id);
    logAudit('delete', 'type_attribute_option', id, id, { ...AUDIT_OPTS });
  }

  return {
    reload,
    createSystem,  updateSystem,  deleteSystem,
    createType,    updateType,    deleteType,
    createAttrDef, updateAttrDef, clearPrimaryForType, deleteAttrDef,
    createOption,  updateOption,  deleteOption,
  };
}
