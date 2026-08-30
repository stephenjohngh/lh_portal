// src/lib/apps/planner/stores/plannerStore.js
// The planner's state: series, and the occurrences somebody has touched.
//
// The store holds ROWS. It does not expand recurrence, decide what is overdue,
// or work out what a tick means — that is all pure and lives in utils/, where
// it can be tested without a database. This file is the I/O seam and nothing
// more, which is what makes the rest of the app testable.

import { writable, get } from 'svelte/store';
import { api } from '$lib/utils/api';
import { logAudit } from '$lib/utils/auditLogger';
import { getLogger } from '$lib/utils/logger';
import { completionPatch, STATUS } from '../utils/agenda.js';
import { linkedOccurrences } from '../utils/linked.js';
import { uniqueSlug } from '../utils/categories.js';
import { listScheduledWork, createJobFromPlanner } from '$lib/apps/maintenance/public.js';
import { listMeetings, listOpenActionDeadlines } from '$lib/apps/management/public.js';
import { listReviewsDue } from '$lib/apps/golden_thread/public.js';

const logger = getLogger('planner');

const touch = (userId) => ({ updated_by: userId, updated_at: new Date().toISOString() });

function errMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

function createPlannerStore() {
  const store = writable({
    events: [],
    occurrences: [],
    /** The building's own categories — see migration 179. */
    categories: [],
    /** Other apps' dated items — read-only, never written back. */
    linked: [],
    loadingLinked: false,
    loading: false,
    error: null,
  });

  const { subscribe, update } = store;
  const getState = () => get(store);

  /**
   * Everything, in two queries.
   *
   * The whole planner is loaded rather than a window of it: a building's year
   * is tens of series and a few hundred touched occurrences, and paging that
   * would cost more in round trips and complexity than it saves. If a building
   * ever has thousands, the window is a filter on occurs_on and this comment is
   * where to start.
   */
  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const [events, occurrences, categories] = await Promise.all([
        api.get('planner_events', { orderBy: 'start_date', ascending: true }),
        api.getAll('planner_occurrences', { orderBy: 'occurs_on' }),
        api.get('planner_categories', { orderBy: 'position' }),
      ]);
      update(s => ({ ...s, events, occurrences, categories, loading: false }));
      logger('✅ loaded', events.length, 'series,', occurrences.length, 'recorded occurrences');
      return events;
    } catch (err) {
      update(s => ({ ...s, error: errMessage(err), loading: false }));
      throw err;
    }
  }

  /**
   * What the other apps have in this window.
   *
   * Each source is read through the OWNING app's public.js, and each is allowed
   * to fail on its own. A user without the Golden Thread permission gets a
   * rejected promise for that one source; the planner shows maintenance and
   * meetings anyway rather than an error page. That is the difference between
   * an aggregate view and a dependency.
   *
   * Never written back. Completing any of these happens in the app that owns
   * it — see utils/linked.js for why.
   */
  async function loadLinked(from, to) {
    update(s => ({ ...s, loadingLinked: true }));

    const [jobs, meetings, actions, gtDocuments] = await Promise.all([
      listScheduledWork(from, to).catch(fellShort('maintenance jobs')),
      listMeetings(from, to).catch(fellShort('meetings')),
      listOpenActionDeadlines(from, to).catch(fellShort('action deadlines')),
      listReviewsDue(from, to).catch(fellShort('Golden Thread reviews')),
    ]);

    const linked = linkedOccurrences({ jobs, meetings, actions, gtDocuments });
    update(s => ({ ...s, linked, loadingLinked: false }));
    return linked;
  }

  /** One source being unavailable is a gap in the view, not a failure of it. */
  function fellShort(what) {
    return (err) => {
      logger('⚠ could not read', what, '—', errMessage(err));
      return [];
    };
  }

  // ── Series ────────────────────────────────────────────────────────────────

  async function createEvent(data, userId) {
    const event = await api.create('planner_events', {
      ...data,
      created_by: userId,
      ...touch(userId),
    }, true);

    update(s => ({ ...s, events: [...s.events, event] }));
    logAudit('create', 'planner_event', event.id, event.title, {
      appId: 'planner', eventCategory: 'planner', severity: 'info',
      afterData: { start_date: event.start_date, recurrence: event.recurrence, drifts: event.drifts },
    });
    return event;
  }

  async function updateEvent(id, fields, userId) {
    const event = await api.update('planner_events', id, { ...fields, ...touch(userId) }, true);

    update(s => ({ ...s, events: s.events.map(e => (e.id === id ? event : e)) }));
    logAudit('update', 'planner_event', id, event.title, {
      appId: 'planner', eventCategory: 'planner', severity: 'info', afterData: fields,
    });
    return event;
  }

  /**
   * Archive rather than delete, by default.
   *
   * A series that ran for three years and then stopped is history: its
   * occurrences record work that was done, and deleting the series would take
   * them with it (the FK cascades). Archiving keeps the record and takes the
   * series out of the year.
   */
  async function archiveEvent(id, archived, userId) {
    return updateEvent(id, { archived }, userId);
  }

  async function deleteEvent(id, title) {
    await api.delete('planner_events', id);
    update(s => ({
      ...s,
      events: s.events.filter(e => e.id !== id),
      occurrences: s.occurrences.filter(o => o.event_id !== id),
    }));
    logAudit('delete', 'planner_event', id, title, {
      appId: 'planner', eventCategory: 'planner', severity: 'warning',
    });
  }

  /**
   * Hand a planner event to the app that should own it.
   *
   * Two writes, in an order that matters. The job is created FIRST: if the
   * second write fails, the planner still owns its event and the worst outcome
   * is a job somebody has to tidy up. Marking the event first and failing to
   * create the job would leave an event that produces no dates and points at
   * nothing — invisible work, which is the failure this app exists to prevent.
   *
   * Not a transaction, because it crosses two apps through a public interface
   * rather than one table. The ordering is the guarantee.
   *
   * @param {object} event      the planner series
   * @param {string} onDate     which occurrence becomes the job
   * @param {string} userId
   */
  async function promoteToMaintenance(event, onDate, userId) {
    const job = await createJobFromPlanner({
      title: event.title,
      description: event.description,
      scheduled_date: onDate,
      source_id: event.id,
    }, userId);

    const updated = await api.update('planner_events', event.id, {
      promoted_type: 'maintenance_job',
      promoted_id: job.id,
      promoted_at: new Date().toISOString(),
      promoted_by: userId,
      ...touch(userId),
    }, true);

    update(s => ({ ...s, events: s.events.map(e => (e.id === event.id ? updated : e)) }));

    logAudit('update', 'planner_event', event.id, event.title, {
      appId: 'planner', eventCategory: 'planner', severity: 'info',
      afterData: { promoted_type: 'maintenance_job', promoted_id: job.id, scheduled_date: onDate },
    });

    // The new job will not appear until the aggregation is read again — it did
    // not exist when the planner last asked.
    return { job, event: updated };
  }

  // ── Categories ────────────────────────────────────────────────────────────

  /**
   * Add a category.
   *
   * The slug is generated once, here, and never again. It is what events are
   * filed under, so regenerating it on a rename would orphan every event using
   * it — which is why renaming only ever touches `name`.
   */
  async function createCategory({ name, colour }, userId) {
    const slug = uniqueSlug(name, getState().categories);
    const position = getState().categories.length + 1;

    const row = await api.create('planner_categories', {
      slug, name, colour, position,
      system: false,
      created_by: userId,
      ...touch(userId),
    }, true);

    update(s => ({ ...s, categories: [...s.categories, row] }));
    logAudit('create', 'planner_category', row.id, row.name, {
      appId: 'planner', eventCategory: 'planner', severity: 'info',
      afterData: { slug, colour },
    });
    return row;
  }

  /** Rename or recolour. Never the slug — see createCategory. */
  async function updateCategory(id, { name, colour, archived }, userId) {
    const fields = {};
    if (name !== undefined)     fields.name = name;
    if (colour !== undefined)   fields.colour = colour;
    if (archived !== undefined) fields.archived = archived;

    const row = await api.update('planner_categories', id, { ...fields, ...touch(userId) }, true);

    update(s => ({ ...s, categories: s.categories.map(c => (c.id === id ? row : c)) }));
    logAudit('update', 'planner_category', id, row.name, {
      appId: 'planner', eventCategory: 'planner', severity: 'info', afterData: fields,
    });
    return row;
  }

  /**
   * Remove a category the building added.
   *
   * A system one cannot go: utils/linked.js files every maintenance job,
   * meeting, action and review under one of four slugs, and removing one would
   * leave those items uncategorised with no way to put it right. The database
   * refuses it too — this is the message, not the control.
   */
  async function deleteCategory(id, name) {
    const category = getState().categories.find(c => c.id === id);
    if (category?.system) {
      throw new Error(`“${name}” is used to file items from other apps, so it cannot be removed. It can be renamed.`);
    }

    await api.delete('planner_categories', id);
    update(s => ({ ...s, categories: s.categories.filter(c => c.id !== id) }));
    logAudit('delete', 'planner_category', id, name, {
      appId: 'planner', eventCategory: 'planner', severity: 'warning',
    });
  }

  // ── Occurrences ───────────────────────────────────────────────────────────

  /**
   * Record something against one occurrence — tick, un-tick, skip, annotate.
   *
   * Upserted on (event_id, occurs_on), because an occurrence has no row until
   * this moment: what is being written may be the first thing anyone has ever
   * said about that date.
   *
   * What the patch MEANS is decided by `completionPatch`, which is pure and
   * tested — including the rule that completing something records the day it was
   * actually done rather than the day it was due.
   */
  async function recordOccurrence(occurrence, { status, on = null, note = null }, userId) {
    const patch = completionPatch(occurrence, { status, on, note, userId });

    const row = await api.upsert('planner_occurrences', {
      ...patch,
      created_by: userId,
    }, { onConflict: 'event_id,occurs_on' });

    update(s => ({
      ...s,
      occurrences: [...s.occurrences.filter(o => o.id !== row.id), row],
    }));

    logAudit('update', 'planner_occurrence', row.id, occurrence.series?.title ?? 'Occurrence', {
      appId: 'planner', eventCategory: 'planner', severity: 'info',
      afterData: { occurs_on: patch.occurs_on, status, completed_on: patch.completed_on },
    });
    return row;
  }

  /**
   * Move ONE occurrence to another date.
   *
   * Never the series: "the contractor is coming on the Thursday instead" says
   * nothing about next month. The rule is untouched and `occurs_on` still holds
   * the date it was meant to be.
   */
  async function moveOccurrence(occurrence, toDate, userId) {
    const row = await api.upsert('planner_occurrences', {
      event_id: occurrence.event_id,
      occurs_on: occurrence.scheduled_for,
      moved_to: toDate,
      status: occurrence.status ?? STATUS.DUE,
      created_by: userId,
      ...touch(userId),
    }, { onConflict: 'event_id,occurs_on' });

    update(s => ({
      ...s,
      occurrences: [...s.occurrences.filter(o => o.id !== row.id), row],
    }));

    logAudit('update', 'planner_occurrence', row.id, occurrence.series?.title ?? 'Occurrence', {
      appId: 'planner', eventCategory: 'planner', severity: 'info',
      afterData: { occurs_on: occurrence.scheduled_for, moved_to: toDate },
    });
    return row;
  }

  function clearError() {
    update(s => ({ ...s, error: null }));
  }

  return {
    subscribe,
    load, loadLinked,
    createEvent, updateEvent, archiveEvent, deleteEvent,
    promoteToMaintenance,
    createCategory, updateCategory, deleteCategory,
    recordOccurrence, moveOccurrence,
    clearError,
    /** For tests and for callers that need a snapshot without subscribing. */
    snapshot: getState,
  };
}

export const plannerStore = createPlannerStore();
