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
import { planApply, describeSummary, matchingLines } from '../utils/worksSchedule.js';

const logger = getLogger('worksSchedules');

/** portal_settings key holding the withdrawn wordings. */
const HIDDEN_SPECS_KEY = 'works_hidden_specs';

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
    /** Specifications used before, one row per line — the suggestion source. */
    specs: [],
    /** Wordings withdrawn from the suggestion list. */
    hiddenSpecs: [],
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
        // x_position/y_position are needed by the plan peek. A joined select
        // names its columns explicitly, so a field that is never asked for is
        // simply absent at the far end — which reads as "no position set"
        // rather than as a missing query.
        select: '*, component:components(id, asset_id, label, type_code, status, '
              + 'floor_id, plan_id, x_position, y_position)',
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

  /**
   * Every specification already written — what the spec field offers, and what
   * the management panel groups.
   *
   * Drawn from history rather than a curated list, so it needs no setting up
   * and is right by construction: the things this building's schedules actually
   * specify. A preset library would be a table, a form and a maintenance burden
   * to arrive at the same place more slowly.
   *
   * Kept as raw rows, one per line, because the counts are what tell a settled
   * wording from a one-off mistake. Capped: only the most recent few hundred
   * lines matter — a specification nobody has used in two years is not a
   * suggestion, it is clutter.
   */
  async function loadSpecs() {
    const rows = await api.get('works_schedule_items', {
      select: 'spec, target_type_code, schedule_id',
      orderBy: 'created_at', ascending: false, limit: 400,
    });

    const specs = rows
      .filter(r => r.spec?.trim())
      .map(r => ({
        spec: r.spec.trim(),
        target_type_code: r.target_type_code ?? null,
        schedule_id: r.schedule_id,
      }));

    update(s => ({ ...s, specs }));
    return specs;
  }

  /**
   * Wordings withdrawn from the suggestion list.
   *
   * A portal setting rather than a per-browser preference: a mistyped
   * specification is wrong for everyone who writes a schedule, not just for
   * whoever noticed. Lives in the existing key/value table, so it costs no
   * migration.
   */
  async function loadHiddenSpecs() {
    try {
      const rows = await api.get('portal_settings', {
        select: 'key, value', filters: { key: HIDDEN_SPECS_KEY },
      });
      const hiddenSpecs = rows[0]?.value ?? [];
      update(s => ({ ...s, hiddenSpecs }));
      return hiddenSpecs;
    } catch (err) {
      // Never fatal: without it every wording is simply still offered.
      logger('⚠ Could not read withdrawn specifications:', errMessage(err));
      return [];
    }
  }

  async function setSpecHidden(spec, hidden, userId) {
    const current = getState().hiddenSpecs;
    const next = hidden
      ? [...new Set([...current, spec])]
      : current.filter(x => x !== spec);

    await api.upsert('portal_settings',
      { key: HIDDEN_SPECS_KEY, value: next, updated_by: userId },
      { onConflict: 'key' });

    update(s => ({ ...s, hiddenSpecs: next }));
    logAudit('update', 'portal_setting', HIDDEN_SPECS_KEY, 'Withdrawn specifications', {
      appId: 'building_assets', eventCategory: 'building_assets', severity: 'info',
      afterData: { spec, hidden },
    });
    return next;
  }

  /**
   * Correct a wording everywhere it is used — the fix a wrong suggestion
   * actually needs, since the list is only a view of what the lines say.
   *
   * Confined to schedules still in DRAFT. An issued schedule is the document a
   * contractor holds; rewriting its specification would leave the register
   * disagreeing with the paper, and no suggestion list is worth that. Those
   * wordings are withdrawn instead.
   *
   * Passing an empty replacement clears the specification on those lines.
   */
  async function renameSpec(from, to, userId) {
    const draftIds = new Set(
      getState().schedules.filter(x => x.status === 'draft').map(x => x.id));

    // Narrowed at the database, then checked again here: the stored text may
    // carry whitespace the suggestion list trimmed away, so the equality filter
    // is a way of not reading every line, not the test itself.
    const rows = await api.getAll('works_schedule_items', {
      select: 'id, schedule_id, spec', filters: { spec: from },
    });
    const targets = rows.filter(r =>
      r.spec?.trim() === from && draftIds.has(r.schedule_id));

    const value = to?.trim() || null;
    const stamp = touch(userId);
    for (const row of targets) {
      await api.update('works_schedule_items', row.id, { spec: value, ...stamp }, false);
    }

    await loadSpecs();
    if (getState().items.some(x => x.spec?.trim() === from)) {
      update(s => ({
        ...s,
        items: s.items.map(x => x.spec?.trim() === from ? { ...x, spec: value } : x),
      }));
    }

    logAudit('update', 'works_schedule_spec', from, from, {
      appId: 'building_assets', eventCategory: 'building_assets', severity: 'info',
      afterData: { from, to: value, lines: targets.length },
    });
    return targets.length;
  }

  /**
   * Write the same fields to every line doing the same thing.
   *
   * The multiplier this feature needed: forty identical fittings are specified
   * once. `countMatchingLines` decides the set — same action, and same
   * replacement type where the action fits something — so the offer the author
   * accepted and the rows written are the same set by construction.
   *
   * Line by line rather than one `updateMany`, because the set excludes work
   * already carried out and `updateMany` filters are all equality: "applied_at
   * is null" cannot be expressed there, and a bulk statement would quietly
   * rewrite the specification of work already done.
   */
  async function applyToMatching(scheduleId, answer, fields, userId) {
    // Filtered by schedule as well as by the answer: `items` holds whatever
    // schedule is open, and writing another one's lines from here would be
    // invisible to the person doing it.
    const targets = matchingLines(
      getState().items.filter(x => x.schedule_id === scheduleId), answer
    ).map(x => x.id);
    const stamp = touch(userId);

    for (const id of targets) {
      await api.update('works_schedule_items', id, { ...fields, ...stamp }, false);
    }

    update(s => ({
      ...s,
      items: s.items.map(x => targets.includes(x.id) ? { ...x, ...fields } : x),
    }));
    return targets.length;
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
    loadSpecs, loadHiddenSpecs, setSpecHidden, renameSpec, applyToMatching,
    previewApply, applyChanges, completeSchedule, closeSchedule,
    describeSummary,
  };
}

export const worksSchedulesStore = createWorksSchedulesStore();
