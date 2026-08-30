// src/lib/apps/planner/utils/agenda.test.js

import { describe, it, expect } from 'vitest';
import {
  mergeOccurrences, buildOccurrences, bucketOf, agenda, describeAgenda,
  byMonth, completionPatch, STATUS,
} from './agenda.js';

const TODAY = '2026-06-15';

/** A monthly series on the 1st, running all year. */
const monthly = {
  id: 'e1',
  title: 'Meter readings',
  start_date: '2026-01-01',
  recurrence: { freq: 'monthly', monthDay: 1 },
  drifts: false,
};

describe('mergeOccurrences', () => {
  it('generates occurrences with nothing stored', () => {
    const out = mergeOccurrences(monthly, [], '2026-01-01', '2026-03-31');
    expect(out.map(o => o.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(out.every(o => o.status === STATUS.DUE)).toBe(true);
    // No row exists until somebody records something against it.
    expect(out.every(o => o.id === null)).toBe(true);
  });

  it('overlays what has been recorded', () => {
    const stored = [{
      id: 'o1', event_id: 'e1', occurs_on: '2026-02-01',
      status: STATUS.DONE, completed_on: '2026-02-03', note: 'read by caretaker',
    }];
    const out = mergeOccurrences(monthly, stored, '2026-01-01', '2026-03-31');

    expect(out[1]).toMatchObject({
      id: 'o1', date: '2026-02-01', status: STATUS.DONE,
      completed_on: '2026-02-03', note: 'read by caretaker',
    });
    expect(out[0].status).toBe(STATUS.DUE);
  });

  it('shows a moved occurrence on its new date, remembering the old one', () => {
    const stored = [{ id: 'o2', event_id: 'e1', occurs_on: '2026-02-01', moved_to: '2026-02-05' }];
    const [, second] = mergeOccurrences(monthly, stored, '2026-01-01', '2026-03-31');

    expect(second.date).toBe('2026-02-05');
    expect(second.scheduled_for).toBe('2026-02-01');   // "it was meant to be the 1st"
    expect(second.moved).toBe(true);
  });

  it('keeps a completed occurrence the rule no longer produces', () => {
    // Ticked off, THEN the rule was changed. That is a record of work done, not
    // a projection, and erasing it would lose the fact that it happened.
    const stored = [{
      id: 'o3', event_id: 'e1', occurs_on: '2026-02-14',
      status: STATUS.DONE, completed_on: '2026-02-14',
    }];
    const out = mergeOccurrences(monthly, stored, '2026-01-01', '2026-03-31');

    const orphan = out.find(o => o.scheduled_for === '2026-02-14');
    expect(orphan).toBeDefined();
    expect(orphan.orphaned).toBe(true);
    expect(orphan.status).toBe(STATUS.DONE);
  });

  it('ignores rows belonging to another series', () => {
    const stored = [{ id: 'x', event_id: 'OTHER', occurs_on: '2026-02-01', status: STATUS.DONE }];
    const out = mergeOccurrences(monthly, stored, '2026-01-01', '2026-03-31');
    expect(out.every(o => o.status === STATUS.DUE)).toBe(true);
  });

  it('feeds a drifting series from the last completion', () => {
    const drifting = { ...monthly, id: 'e2', drifts: true };
    const stored = [{
      id: 'o4', event_id: 'e2', occurs_on: '2026-01-01',
      status: STATUS.DONE, completed_on: '2026-01-20',
    }];
    const out = mergeOccurrences(drifting, stored, '2026-01-01', '2026-04-30');

    // The completion, then a month after it — not the 1st of each month.
    expect(out.map(o => o.date)).toEqual(['2026-01-01', '2026-02-20', '2026-03-20', '2026-04-20']);
  });
});

describe('buildOccurrences', () => {
  const other = {
    id: 'e9', title: 'AGM', start_date: '2026-11-14',
    recurrence: { freq: 'yearly', month: 11, monthDay: 14 }, drifts: false,
  };

  it('flattens every series into one date order', () => {
    const out = buildOccurrences([monthly, other], [], '2026-10-01', '2026-12-31');
    expect(out.map(o => o.date))
      .toEqual(['2026-10-01', '2026-11-01', '2026-11-14', '2026-12-01']);
  });

  it('leaves out archived series', () => {
    const out = buildOccurrences([{ ...monthly, archived: true }], [], '2026-01-01', '2026-12-31');
    expect(out).toEqual([]);
  });

  it('orders same-day events by their time', () => {
    const morning = { ...other, id: 'a', start_time: '09:00' };
    const evening = { ...other, id: 'b', start_time: '18:30' };
    const out = buildOccurrences([evening, morning], [], '2026-11-01', '2026-11-30');
    expect(out.map(o => o.series.id)).toEqual(['a', 'b']);
  });
});

describe('bucketOf', () => {
  const at = (date, extra = {}) => ({ date, status: STATUS.DUE, series: monthly, ...extra });

  it('puts a past date in overdue', () => {
    expect(bucketOf(at('2026-06-01'), TODAY)).toBe('overdue');
  });

  it('puts today in coming up', () => {
    expect(bucketOf(at(TODAY), TODAY)).toBe('due_soon');
  });

  it('uses the SERIES notice period, not one figure for everything', () => {
    // A fire-risk-assessment review wants three months; a bin day wants two.
    const patient = { series: { ...monthly, lead_days: 90 } };
    const urgent  = { series: { ...monthly, lead_days: 2 } };

    expect(bucketOf(at('2026-08-01', patient), TODAY)).toBe('due_soon');
    expect(bucketOf(at('2026-08-01', urgent),  TODAY)).toBe('planned');
  });

  it('defaults to 30 days, matching the Maintenance diary', () => {
    expect(bucketOf(at('2026-07-10'), TODAY)).toBe('due_soon');
    expect(bucketOf(at('2026-07-20'), TODAY)).toBe('planned');
  });

  it('files done and skipped together, whatever their date', () => {
    expect(bucketOf(at('2026-01-01', { status: STATUS.DONE }), TODAY)).toBe('done');
    expect(bucketOf(at('2026-01-01', { status: STATUS.SKIPPED }), TODAY)).toBe('done');
  });

  it('keeps something long undone OVERDUE rather than ageing it away', () => {
    // There is deliberately no "missed". Undone in March is still undone in
    // June, and a planner that stopped saying so is why nobody noticed.
    expect(bucketOf(at('2026-03-01'), TODAY)).toBe('overdue');
  });
});

describe('agenda', () => {
  const occ = (date, status = STATUS.DUE) => ({ date, status, series: monthly });

  it('groups and orders each bucket the way it is read', () => {
    const groups = agenda([
      occ('2026-05-01'), occ('2026-04-01'),          // overdue
      occ('2026-06-20'),                              // coming up
      occ('2026-12-01'),                              // planned
      occ('2026-02-01', STATUS.DONE), occ('2026-03-01', STATUS.DONE),
    ], TODAY);

    // Oldest overdue first: the thing waiting longest is the thing to do.
    expect(groups.overdue.map(o => o.date)).toEqual(['2026-04-01', '2026-05-01']);
    expect(groups.due_soon.map(o => o.date)).toEqual(['2026-06-20']);
    expect(groups.planned.map(o => o.date)).toEqual(['2026-12-01']);
    // Done is a record, so newest first.
    expect(groups.done.map(o => o.date)).toEqual(['2026-03-01', '2026-02-01']);
  });

  it('survives an empty planner', () => {
    const groups = agenda([], TODAY);
    expect(groups).toEqual({ overdue: [], due_soon: [], planned: [], done: [] });
  });
});

describe('describeAgenda', () => {
  it('counts only what needs attention', () => {
    const groups = { overdue: [1, 2, 3], due_soon: [1, 2], planned: [1, 2, 3, 4], done: [1] };
    expect(describeAgenda(groups)).toBe('3 overdue · 2 coming up');
  });

  it('says so when there is nothing to do', () => {
    expect(describeAgenda({ overdue: [], due_soon: [], planned: [9], done: [9] }))
      .toBe('Nothing outstanding');
  });
});

describe('byMonth', () => {
  it('keys occurrences by their month', () => {
    const out = byMonth([{ date: '2026-01-05' }, { date: '2026-01-20' }, { date: '2026-03-01' }]);
    expect(out.get('2026-01')).toHaveLength(2);
    expect(out.get('2026-03')).toHaveLength(1);
    expect(out.has('2026-02')).toBe(false);
  });
});

describe('completionPatch', () => {
  const item = { event_id: 'e1', scheduled_for: '2026-02-01', date: '2026-02-01' };

  it('records the day it was DONE, not the day it was due', () => {
    // A drifting series counts from this. Defaulting it to the due date would
    // re-anchor the series to a day on which nothing happened.
    const patch = completionPatch(item, { status: STATUS.DONE, on: '2026-02-09', userId: 'u1' });
    expect(patch).toMatchObject({
      event_id: 'e1', occurs_on: '2026-02-01',
      status: STATUS.DONE, completed_on: '2026-02-09', completed_by: 'u1',
    });
  });

  it('falls back to the occurrence date when no day is given', () => {
    const patch = completionPatch(item, { status: STATUS.DONE, userId: 'u1' });
    expect(patch.completed_on).toBe('2026-02-01');
  });

  it('clears the completion when un-ticked', () => {
    const patch = completionPatch(item, { status: STATUS.DUE, userId: 'u1' });
    expect(patch.completed_on).toBeNull();
    expect(patch.completed_by).toBeNull();
  });

  it('records a skip without pretending it was done', () => {
    const patch = completionPatch(item, { status: STATUS.SKIPPED, note: 'no reading in August', userId: 'u1' });
    expect(patch.status).toBe(STATUS.SKIPPED);
    expect(patch.completed_on).toBeNull();
    expect(patch.note).toBe('no reading in August');
  });

  it('keys the patch on the SCHEDULED date, not where it was moved to', () => {
    // The row is identified by the occurrence the rule produced; moving it is a
    // property of that row, not a different row.
    const moved = { event_id: 'e1', scheduled_for: '2026-02-01', date: '2026-02-05' };
    expect(completionPatch(moved, { status: STATUS.DONE, userId: 'u1' }).occurs_on)
      .toBe('2026-02-01');
  });
});
