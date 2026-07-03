// src/lib/apps/admin/stores/inspectionDefinitionsStore.js
// CRUD store for inspection_definitions — used by Admin > Inspections tab.
//
// Definitions are portal config (like component_types): admins create/edit them
// here; the mobile Inspection app and the Building Assets "Inspections" tab READ
// them directly (api.get) and derive due/overdue via computeInspectionSchedule.
// Writes are admin-only at RLS (migration 153).

import { writable }  from 'svelte/store';
import { api }       from '$lib/utils/api';
import { supabase }  from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';
import { logAudit }  from '$lib/utils/auditLogger';

const logger = getLogger('InspectionDefinitions');

/**
 * @typedef {import('$lib/database.types').Tables<'inspection_definitions'>} InspectionDefinition
 * @typedef {{ definitions: InspectionDefinition[], loading: boolean, error: string|null }} State
 */

function byOrderThenName(a, b) {
  if (a.presentation_order !== b.presentation_order) return a.presentation_order - b.presentation_order;
  return (a.name ?? '').localeCompare(b.name ?? '');
}

// Build the persisted row from form data. `mode` gates which extra fields carry
// meaning, but we always store defensible defaults so a mode switch is clean.
function toRow(data, uid, { isCreate }) {
  const mode = data.mode === 'rotating' ? 'rotating' : 'standard';
  const row = {
    name:               (data.name ?? '').trim(),
    description:        data.description?.trim() || null,
    active:             data.active ?? true,
    mode,
    scope:              data.scope ?? {},
    checklist_mode:     data.checklist_mode === 'explicit' ? 'explicit' : 'type_driven',
    checklist_attr_ids: Array.isArray(data.checklist_attr_ids) ? data.checklist_attr_ids : [],
    pass_fail_rule:     data.pass_fail_rule === 'all_checks_pass' ? 'all_checks_pass' : 'manual',
    frequency_days:     data.frequency_days == null || data.frequency_days === '' ? null : Number(data.frequency_days),
    // Rotating-only; harmless defaults when standard.
    link_source:        data.link_source === 'self_only' ? 'self_only' : 'component_links',
    link_type_filter:   data.link_type_filter?.trim() || null,
    presentation_order: data.presentation_order ?? 0,
    updated_by:         uid,
  };
  if (isCreate) row.created_by = uid;
  return row;
}

function createInspectionDefinitionsStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    definitions: [], loading: false, error: null,
  }));

  async function userId() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  }

  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const definitions = await api.get('inspection_definitions', { orderBy: 'presentation_order' });
      definitions.sort(byOrderThenName);
      update(s => ({ ...s, definitions, loading: false }));
      logger('Loaded', definitions.length, 'inspection definitions');
    } catch (err) {
      update(s => ({ ...s, error: err.message, loading: false }));
      throw err;
    }
  }

  async function create(data) {
    const uid = await userId();
    const def = await api.create('inspection_definitions', toRow(data, uid, { isCreate: true }));
    update(s => ({ ...s, definitions: [...s.definitions, def].sort(byOrderThenName) }));
    logAudit('create', 'inspection_definition', def.id, def.name, {
      appId: 'admin', eventCategory: 'admin', severity: 'info',
      afterData: { mode: def.mode, frequency_days: def.frequency_days },
    });
    logger('Created definition:', def.id, def.name);
    return def;
  }

  async function save(id, data) {
    const uid = await userId();
    const updated = await api.update('inspection_definitions', id, toRow(data, uid, { isCreate: false }));
    update(s => ({
      ...s,
      definitions: s.definitions.map(d => d.id === id ? { ...d, ...updated } : d).sort(byOrderThenName),
    }));
    logAudit('update', 'inspection_definition', id, updated.name, {
      appId: 'admin', eventCategory: 'admin', severity: 'info',
      afterData: { mode: updated.mode, frequency_days: updated.frequency_days, active: updated.active },
    });
    logger('Saved definition:', id, updated.name);
    return updated;
  }

  async function remove(id) {
    const name = getName(id);
    await api.delete('inspection_definitions', id);
    update(s => ({ ...s, definitions: s.definitions.filter(d => d.id !== id) }));
    logAudit('delete', 'inspection_definition', id, name, {
      appId: 'admin', eventCategory: 'admin', severity: 'warning',
    });
    logger('Deleted definition:', id);
  }

  // Read the current cached name for a definition (for audit before delete).
  let _snapshot = [];
  subscribe(s => { _snapshot = s.definitions; });
  function getName(id) { return _snapshot.find(d => d.id === id)?.name ?? null; }

  return { subscribe, load, create, save, remove };
}

export const inspectionDefinitionsStore = createInspectionDefinitionsStore();
