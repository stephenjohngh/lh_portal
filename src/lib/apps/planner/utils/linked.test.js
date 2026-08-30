// src/lib/apps/planner/utils/linked.test.js

import { describe, it, expect } from 'vitest';
import {
  fromMaintenanceJob, fromMeeting, fromAction, fromGtDocument,
  linkedOccurrences, filterLinked, SOURCES, visibleSources,
} from './linked.js';
import { agenda, bucketOf } from './agenda.js';

describe('fromMaintenanceJob', () => {
  it('shows a scheduled job on its date', () => {
    const item = fromMaintenanceJob({ id: 'j1', title: 'Boiler service', scheduled_date: '2026-03-01' });
    expect(item).toMatchObject({
      date: '2026-03-01', status: 'due', linked: true,
      source: 'maintenance', ownerApp: 'Maintenance',
    });
    expect(item.series.title).toBe('Boiler service');
    expect(item.series.category).toBe('maintenance');
  });

  it('shows a COMPLETED job on the day it was done, as done', () => {
    // Hiding finished work would make a busy year look empty — "the boiler was
    // serviced in March" is exactly what somebody looking at last spring wants.
    const item = fromMaintenanceJob({
      id: 'j2', title: 'Boiler service',
      scheduled_date: '2026-03-01', completed_date: '2026-03-04',
    });
    expect(item.date).toBe('2026-03-04');
    expect(item.status).toBe('done');
  });

  it('carries nothing of ours against it', () => {
    // The planner stores nothing about a foreign item, and must never look as
    // though it has.
    const item = fromMaintenanceJob({ id: 'j3', scheduled_date: '2026-03-01' });
    expect(item.id).toBeNull();
    expect(item.linked).toBe(true);
  });

  it('is dropped when there is no date to put it on', () => {
    expect(fromMaintenanceJob({ id: 'j4', title: 'No date' })).toBeNull();
    expect(fromMaintenanceJob(null)).toBeNull();
  });
});

describe('fromMeeting', () => {
  it('shows a meeting, closed ones as done', () => {
    expect(fromMeeting({ id: 'm1', title: 'Board', meeting_date: '2026-05-06' }))
      .toMatchObject({ date: '2026-05-06', status: 'due', ownerApp: 'Management' });
    expect(fromMeeting({ id: 'm2', title: 'Board', meeting_date: '2026-01-06', status: 'closed' }).status)
      .toBe('done');
  });
});

describe('fromAction', () => {
  it('shows an open deadline, with who has it', () => {
    const item = fromAction({
      id: 'a1', action_text: 'Chase the insurers',
      date_deadline: '2026-04-01', name_text: 'P. Shah',
    });
    expect(item).toMatchObject({ date: '2026-04-01', note: 'P. Shah' });
  });

  it('leaves out actions that are done', () => {
    // A year filled with every deadline ever set buries the handful that are
    // still somebody's problem.
    expect(fromAction({ id: 'a2', action_text: 'Done thing', date_deadline: '2026-01-01', status: 'completed' }))
      .toBeNull();
  });
});

describe('fromGtDocument', () => {
  it('shows a review falling due, as compliance', () => {
    const item = fromGtDocument({ id: 'd1', title: 'Fire strategy', review_due: '2026-09-30' });
    expect(item.series.title).toBe('Review: Fire strategy');
    expect(item.series.category).toBe('compliance');
    expect(item.date).toBe('2026-09-30');
  });
});

describe('linkedOccurrences', () => {
  const input = {
    jobs: [{ id: 'j1', title: 'Service', scheduled_date: '2026-03-01' }],
    meetings: [{ id: 'm1', title: 'AGM', meeting_date: '2026-01-15' }],
    actions: [{ id: 'a1', action_text: 'Chase', date_deadline: '2026-02-01' }],
    gtDocuments: [{ id: 'd1', title: 'FRA', review_due: '2026-04-01' }],
  };

  it('merges every source into one date order', () => {
    expect(linkedOccurrences(input).map(i => i.date))
      .toEqual(['2026-01-15', '2026-02-01', '2026-03-01', '2026-04-01']);
  });

  it('namespaces ids so a job and a planner event can never collide', () => {
    // They live in one list and are keyed together when rendered.
    expect(linkedOccurrences(input).map(i => i.event_id))
      .toEqual(['meeting:m1', 'action:a1', 'maintenance:j1', 'gt_review:d1']);
  });

  it('works with a source missing entirely', () => {
    // Somebody without the Golden Thread app passes nothing for it, and the
    // planner shows the rest rather than failing.
    expect(linkedOccurrences({ jobs: input.jobs })).toHaveLength(1);
    expect(linkedOccurrences()).toEqual([]);
  });
});

describe('filterLinked', () => {
  const items = linkedOccurrences({
    jobs: [{ id: 'j1', scheduled_date: '2026-03-01' }],
    meetings: [{ id: 'm1', meeting_date: '2026-03-02' }],
  });

  it('shows everything when nothing is switched off', () => {
    expect(filterLinked(items, null)).toHaveLength(2);
  });

  it('keeps only the sources asked for', () => {
    expect(filterLinked(items, ['maintenance']).map(i => i.source)).toEqual(['maintenance']);
    expect(filterLinked(items, [])).toEqual([]);
  });
});

describe('a linked item behaves like any other in the agenda', () => {
  // The whole point of giving them the occurrence shape: one bucketing, one
  // list, so a job scheduled last March sorts among the planner's own arrears
  // rather than in a separate list nobody reads.
  const today = '2026-06-15';

  it('is bucketed by its date, the same as a planner event', () => {
    const overdue = fromMaintenanceJob({ id: 'j1', scheduled_date: '2026-03-01' });
    const soon    = fromMaintenanceJob({ id: 'j2', scheduled_date: '2026-06-20' });
    const later   = fromMaintenanceJob({ id: 'j3', scheduled_date: '2026-12-01' });

    expect(bucketOf(overdue, today)).toBe('overdue');
    expect(bucketOf(soon, today)).toBe('due_soon');
    expect(bucketOf(later, today)).toBe('planned');
  });

  it('sorts among the planner own items', () => {
    const own = {
      date: '2026-03-05', status: 'due',
      series: { id: 'e1', title: 'Ours', category: 'other' },
    };
    const job = fromMaintenanceJob({ id: 'j1', scheduled_date: '2026-03-01' });

    const groups = agenda([own, job], today);
    expect(groups.overdue.map(i => i.date)).toEqual(['2026-03-01', '2026-03-05']);
  });
});

describe('SOURCES', () => {
  it('names the app that owns each kind, so a reader knows where to go', () => {
    expect(SOURCES.maintenance.app).toBe('Maintenance');
    expect(SOURCES.meeting.app).toBe('Management');
    expect(SOURCES.gt_review.app).toBe('Golden Thread');
  });

  it('names the PERMISSION that governs each kind', () => {
    // These are app_permissions.app_id values, not display names. A typo here
    // would fail open — the source would simply never be shown to anybody.
    expect(SOURCES.maintenance.appId).toBe('maintenance');
    expect(SOURCES.meeting.appId).toBe('management');
    expect(SOURCES.action.appId).toBe('management');
    expect(SOURCES.gt_review.appId).toBe('golden_thread');
  });
});

describe('visibleSources', () => {
  const withApps = (...ids) => ({
    isAdmin: false,
    appPermissions: Object.fromEntries(ids.map(id => [id, { hasAccess: true }])),
  });

  it('shows nothing from an app the user does not have', () => {
    // The caretaker: the planner and Maintenance, but not Management.
    const visible = visibleSources(withApps('planner', 'maintenance'));
    expect(visible.has('maintenance')).toBe(true);
    expect(visible.has('meeting')).toBe(false);
    expect(visible.has('action')).toBe(false);
    expect(visible.has('gt_review')).toBe(false);
  });

  it('treats meetings and action deadlines as one permission', () => {
    // Both come from Management, so one grant covers both and neither is
    // reachable without it.
    const visible = visibleSources(withApps('management'));
    expect(visible.has('meeting')).toBe(true);
    expect(visible.has('action')).toBe(true);
    expect(visible.has('maintenance')).toBe(false);
  });

  it('shows an admin everything', () => {
    expect(visibleSources({ isAdmin: true, appPermissions: {} }).size)
      .toBe(Object.keys(SOURCES).length);
  });

  it('shows nothing at all rather than everything when it knows nothing', () => {
    // The direction a bug here has to fail. An empty or missing permissions
    // state is "not established yet", never "allow the lot".
    expect(visibleSources({}).size).toBe(0);
    expect(visibleSources(null).size).toBe(0);
    expect(visibleSources(undefined).size).toBe(0);
    expect(visibleSources({ isAdmin: false, appPermissions: {} }).size).toBe(0);
  });

  it('does not count a permission row that grants no access', () => {
    expect(visibleSources({ appPermissions: { management: { hasAccess: false } } }).size)
      .toBe(0);
  });

  it('still shows a source to a read-only user of that app', () => {
    // Read-only is about writing. Somebody who may READ Management should see
    // its meetings here — the planner never offered to tick them anyway.
    const visible = visibleSources({
      appPermissions: { management: { hasAccess: true, isReadOnly: true } },
    });
    expect(visible.has('meeting')).toBe(true);
  });
});
