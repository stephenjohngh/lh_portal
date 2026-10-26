// Coverage of a walk-evidenced duty across sessions and days.
import { describe, it, expect } from 'vitest';
import { coverageOf, walkEventsWithCoverage } from './walkCoverage.js';
import { computeObligationSchedule } from './obligationSchedule.js';

const DAY = 86400000;
const D0 = Date.UTC(2026, 9, 1);              // 1 Oct 2026
const iso = (n) => new Date(D0 + n * DAY).toISOString();
const ids = (n, p = 'c') => Array.from({ length: n }, (_, i) => `${p}${i}`);

const ob = { id: 'ob', frequency_days: 30, mode: 'standard', name: 'Monthly test' };
const session = (id, closedDay, extra = {}) => ({
  id, definition_id: 'ob', status: 'closed', closed_at: iso(closedDay),
  total_components_count: 0, inspected_components_count: 0, ...extra,
});
const insp = (sessionId, componentId, day, result = 'ok') => ({
  walk_session_id: sessionId, component_id: componentId, inspection_result: result, inspected_at: iso(day),
});
const scopeOf = (n) => ({ ob: new Set(ids(n)) });
const events = (sessions, inspections, scope, obligations = [ob]) =>
  walkEventsWithCoverage({ sessions, inspections, obligations, scopeIdsByObligation: scope });
const completed = (evs) => evs.filter((e) => e.status === 'completed');

describe('a walk that covers only part of the duty', () => {
  it('is an attempt, however completely it checked its own components', () => {
    const s = [session('s1', 2, { total_components_count: 7, inspected_components_count: 7 })];
    const i = ids(7).map((c) => insp('s1', c, 2));
    const evs = events(s, i, scopeOf(104));
    expect(completed(evs)).toEqual([]);
    expect(evs[0]).toMatchObject({ status: 'attempted', covered: 7, inScope: 104 });
    const [state] = computeObligationSchedule([ob], evs, { now: new Date(iso(3)) });
    expect(state.band).toBe('never_run');
    expect(state.unfinishedAttempt).toBe(true);
  });
});

describe('a round split over several days', () => {
  const sessions = [session('a', 1), session('b', 3), session('c', 4)];
  const inspections = [
    ...ids(40).map((c) => insp('a', c, 1)),
    ...ids(104).slice(40, 80).map((c) => insp('b', c, 3)),
    ...ids(104).slice(80).map((c) => insp('c', c, 4)),
  ];

  it('is complete the moment the last component is seen, dated when that session closed', () => {
    const evs = events(sessions, inspections, scopeOf(104));
    const done = completed(evs);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ at: iso(4), covered: 104, inScope: 104, sourceId: 'c' });
    const [state] = computeObligationSchedule([ob], evs, { now: new Date(iso(5)) });
    expect(state.lastRun).toBe(iso(4));
    expect(state.band).toBe('ok');
  });

  it('is not complete one component short', () => {
    const evs = events(sessions, inspections.slice(0, -1), scopeOf(104));
    expect(completed(evs)).toEqual([]);
  });

  it('is not complete when the first floors were seen longer ago than the cadence', () => {
    const late = [session('a', 1), session('c', 40)];
    const i = [...ids(40).map((c) => insp('a', c, 1)), ...ids(104).slice(40).map((c) => insp('c', c, 40))];
    expect(completed(events(late, i, scopeOf(104)))).toEqual([]);
  });

  it('reads the last attempt as "N of the whole duty", not as the session\'s own count', () => {
    const evs = events(sessions.slice(0, 1), inspections.slice(0, 40), scopeOf(104));
    const last = evs.filter((e) => e.status === 'attempted').pop();
    expect(last).toMatchObject({ covered: 40, inScope: 104 });
  });
});

describe('what does not count as seeing a component', () => {
  it('NO ACCESS is not an observation', () => {
    const s = [session('s', 1)];
    const i = [...ids(9).map((c) => insp('s', c, 1)), insp('s', 'c9', 1, 'no_access')];
    expect(completed(events(s, i, scopeOf(10)))).toEqual([]);
  });

  it('an inactive or failed result IS an observation', () => {
    const s = [session('s', 1)];
    const i = [insp('s', 'c0', 1, 'failed'), insp('s', 'c1', 1, 'inactive'), insp('s', 'c2', 1, 'problem')];
    expect(completed(events(s, i, scopeOf(3)))).toHaveLength(1);
  });

  it('an open session is work in progress and counts for nothing', () => {
    const s = [session('s', 1, { status: 'open', closed_at: null })];
    const i = ids(3).map((c) => insp('s', c, 1));
    expect(events(s, i, scopeOf(3))).toEqual([]);
  });

  it('results outside the duty\'s scope are ignored', () => {
    const s = [session('s', 1)];
    const i = ids(5, 'other').map((c) => insp('s', c, 1));
    expect(completed(events(s, i, scopeOf(5)))).toEqual([]);
  });
});

describe('what cannot be judged stays an attempt', () => {
  it('a duty whose scope is unknown never completes', () => {
    const s = [session('s', 1, { total_components_count: 3, inspected_components_count: 3 })];
    const evs = events(s, ids(3).map((c) => insp('s', c, 1)), {});
    expect(evs).toHaveLength(1);
    expect(evs[0].status).toBe('attempted');
  });

  it('an empty scope is never complete', () => {
    const s = [session('s', 1)];
    expect(completed(events(s, [], { ob: new Set() }))).toEqual([]);
  });

  it('a rotating duty keeps the session as its cycle', () => {
    const rot = { ...ob, mode: 'rotating' };
    const s = [session('s', 1, { total_components_count: 4, inspected_components_count: 4 })];
    const evs = events(s, [], {}, [rot]);
    expect(evs).toHaveLength(1);
    expect(evs[0].status).toBe('completed');
  });
});

describe('a later partial walk', () => {
  it('does not undo a completed round, and reads as its own small share', () => {
    const s = [session('a', 1), session('b', 5)];
    const i = [...ids(10).map((c) => insp('a', c, 1)), insp('b', 'c0', 5), insp('b', 'c1', 5)];
    const evs = events(s, i, scopeOf(10));
    expect(completed(evs)[0].at).toBe(iso(1));
    const last = evs.filter((e) => e.status === 'attempted').pop();
    expect(last).toMatchObject({ covered: 2, inScope: 10 });
  });
});

describe('coverageOf with no cadence', () => {
  it('has no window: any earlier sighting still counts', () => {
    const obs = ids(3).map((c, n) => ({ componentId: c, at: D0 + n * 400 * DAY }));
    expect(coverageOf(new Set(ids(3)), obs, null).completeAt).not.toBeNull();
    expect(coverageOf(new Set(ids(3)), obs, 30).completeAt).toBeNull();
  });
});

describe('successive rounds', () => {
  it('a second full round moves the completion on; the first is not counted again', () => {
    const s = [session('a', 1), session('b', 33)];
    const i = [...ids(4).map((c) => insp('a', c, 1)), ...ids(4).map((c) => insp('b', c, 33))];
    const evs = events(s, i, scopeOf(4));
    expect(completed(evs).map((e) => e.at)).toEqual([iso(33)]);
  });

  it('a round part-walked since the last one is "in progress", not complete', () => {
    const s = [session('a', 1), session('b', 33)];
    const i = [...ids(4).map((c) => insp('a', c, 1)), insp('b', 'c0', 33)];
    const evs = events(s, i, scopeOf(4));
    expect(completed(evs).map((e) => e.at)).toEqual([iso(1)]);
    expect(coverageOf(new Set(ids(4)), i.map((r) => ({ componentId: r.component_id, at: Date.parse(r.inspected_at) })), 30).covered).toBe(1);
  });
});

describe('the newest attempt', () => {
  it('reads as the round so far, across sessions, not just its own walk', () => {
    const s = [session('a', 1), session('b', 2)];
    const i = [...ids(7).map((c) => insp('a', c, 1)), ...ids(104).slice(7, 15).map((c) => insp('b', c, 2))];
    const evs = events(s, i, scopeOf(104));
    expect(evs.filter((e) => e.status === 'attempted').pop()).toMatchObject({ covered: 15, inScope: 104 });
  });
});
