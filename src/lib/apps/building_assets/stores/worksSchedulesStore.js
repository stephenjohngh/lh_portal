// src/lib/apps/building_assets/stores/worksSchedulesStore.js
// Works schedules — a named list of components and what should be done to each.
//
// Kept out of buildingAssetsStore, which is already an orchestrator of five
// action modules and is loaded on every visit to the app. Schedules are a
// distinct, occasional activity with their own tables; folding them in would
// make the main store larger for everyone to serve a minority of sessions.
//
// The rule that shapes this file: **applying a schedule writes to asset
// records, so nothing is written until a person has seen what will change.**
// The decision itself is pure (utils/worksSchedule.js); this only persists it.

import { writable, get } from 'svelte/store';
import { api }        from '$lib/utils/api';
import { logAudit }   from '$lib/utils/auditLogger';
import { getLogger }  from '$lib/utils/logger';
import { replaceComponentAttributes } from '../public.js';
import { planApply, describeSummary } from '../utils/worksSchedule.js';

const logger = getLogger('worksSchedules');

const touch = (userId) => ({ updated_by: userId, updated_at: new Date().toISOString() });

function errMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

function createWorksSchedulesStore() {
  const store = writable({
    schedules: [],
    loading:   false,
    error:     null,
    /** Items of the schedule currently open, with their component joined. */
    items:     [],
    loadingItems: false,
    /** Current attribute values for those items' components, by component id. */
    attributes: {},
  });

  const { subscribe, update } = store;
  const getState = () => get(store);

  // ── Schedules ────────────────────────────────────────────────────────────

  async function loadSchedules() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const schedules = await api.get('works_schedules', {
        orderBy: 'created_at', ascending: false,
      });
      update(s => ({ ...s, schedules, loading: false }));
      return schedules;
    } catch (err) {
      update(s => ({ ...s, error: errMessage(err), loading: false }));
      throw err;
    }
  }

  /**
   * Create a schedule from a set of components — normally the filtered list on
   * the Components tab, which is why this takes ids rather than a query: what
   * the author selected is what they saw, and re-running a filter here could
   * quietly include something that has changed since.
   *
   * @param {object} data      title, reference, purpose, contractor, notes
   * @param {string[]} componentIds
   * @param {string} userId
   */
  async function createSchedule(data, componentIds, userId) {
    const schedule = await api.create('works_schedules', {
      title:           data.title,
      reference:       data.reference || null,
      purpose:         data.purpose || 'quote',
      status:          'draft',
      contractor_id:   data.contractor_id || null,
      contractor_name: data.contractor_name || null,
      notes:           data.notes || null,
      created_by:      userId,
      ...touch(userId),
    }, true);

    if (componentIds?.length) {
      await addItems(schedule.id, componentIds, data.action ?? 'replace', userId);
    }

    update(s => ({ ...s, schedules: [schedule, ...s.schedules] }));
    logAudit('create', 'works_schedule', schedule.id, schedule.title, {
      appId: 'building_assets', eventCategory: 'building_assets', severity: 'info',
      afterData: { purpose: schedule.purpose, items: componentIds?.length ?? 0 },
    });
    return schedule;
  }

  async function updateSchedule(id, fields, userId) {
    const schedule = await api.update('works_schedules', id,
      { ...fields, ...touch(userId) }, true);

    update(s => ({ ...s, schedules: s.schedules.map(x => x.id === id ? schedule : x) }));
    logAudit('update', 'works_schedule', id, schedule.title, {
      appId: 'building_assets', eventCategory: 'building_assets', severity: 'info',
      afterData: fields,
    });
    return schedule;
  }

  /** Issue it — the moment it stops being a draft and becomes a document sent out. */
  async function issueSchedule(id, userId) {
    return updateSchedule(id, { status: 'issued', issued_at: new Date().toISOString() }, userId);
  }

  async function deleteSchedule(id, title) {
    await api.delete('works_schedules', id);
    update(s => ({ ...s, schedules: s.schedules.filter(x => x.id !== id) }));
    logAudit('delete', 'works_schedule', id, title, {
      appId: 'building_assets', eventCategory: 'building_assets', severity: 'warning',
    });
  }

  // ── Items ────────────────────────────────────────────────────────────────

  async function loadItems(scheduleId) {
    if (!scheduleId) { update(s => ({ ...s, items: [], attributes: {} })); return []; }
    update(s => ({ ...s, loadingItems: true }));
    try {
      const items = await api.get('works_schedule_items', {
        select: '*, component:components(id, asset_id, label, type_code, status, floor_id, plan_id)',
        filters: { schedule_id: scheduleId },
        orderBy: 'position', ascending: true,
      });

      // Current attribute values, so the apply preview can tell a real change
      // from a value that is already right.
      const componentIds = items.map(i => i.component_id);
      const attributes = await loadAttributes(componentIds);

      update(s => ({ ...s, items, attributes, loadingItems: false }));
      return items;
    } catch (err) {
      update(s => ({ ...s, error: errMessage(err), loadingItems: false }));
      throw err;
    }
  }

  /** { componentId: { type_attribute_id: value } } */
  async function loadAttributes(componentIds) {
    if (!componentIds?.length) return {};
    const rows = await api.getAllIn('component_attributes', 'component_id', componentIds);
    const byComponent = {};
    for (const row of rows) {
      (byComponent[row.component_id] ??= {})[row.type_attribute_id] = row.value;
    }
    return byComponent;
  }

  /**
   * Add components to a schedule.
   *
   * Anything already on it is skipped rather than rejected — adding a filtered
   * list twice is an ordinary thing to do, and the unique index would otherwise
   * fail the whole batch over one duplicate.
   */
  async function addItems(scheduleId, componentIds, action, userId) {
    const existing = await api.get('works_schedule_items', {
      select: 'component_id', filters: { schedule_id: scheduleId },
    });
    const have = new Set(existing.map(r => r.component_id));
    const fresh = [...new Set(componentIds)].filter(id => !have.has(id));
    if (!fresh.length) return [];

    const base = existing.length;
    const rows = fresh.map((component_id, i) => ({
      schedule_id: scheduleId,
      component_id,
      action: action || 'replace',
      position: base + i,
      created_by: userId,
      ...touch(userId),
    }));

    await api.createMany('works_schedule_items', rows, false);
    return rows;
  }

  async function updateItem(id, fields, userId) {
    const item = await api.update('works_schedule_items', id,
      { ...fields, ...touch(userId) }, true);
    update(s => ({
      ...s,
      items: s.items.map(x => x.id === id ? { ...x, ...item } : x),
    }));
    return item;
  }

  async function removeItem(id) {
    await api.delete('works_schedule_items', id);
    update(s => ({ ...s, items: s.items.filter(x => x.id !== id) }));
  }

  /**
   * Set the same action on every line of a schedule — how one is usually
   * started: forty failed fittings, all to be replaced, then a couple changed
   * by hand afterwards.
   *
   * Scoped by schedule_id rather than a list of item ids because api.updateMany
   * filters with `.eq` per key: an array would become `.eq('id', [...])` and
   * match nothing. One statement for the common case, updateItem() for the
   * exceptions.
   */
  async function setActionForAll(scheduleId, action, userId) {
    await api.updateMany('works_schedule_items', { schedule_id: scheduleId },
      { action, ...touch(userId) }, false);
    update(s => ({ ...s, items: s.items.map(x => ({ ...x, action })) }));
  }

  // ── Applying ─────────────────────────────────────────────────────────────

  /**
   * What applying would change — computed, never written. The caller shows this
   * and only then calls applyChanges().
   *
   * @param {string} userId
   */
  function previewApply(userId) {
    const { items, attributes } = getState();
    const components = items.map(i => i.component).filter(Boolean);
    return planApply(items, components, { userId, attributes });
  }

  /**
   * Write the changes a person has just seen and accepted.
   *
   * Per item, in order, rather than one bulk statement: each line touches a
   * different component and may touch its attributes too, and a partial failure
   * must leave the lines that succeeded marked as applied. A schedule half
   * carried out is a real state — work comes back in parts — so the design point
   * is that re-running it picks up exactly what is left.
   *
   * @param {{ item: object, component: object, patch: object|null, attrs: object|null }[]} changes
   * @param {string} userId
   * @returns {Promise<{ applied: number, failed: { item: object, error: string }[] }>}
   */
  async function applyChanges(changes, userId) {
    const at = new Date().toISOString();
    const failed = [];
    let applied = 0;

    for (const change of changes) {
      try {
        if (change.patch) {
          await api.update('components', change.component.id, change.patch, false);
        }
        if (change.attrs) {
          await replaceComponentAttributes(change.component.id, change.attrs);
        }

        await api.update('works_schedule_items', change.item.id,
          { applied_at: at, applied_by: userId, ...touch(userId) }, false);

        // Audited against the COMPONENT, not the schedule: "what has happened to
        // this asset" is the question someone asks later, and it is asked of the
        // asset.
        logAudit('update', 'component', change.component.id,
          change.component.asset_id || change.component.label || 'Component', {
            appId: 'building_assets', eventCategory: 'building_assets', severity: 'info',
            beforeData: { status: change.component.status, type_code: change.component.type_code },
            afterData:  { ...change.patch, attributes: change.attrs ?? undefined,
                          works_schedule_item: change.item.id },
          });
        applied++;
      } catch (err) {
        failed.push({ item: change.item, error: errMessage(err) });
      }
    }

    logger('✅ applied', applied, 'of', changes.length, 'schedule lines');
    return { applied, failed };
  }

  /** Mark the whole schedule done, once its lines have been applied. */
  async function completeSchedule(id, userId) {
    return updateSchedule(id,
      { status: 'completed', completed_at: new Date().toISOString() }, userId);
  }

  function closeSchedule() {
    update(s => ({ ...s, items: [], attributes: {} }));
  }

  return {
    subscribe,
    loadSchedules, createSchedule, updateSchedule, issueSchedule, deleteSchedule,
    loadItems, addItems, updateItem, removeItem, setActionForAll,
    previewApply, applyChanges, completeSchedule, closeSchedule,
    describeSummary,
  };
}

export const worksSchedulesStore = createWorksSchedulesStore();
