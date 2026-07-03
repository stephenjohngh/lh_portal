// src/lib/utils/inspectionSchedule.test.js
import { describe, it, expect } from 'vitest';
import { computeInspectionSchedule, sortBySchedule } from './inspectionSchedule.js';

const NOW = new Date('2026-07-03T12:00:00Z');

/** @param {Partial<any>} o */
const def = (o) => ({
  id: 'd1', name: 'Def', active: true, mode: 'standard',
  frequency_days: 7, ...o,
});

/** closed session for a definition, closed_at N days before NOW */
const closed = (definitionId, daysAgo, extra = {}) => ({
  id: `s-${definitionId}-${daysAgo}`,
  definition_id: definitionId,
  status: 'closed',
  closed_at: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  ...extra,
});

describe('computeInspectionSchedule', () => {
  it('on-demand (no frequency) is never due', () => {
    const [s] = computeInspectionSchedule([def({ frequency_days: null })], [], { now: NOW });
    expect(s.band).toBe('on_demand');
    expect(s.overdue).toBe(false);
    expect(s.nextDue).toBeNull();
    expect(s.sortKey).toBe(Infinity);
  });

  it('cadence but never run → never_run, due now, most urgent', () => {
    const [s] = computeInspectionSchedule([def({ frequency_days: 7 })], [], { now: NOW });
    expect(s.band).toBe('never_run');
    expect(s.overdue).toBe(true);
    expect(s.lastRun).toBeNull();
    expect(s.sortKey).toBe(-Infinity);
  });

  it('run recently → ok, next due = last + frequency', () => {
    // freq 30, run 1 day ago → due in 29 days, well outside the 14-day window
    const [s] = computeInspectionSchedule([def({ id: 'd1', frequency_days: 30 })], [closed('d1', 1)], { now: NOW });
    expect(s.band).toBe('ok');
    expect(s.overdue).toBe(false);
    expect(s.daysUntilDue).toBe(29);
    expect(s.lastRun).toBe(new Date(NOW.getTime() - 1 * 86_400_000).toISOString());
  });

  it('past the cadence → overdue', () => {
    const [s] = computeInspectionSchedule([def({ id: 'd1', frequency_days: 7 })], [closed('d1', 10)], { now: NOW });
    expect(s.band).toBe('overdue');
    expect(s.overdue).toBe(true);
    expect(s.daysUntilDue).toBe(-3);
  });

  it('within the due-soon window → due_soon', () => {
    // last run 5 days ago, freq 7 → due in 2 days, within default 14d window
    const [s] = computeInspectionSchedule([def({ id: 'd1', frequency_days: 7 })], [closed('d1', 5)], { now: NOW });
    expect(s.band).toBe('due_soon');
    expect(s.overdue).toBe(false);
    expect(s.daysUntilDue).toBe(2);
  });

  it('uses the MOST RECENT closed session', () => {
    const [s] = computeInspectionSchedule(
      [def({ id: 'd1', frequency_days: 7 })],
      [closed('d1', 30), closed('d1', 2), closed('d1', 20)],
      { now: NOW },
    );
    expect(s.daysUntilDue).toBe(5); // from the 2-days-ago run
  });

  it('ignores open sessions and other definitions', () => {
    const sessions = [
      closed('d1', 1, { status: 'open' }),      // not closed
      closed('d2', 1),                          // different definition
      { definition_id: 'd1', status: 'closed', closed_at: null }, // no timestamp
    ];
    const [s] = computeInspectionSchedule([def({ id: 'd1', frequency_days: 7 })], sessions, { now: NOW });
    expect(s.band).toBe('never_run'); // no valid closed session for d1
  });

  it('respects a custom dueSoonDays window', () => {
    const [s] = computeInspectionSchedule(
      [def({ id: 'd1', frequency_days: 30 })],
      [closed('d1', 25)], // due in 5 days
      { now: NOW, dueSoonDays: 3 },
    );
    expect(s.band).toBe('ok'); // 5 > 3, so not "due soon"
  });
});

describe('sortBySchedule', () => {
  it('orders never-run/overdue first, then by due date, on-demand last', () => {
    const states = computeInspectionSchedule(
      [
        def({ id: 'ok',      name: 'OK',      frequency_days: 30 }),
        def({ id: 'ondemand',name: 'Ad-hoc',  frequency_days: null }),
        def({ id: 'overdue', name: 'Overdue', frequency_days: 7 }),
        def({ id: 'never',   name: 'Never',   frequency_days: 7 }),
      ],
      [closed('ok', 1), closed('overdue', 20)],
      { now: NOW },
    );
    const order = sortBySchedule(states).map((s) => s.definition.id);
    expect(order[0]).toBe('never');     // -Infinity
    expect(order[1]).toBe('overdue');   // past due
    expect(order[2]).toBe('ok');        // future due
    expect(order[3]).toBe('ondemand');  // Infinity, last
  });

  it('does not mutate the input array', () => {
    const states = computeInspectionSchedule([def({ id: 'a', frequency_days: 7 })], [], { now: NOW });
    const copy = [...states];
    sortBySchedule(states);
    expect(states).toEqual(copy);
  });
});
