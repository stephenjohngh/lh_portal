// src/lib/utils/obligationSchedule.test.js
import { describe, it, expect } from 'vitest';
import {
  computeObligationSchedule, walkEventsFromSessions, jobEventsFromJobs, planExceedsCeiling,
} from './obligationSchedule.js';
import { computeInspectionSchedule } from './inspectionSchedule.js';

const NOW = new Date('2026-09-10T12:00:00Z');
const daysAgo   = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const dateInDays = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

const ob = (o) => ({ id: 'o1', name: 'Obligation', frequency_days: 30, ...o });

const closedSession = (definitionId, ago, { inspected = 10, total = 10 } = {}) => ({
  id: `s-${definitionId}-${ago}`, definition_id: definitionId, status: 'closed',
  closed_at: daysAgo(ago), inspected_components_count: inspected, total_components_count: total,
});

const job = (o) => ({ id: 'j1', obligation_id: 'o1', status: 'scheduled', ...o });

describe('walkEventsFromSessions', () => {
  it('maps a fully-inspected closed session to completed evidence', () => {
    const [e] = walkEventsFromSessions([closedSession('o1', 3)]);
    expect(e).toMatchObject({ obligationId: 'o1', kind: 'walk', status: 'completed' });
  });

  it('maps a finished-early session to an attempt, not evidence', () => {
    const [e] = walkEventsFromSessions([closedSession('o1', 3, { inspected: 4, total: 10 })]);
    expect(e.status).toBe('attempted');
  });

  it('treats a zero-scope session as an attempt, never complete', () => {
    const [e] = walkEventsFromSessions([closedSession('o1', 3, { inspected: 0, total: 0 })]);
    expect(e.status).toBe('attempted');
  });

  it('ignores open sessions, sessions with no definition and unparseable dates', () => {
    expect(walkEventsFromSessions([
      { ...closedSession('o1', 1), status: 'open' },
      { ...closedSession('o1', 1), definition_id: null },
      { ...closedSession('o1', 1), closed_at: 'not-a-date' },
      null,
    ])).toEqual([]);
  });

  // Walk events are never 'planned' — this is what makes the delegation in
  // inspectionSchedule.js behaviour-preserving by construction.
  it('never produces a planned event', () => {
    const events = walkEventsFromSessions([closedSession('o1', 1), closedSession('o2', 2, { inspected: 1, total: 9 })]);
    expect(events.some(e => e.status === 'planned')).toBe(false);
  });
});

describe('jobEventsFromJobs', () => {
  it('maps a completed job to completed evidence, dated when it was DONE', () => {
    const [e] = jobEventsFromJobs([job({ status: 'completed', scheduled_date: '2026-08-01', completed_date: '2026-08-09' })]);
    expect(e).toMatchObject({ obligationId: 'o1', kind: 'job', status: 'completed' });
    expect(e.at).toBe('2026-08-09T00:00:00.000Z');
  });

  it('maps a scheduled job to a planned occurrence', () => {
    const [e] = jobEventsFromJobs([job({ scheduled_date: '2026-10-01' })]);
    expect(e).toMatchObject({ status: 'planned', at: '2026-10-01T00:00:00.000Z' });
  });

  // Same rule maintenanceHelpers.jobRag() applies — a regulatory deadline
  // outranks the date someone pencilled in, so the unified answer must not
  // disagree with the badge on the job itself.
  it('uses hard_expiry_date when it falls EARLIER than the scheduled date', () => {
    const [e] = jobEventsFromJobs([job({ scheduled_date: '2026-11-01', hard_expiry_date: '2026-10-05' })]);
    expect(e.at).toBe('2026-10-05T00:00:00.000Z');
  });

  it('keeps the scheduled date when hard_expiry_date is later', () => {
    const [e] = jobEventsFromJobs([job({ scheduled_date: '2026-10-01', hard_expiry_date: '2026-12-01' })]);
    expect(e.at).toBe('2026-10-01T00:00:00.000Z');
  });

  it('ignores cancelled jobs and jobs with no obligation', () => {
    expect(jobEventsFromJobs([
      job({ status: 'cancelled', scheduled_date: '2026-10-01' }),
      job({ obligation_id: null, scheduled_date: '2026-10-01' }),
    ])).toEqual([]);
  });
});

describe('computeObligationSchedule — basis', () => {
  it('derives from the last completed evidence when nothing is booked', () => {
    const [s] = computeObligationSchedule([ob({ frequency_days: 30 })],
      walkEventsFromSessions([closedSession('o1', 1)]), { now: NOW });
    expect(s.basis).toBe('derived');
    expect(s.daysUntilDue).toBe(29);
    expect(s.band).toBe('ok');
  });

  it('a booked job beats the derived date — due IS the booking', () => {
    const events = [
      ...walkEventsFromSessions([closedSession('o1', 1)]),      // derived would be +29d
      ...jobEventsFromJobs([job({ scheduled_date: dateInDays(3) })]),
    ];
    const [s] = computeObligationSchedule([ob({ frequency_days: 30 })], events, { now: NOW });
    expect(s.basis).toBe('planned');
    expect(s.band).toBe('due_soon');
    expect(s.daysUntilDue).toBe(3);
  });

  it('a booking whose date has passed is overdue', () => {
    const [s] = computeObligationSchedule([ob()],
      jobEventsFromJobs([job({ scheduled_date: dateInDays(-5) })]), { now: NOW });
    expect(s.basis).toBe('planned');
    expect(s.overdue).toBe(true);
    expect(s.band).toBe('overdue');
  });

  it('the EARLIEST booking wins when several are queued', () => {
    const [s] = computeObligationSchedule([ob()], jobEventsFromJobs([
      job({ id: 'j2', scheduled_date: dateInDays(40) }),
      job({ id: 'j3', scheduled_date: dateInDays(9) }),
    ]), { now: NOW });
    expect(s.daysUntilDue).toBe(9);
  });

  // A booked job is a fact about the world; an on-demand cadence just means
  // nothing forces one. The booking still answers "when next".
  it('an on-demand obligation with a booked job reports that date', () => {
    const [s] = computeObligationSchedule([ob({ frequency_days: null })],
      jobEventsFromJobs([job({ scheduled_date: dateInDays(6) })]), { now: NOW });
    expect(s.band).toBe('due_soon');
    expect(s.basis).toBe('planned');
    expect(s.sortKey).not.toBe(Infinity);
  });

  it('on-demand with nothing booked stays on_demand', () => {
    const [s] = computeObligationSchedule([ob({ frequency_days: null })], [], { now: NOW });
    expect(s.band).toBe('on_demand');
    expect(s.basis).toBeNull();
    expect(s.sortKey).toBe(Infinity);
  });

  it('evidence from EITHER stack resets the same clock', () => {
    const [viaJob] = computeObligationSchedule([ob({ frequency_days: 30 })],
      jobEventsFromJobs([job({ status: 'completed', completed_date: dateInDays(-1) })]), { now: NOW });
    const [viaWalk] = computeObligationSchedule([ob({ frequency_days: 30 })],
      walkEventsFromSessions([closedSession('o1', 1)]), { now: NOW });
    expect(viaJob.basis).toBe('derived');
    expect(viaJob.daysUntilDue).toBe(viaWalk.daysUntilDue);
  });
});

describe('computeObligationSchedule — max_interval_days', () => {
  it('flags a breach measured from the last completed evidence', () => {
    const [s] = computeObligationSchedule([ob({ frequency_days: 30, max_interval_days: 60 })],
      walkEventsFromSessions([closedSession('o1', 70)]), { now: NOW });
    expect(s.intervalBreached).toBe(true);
  });

  it('does not flag one still inside the ceiling', () => {
    const [s] = computeObligationSchedule([ob({ frequency_days: 30, max_interval_days: 60 })],
      walkEventsFromSessions([closedSession('o1', 40)]), { now: NOW });
    expect(s.intervalBreached).toBe(false);
  });

  // With nothing ever completed there is no start date to measure a ceiling
  // from — `never_run` already says the loudest thing there is to say, and
  // inventing a breach date would be making one up.
  it('never claims a breach with no completed evidence at all', () => {
    const [s] = computeObligationSchedule([ob({ frequency_days: 30, max_interval_days: 60 })], [], { now: NOW });
    expect(s.band).toBe('never_run');
    expect(s.intervalBreached).toBe(false);
  });

  it('is false when no ceiling is set', () => {
    const [s] = computeObligationSchedule([ob({ frequency_days: 30 })],
      walkEventsFromSessions([closedSession('o1', 900)]), { now: NOW });
    expect(s.intervalBreached).toBe(false);
  });
});

describe('planExceedsCeiling', () => {
  it('catches a plan looser than the legal maximum', () => {
    expect(planExceedsCeiling({ frequency_days: 365, max_interval_days: 180 })).toBe(true);
  });

  it('is false for a plan at or inside the ceiling, or when either is unset', () => {
    expect(planExceedsCeiling({ frequency_days: 90, max_interval_days: 180 })).toBe(false);
    expect(planExceedsCeiling({ frequency_days: 180, max_interval_days: 180 })).toBe(false);
    expect(planExceedsCeiling({ frequency_days: 90 })).toBe(false);
    expect(planExceedsCeiling({ max_interval_days: 90 })).toBe(false);
    expect(planExceedsCeiling(null)).toBe(false);
  });
});

// The P2 gate, asserted directly as well as structurally: on walk-only input
// the generalised function must agree with the one three surfaces already use.
describe('equivalence with computeInspectionSchedule on walk-only input', () => {
  const defs = [
    ob({ id: 'a', frequency_days: 7 }),        // overdue
    ob({ id: 'b', frequency_days: 30 }),       // ok
    ob({ id: 'c', frequency_days: null }),     // on demand
    ob({ id: 'd', frequency_days: 90 }),       // never run
    ob({ id: 'e', frequency_days: 14 }),       // unfinished attempt only
  ];
  const sessions = [
    closedSession('a', 10),
    closedSession('b', 1),
    closedSession('c', 5),
    closedSession('e', 2, { inspected: 3, total: 8 }),
    { ...closedSession('b', 40), status: 'open' },
  ];

  it('agrees field for field on every band', () => {
    const viaOld = computeInspectionSchedule(defs, sessions, { now: NOW });
    const viaNew = computeObligationSchedule(defs, walkEventsFromSessions(sessions), { now: NOW });

    expect(viaOld).toHaveLength(viaNew.length);
    viaOld.forEach((oldState, i) => {
      const newState = viaNew[i];
      for (const key of ['lastRun', 'lastAttempt', 'unfinishedAttempt', 'nextDue',
                         'overdue', 'daysUntilDue', 'band', 'sortKey']) {
        expect({ key, v: oldState[key] }).toEqual({ key, v: newState[key] });
      }
    });
  });

  it('respects a custom dueSoonDays window identically', () => {
    const opts = { now: NOW, dueSoonDays: 40 };
    expect(computeInspectionSchedule(defs, sessions, opts).map(s => s.band))
      .toEqual(computeObligationSchedule(defs, walkEventsFromSessions(sessions), opts).map(s => s.band));
  });
});
