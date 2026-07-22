// src/lib/apps/maintenance/stores/maintenanceGroupsStore.js
// CRUD store for maintenance_groups — used by Admin > Maint. Groups and 10-Yr Plan tabs.

import { writable }   from 'svelte/store';
import { api }        from '$lib/utils/api';
import { supabase }   from '$lib/supabaseClient';
import { getLogger }  from '$lib/utils/logger';

const logger = getLogger('MaintenanceGroups');

function createMaintenanceGroupsStore() {
  const { subscribe, update } = writable({
    groups:  [],
    loading: false,
    error:   null,
    jobHistory:        [],      // completed maintenance_jobs (enriched w/ componentIds) — R2 suggestions
    jobHistoryLoaded:  false,
  });

  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const groups = await api.get('maintenance_groups', { orderBy: 'name' });
      update(s => ({ ...s, groups, loading: false }));
      logger('Loaded', groups.length, 'maintenance groups');
    } catch (err) {
      update(s => ({ ...s, error: err.message, loading: false }));
      throw err;
    }
  }

  async function userId() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  }

  // Completed maintenance jobs (+ their component links for component-scoped jobs),
  // used to SUGGEST a last-renewal date per group (R2). Read-only, cross-app read
  // of the Maintenance app's tables; non-fatal if it fails (suggestions are optional).
  async function loadJobHistory() {
    try {
      const jobs = await api.getAll('maintenance_jobs', {
        select:  'id, title, completed_date, status, scope_type, scope_id, scope_label',
        filters: { status: 'completed' },
      });
      const compJobIds = jobs.filter(j => j.scope_type === 'component').map(j => j.id);
      const byJob = {};
      if (compJobIds.length) {
        const links = await api.getAllIn('maintenance_job_components', 'job_id', compJobIds, {
          select: 'job_id, component_id',
        });
        for (const l of links) (byJob[l.job_id] ??= []).push(l.component_id);
      }
      const jobHistory = jobs.map(j => ({ ...j, componentIds: byJob[j.id] ?? [] }));
      update(s => ({ ...s, jobHistory, jobHistoryLoaded: true }));
      logger('Loaded', jobHistory.length, 'completed jobs for renewal suggestions');
    } catch (err) {
      update(s => ({ ...s, jobHistoryLoaded: true }));
      logger('Job history load failed (suggestions disabled):', err.message);
    }
  }

  async function create(data) {
    const uid = await userId();
    const group = await api.create('maintenance_groups', {
      name:              data.name.trim(),
      system_ids:        data.system_ids        ?? [],
      type_codes:        data.type_codes        ?? [],
      space_ids:         data.space_ids         ?? [],
      last_renewal_date: data.last_renewal_date || null,
      lifetime_years:    data.lifetime_years    ?? null,
      expected_cost:     data.expected_cost     ?? null,
      notes:             data.notes?.trim()     || null,
      created_by:        uid,
      updated_by:        uid,
    });
    update(s => ({
      ...s,
      groups: [...s.groups, group].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    logger('Created group:', group.id, group.name);
    return group;
  }

  async function save(id, data) {
    const uid = await userId();
    const updated = await api.update('maintenance_groups', id, {
      name:              data.name.trim(),
      system_ids:        data.system_ids        ?? [],
      type_codes:        data.type_codes        ?? [],
      space_ids:         data.space_ids         ?? [],
      last_renewal_date: data.last_renewal_date || null,
      lifetime_years:    data.lifetime_years    ?? null,
      expected_cost:     data.expected_cost     ?? null,
      notes:             data.notes?.trim()     || null,
      updated_by:        uid,
    });
    update(s => ({
      ...s,
      groups: s.groups
        .map(g => g.id === id ? { ...g, ...updated } : g)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    logger('Saved group:', id, updated.name);
    return updated;
  }

  // Convenience: save only the planning fields (used by TenYearPlanTab)
  async function savePlan(id, data) {
    const uid = await userId();
    const patch = {
      last_renewal_date: data.last_renewal_date || null,
      lifetime_years:    data.lifetime_years    ?? null,
      expected_cost:     data.expected_cost     ?? null,
      notes:             data.notes?.trim()     || null,
      updated_by:        uid,
    };
    // Only touch plan_overrides when the caller explicitly passes it — otherwise a
    // plain plan-data save would wipe the planner's per-year overrides (jsonb, mig 171).
    if (data.plan_overrides !== undefined) patch.plan_overrides = data.plan_overrides;

    const updated = await api.update('maintenance_groups', id, patch);
    update(s => ({
      ...s,
      groups: s.groups.map(g => g.id === id ? { ...g, ...updated } : g),
    }));
    logger('Saved plan data for group:', id);
    return updated;
  }

  async function remove(id) {
    await api.delete('maintenance_groups', id);
    update(s => ({ ...s, groups: s.groups.filter(g => g.id !== id) }));
    logger('Deleted group:', id);
  }

  return { subscribe, load, loadJobHistory, create, save, savePlan, remove };
}

export const maintenanceGroupsStore = createMaintenanceGroupsStore();
