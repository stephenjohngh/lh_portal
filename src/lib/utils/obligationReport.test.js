// src/lib/utils/obligationReport.test.js
import { describe, it, expect } from 'vitest';
import {
  compliancePosition, positionSummary, filterRows, sortRows, groupRows,
  evidenceHistory, outcomeText, ROW_STATUS, ROW_STATUS_LABEL, NON_FAILING,
} from './obligationReport.js';
import { STATUTORY_TEMPLATE } from './statutoryTemplate.js';

const NOW = new Date('2026-09-10T12:00:00Z');
const opts = { now: NOW };

const ob = (over = {}) => ({
  id: 'o1', name: 'Lift — LOLER thorough examination', active: true, frequency_days: 365,
  evidenced_by: 'maintenance_job', template_key: 'lift_loler_examination', ...over,
});

const done = (id, at, over = {}) =>
  ({ obligationId: id, kind: 'job', at, status: 'completed', ...over });

const rowFor = (rows, key) => rows.find(r => r.key === key);

describe('compliancePosition — one row per requirement', () => {
  it('covers every register entry even with nothing held', () => {
    const rows = compliancePosition({ obligations: [], events: [] }, opts);
    expect(rows).toHaveLength(STATUTORY_TEMPLATE.length);
    expect(rowFor(rows, 'lift_loler_examination').status).toBe('gap');
  });

  // A bespoke obligation is still work the building committed to. Leaving it
  // out would make this a report about the register, not about the building.
  it('includes obligations that are not in the register at all', () => {
    const rows = compliancePosition({
      obligations: [ob({ id: 'x', name: 'Koi pond filter', template_key: null })],
      events: [],
    }, opts);
    const bespoke = rowFor(rows, 'obligation:x');
    expect(bespoke.name).toBe('Koi pond filter');
    expect(bespoke.group).toBe('unlisted');
    expect(bespoke.basis).toBeNull();
  });

  it('ignores a template_key that no longer names a register entry', () => {
    const rows = compliancePosition({
      obligations: [ob({ id: 'x', template_key: 'removed_key' })], events: [],
    }, opts);
    expect(rowFor(rows, 'obligation:x')).toBeTruthy();
  });

  it('reports an entry another app cycles as tracked elsewhere, not as a gap', () => {
    const rows = compliancePosition({ obligations: [], events: [] }, opts);
    expect(rowFor(rows, 'scr_review').status).toBe('elsewhere');
    expect(rowFor(rows, 'res_consultation').status).toBe('unhomed');
  });

  it('carries the basis, reference and owner onto the row', () => {
    const r = rowFor(compliancePosition({ obligations: [], events: [] }, opts), 'lift_loler_examination');
    expect(r.basis).toBe('statute');
    expect(r.statutoryRef).toMatch(/Lifting Operations/);
    expect(r.owner).toMatch(/examiner/);
  });
});

describe('status', () => {
  it('is ok when scheduled and recently completed', () => {
    const rows = compliancePosition({
      obligations: [ob()], events: [done('o1', '2026-08-01T00:00:00Z')],
    }, opts);
    expect(rowFor(rows, 'lift_loler_examination').status).toBe('ok');
  });

  it('is a breach when overdue, and when never run', () => {
    const overdue = compliancePosition({
      obligations: [ob()], events: [done('o1', '2024-01-01T00:00:00Z')],
    }, opts);
    expect(rowFor(overdue, 'lift_loler_examination').status).toBe('breach');

    const never = compliancePosition({ obligations: [ob()], events: [] }, opts);
    expect(rowFor(never, 'lift_loler_examination').state.band).toBe('never_run');
    expect(rowFor(never, 'lift_loler_examination').status).toBe('breach');
  });

  // An obligation switched off is not coverage — the same rule the gap report
  // applies, so the two never disagree.
  it('is a gap when the only obligation is inactive', () => {
    const rows = compliancePosition({ obligations: [ob({ active: false })], events: [] }, opts);
    expect(rowFor(rows, 'lift_loler_examination').status).toBe('gap');
  });

  it('is excluded when a decision says so, and carries the decision', () => {
    const rows = compliancePosition({
      obligations: [], events: [],
      exclusions: [{
        template_key: 'lift_maintenance', decision: 'not_applicable',
        reason: 'No lift — four storeys', decided_at: '2026-01-01T00:00:00Z',
      }],
    }, opts);
    const r = rowFor(rows, 'lift_maintenance');
    expect(r.status).toBe('excluded');
    expect(r.exclusion.reason).toBe('No lift — four storeys');
  });

  it('is not excluded once the decision has been reversed', () => {
    const rows = compliancePosition({
      obligations: [], events: [],
      exclusions: [
        { template_key: 'lift_maintenance', decision: 'not_applicable', reason: 'no lift', decided_at: '2026-01-01T00:00:00Z' },
        { template_key: 'lift_maintenance', decision: 'applicable',     reason: 'installed', decided_at: '2026-06-01T00:00:00Z' },
      ],
    }, opts);
    expect(rowFor(rows, 'lift_maintenance').status).toBe('gap');
  });
});

// The gap between "last completed" and "last attempted" is the most diagnostic
// thing in the report — a walk started and abandoned, a contractor who attended
// and could not get in.
describe('last completed vs last attempted', () => {
  const walk = (at, covered, inScope) => ({
    obligationId: 'w1', kind: 'walk', at,
    status: covered >= inScope && inScope > 0 ? 'completed' : 'attempted',
    covered, inScope,
  });

  it('reports both, and describes the attempt', () => {
    const rows = compliancePosition({
      obligations: [ob({ id: 'w1', evidenced_by: 'inspection', template_key: 'fser_communal_fire_doors' })],
      events: [walk('2026-06-01T00:00:00Z', 40, 40), walk('2026-09-01T00:00:00Z', 31, 40)],
    }, opts);
    const r = rowFor(rows, 'fser_communal_fire_doors');
    // `at` is passed through untouched — walkEventsFromSessions already
    // normalised it, so the report must not re-parse and re-format evidence.
    expect(r.lastCompleted).toBe('2026-06-01T00:00:00Z');
    expect(r.lastAttempted).toBe('2026-09-01T00:00:00Z');
    expect(r.lastOutcome).toBe('Partial — 31 of 40 observed');
  });

  // Two lifts, risers in two cores: the requirement is discharged only when
  // both are done, so the newest completion would flatter the position.
  it('takes the OLDEST completion when several obligations satisfy one entry', () => {
    const rows = compliancePosition({
      obligations: [ob({ id: 'a' }), ob({ id: 'b' })],
      events: [done('a', '2026-08-01T00:00:00Z'), done('b', '2026-02-01T00:00:00Z')],
    }, opts);
    expect(rowFor(rows, 'lift_loler_examination').lastCompleted).toBe('2026-02-01T00:00:00Z');
  });

  // Review finding: filtering out the nulls and returning the oldest of what
  // remained showed a completion date for a requirement half of which had never
  // been touched — evidence-shaped, and wrong.
  it('reports NEVER completed when any one of several obligations never has', () => {
    const rows = compliancePosition({
      obligations: [ob({ id: 'a', name: 'Lift A' }), ob({ id: 'b', name: 'Lift B' })],
      events: [done('a', '2026-08-01T00:00:00Z', { result: 'pass' })],   // b never
    }, opts);
    const r = rowFor(rows, 'lift_loler_examination');
    expect(r.lastCompleted).toBeNull();
    expect(r.lastOutcome).toBeNull();
    expect(r.status).toBe('breach');
  });

  it('still reports the oldest once they have ALL been done', () => {
    const rows = compliancePosition({
      obligations: [ob({ id: 'a' }), ob({ id: 'b' })],
      events: [done('a', '2026-08-01T00:00:00Z'), done('b', '2026-02-01T00:00:00Z')],
    }, opts);
    expect(rowFor(rows, 'lift_loler_examination').lastCompleted).toBe('2026-02-01T00:00:00Z');
  });

  it('takes the worst state when several obligations satisfy one entry', () => {
    const rows = compliancePosition({
      obligations: [ob({ id: 'a' }), ob({ id: 'b' })],
      events: [done('a', '2026-09-01T00:00:00Z')],   // b has never run
    }, opts);
    expect(rowFor(rows, 'lift_loler_examination').state.band).toBe('never_run');
  });
});

describe('outcomeText', () => {
  it('says what happened for each kind of occurrence', () => {
    expect(outcomeText({ kind: 'walk', status: 'completed', inScope: 12 })).toMatch(/all 12/);
    expect(outcomeText({ kind: 'walk', status: 'attempted', covered: 3, inScope: 9 })).toBe('Partial — 3 of 9 observed');
    expect(outcomeText({ kind: 'walk', status: 'attempted', covered: 0, inScope: 0 })).toMatch(/nothing in scope/);
    expect(outcomeText({ kind: 'job', status: 'completed', result: 'pass' })).toBe('Completed — pass');
    expect(outcomeText({ kind: 'job', status: 'completed' })).toBe('Completed');
    expect(outcomeText({ kind: 'job', status: 'planned' })).toBe('Booked, not yet done');
    expect(outcomeText(null)).toBeNull();
  });
});

describe('summary, filter, sort, group', () => {
  const rows = compliancePosition({
    obligations: [ob(), ob({ id: 'o2', template_key: 'fire_alarm_service', name: 'Alarm service' })],
    events: [done('o1', '2026-08-01T00:00:00Z')],
  }, opts);

  it('counts every row exactly once', () => {
    const s = positionSummary(rows);
    expect(Object.keys(s)).toEqual(ROW_STATUS);
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(rows.length);
  });

  it('filters by group, basis, status and free text', () => {
    expect(filterRows(rows, { groups: ['governance'] }).every(r => r.group === 'governance')).toBe(true);
    expect(filterRows(rows, { bases: ['statute'] }).every(r => r.basis === 'statute')).toBe(true);
    expect(filterRows(rows, { statuses: ['ok'] }).map(r => r.key)).toEqual(['lift_loler_examination']);
    expect(filterRows(rows, { search: 'lightning' }).map(r => r.key)).toEqual(['lightning_protection']);
  });

  it('treats an empty filter as no filter', () => {
    expect(filterRows(rows, {})).toHaveLength(rows.length);
    expect(filterRows(rows, { groups: [] })).toHaveLength(rows.length);
  });

  // Stable order is what makes two runs of the report comparable, which is most
  // of the reason to keep one.
  it('sorts in register order by default, identically every time', () => {
    const a = sortRows(rows).map(r => r.key);
    const b = sortRows([...rows].reverse()).map(r => r.key);
    expect(a).toEqual(b);
    expect(a[0]).toBe(sortRows(rows)[0].key);
  });

  it('sorts most urgent first when asked', () => {
    const first = sortRows(rows, 'due')[0];
    expect(['never_run', 'overdue']).toContain(first.state?.band);
  });

  // Absence of evidence is the strongest signal in the report, not a blank to
  // sweep to the bottom.
  it('sorts never-completed to the top of "longest since completed"', () => {
    expect(sortRows(rows, 'lastCompleted')[0].lastCompleted).toBeNull();
  });

  it('groups without losing a row', () => {
    const g = groupRows(rows, 'group');
    expect([...g.values()].reduce((n, r) => n + r.length, 0)).toBe(rows.length);
    expect(groupRows(rows, 'none').size).toBe(1);
  });
});


// The two ends of a requirement's life, for obligations the register does not
// name. Migration 209.
describe('a requirement added by hand', () => {
  // Before 209 a brand-new statutory duty came through with Source "—" —
  // the most important row in the report displaying as the most anonymous.
  it('can declare itself legislation', () => {
    const rows = compliancePosition({
      obligations: [ob({ id: 'n', name: 'New SI check', template_key: null, basis: 'statute', interval_basis: 'stated' })],
      events: [],
    }, opts);
    const r = rowFor(rows, 'obligation:n');
    expect(r.basis).toBe('statute');
    expect(r.intervalBasis).toBe('stated');
  });

  it('still reads as unstated when it says nothing', () => {
    const rows = compliancePosition({
      obligations: [ob({ id: 'n', template_key: null })], events: [],
    }, opts);
    expect(rowFor(rows, 'obligation:n').basis).toBeNull();
  });
});

describe('a requirement no longer required', () => {
  const retired = (over = {}) => ob({
    id: 'r', name: 'Repealed check', template_key: null,
    retired_on: '2026-04-01', retired_reason: 'Repealed by SI 2026/123', ...over,
  });

  // The distinction the whole flag exists for: switched off is a GAP, withdrawn
  // is not. Colouring a repeal as a breach would make the report cry wolf.
  it('reads as retired, not as a gap or a breach', () => {
    const rows = compliancePosition({ obligations: [retired()], events: [] }, opts);
    const r = rowFor(rows, 'obligation:r');
    expect(r.status).toBe('retired');
    expect(r.retiredReason).toBe('Repealed by SI 2026/123');
  });

  it('is retired even though retiring also switches it off', () => {
    const rows = compliancePosition({ obligations: [retired({ active: false })], events: [] }, opts);
    expect(rowFor(rows, 'obligation:r').status).toBe('retired');
  });

  // Switched off WITHOUT being retired must still shout.
  it('leaves a merely inactive obligation reading as a gap', () => {
    const rows = compliancePosition({
      obligations: [ob({ id: 'r', template_key: null, active: false })], events: [],
    }, opts);
    expect(rowFor(rows, 'obligation:r').status).toBe('gap');
  });

  // A report of last year's position must not retrospectively excuse work that
  // was genuinely missed at the time.
  it('was NOT retired before its retirement date', () => {
    const rows = compliancePosition(
      { obligations: [retired({ retired_on: '2027-01-01' })], events: [] },
      { ...opts, asOf: '2026-09-10' });
    expect(rowFor(rows, 'obligation:r').status).not.toBe('retired');
  });

  // Review finding: asOf governed withdrawal but never reached the scheduler,
  // so an as-at-date report claimed one date's requirement set and another
  // date's due state — true of no date at all.
  it('moves the due dates with asOf, not just the withdrawal test', () => {
    const obligations = [ob({ id: 'x', template_key: null, frequency_days: 30 })];
    const events = [done('x', '2026-01-10T00:00:00Z')];   // next due ~2026-02-09
    const asAtFeb = compliancePosition({ obligations, events }, { asOf: '2026-02-01' });
    const asAtSep = compliancePosition({ obligations, events }, { asOf: '2026-09-01' });
    expect(rowFor(asAtFeb, 'obligation:x').state.overdue).toBe(false);
    expect(rowFor(asAtSep, 'obligation:x').state.overdue).toBe(true);
  });

  it('lets an explicit now override the asOf-derived one', () => {
    const obligations = [ob({ id: 'x', template_key: null, frequency_days: 30 })];
    const events = [done('x', '2026-01-10T00:00:00Z')];
    const rows = compliancePosition({ obligations, events },
      { asOf: '2026-02-01', now: new Date('2026-09-01T00:00:00Z') });
    expect(rowFor(rows, 'obligation:x').state.overdue).toBe(true);
  });

  it('is counted, labelled, and not held against the building', () => {
    const rows = compliancePosition({ obligations: [retired()], events: [] }, opts);
    expect(positionSummary(rows).retired).toBe(1);
    expect(ROW_STATUS_LABEL.retired).toBe('Retired');
    expect(NON_FAILING.has('retired')).toBe(true);
    expect(NON_FAILING.has('superseded')).toBe(true);
    expect(NON_FAILING.has('gap')).toBe(false);
    expect(NON_FAILING.has('breach')).toBe(false);
  });

  // Deleting would orphan the history; flagging keeps it reachable.
  it('keeps its evidence readable in the history report', () => {
    const obligations = [retired()];
    const events = [done('r', '2026-01-15T00:00:00Z', { reference: 'CERT-1' })];
    const h = evidenceHistory({ events, obligations }, { from: '2025-01-01', to: '2026-12-31' });
    expect(h).toHaveLength(1);
    expect(h[0].obligationName).toBe('Repealed check');
    expect(h[0].reference).toBe('CERT-1');
  });
});

describe('evidenceHistory', () => {
  const obligations = [ob({ id: 'o1' })];
  const events = [
    done('o1', '2026-01-15T00:00:00Z', { reference: 'CP12-1', by: 'A Smith', result: 'pass' }),
    done('o1', '2026-07-15T00:00:00Z', { reference: 'CP12-2' }),
    { obligationId: 'o1', kind: 'job', at: '2027-01-15T00:00:00Z', status: 'planned', title: 'Next year' },
  ];

  it('lists completed occurrences in the window, newest first', () => {
    const h = evidenceHistory({ events, obligations }, { from: '2026-01-01', to: '2026-12-31' });
    expect(h.map(r => r.reference)).toEqual(['CP12-2', 'CP12-1']);
    expect(h[1].by).toBe('A Smith');
    expect(h[1].outcome).toBe('Completed — pass');
  });

  it('honours the window bounds inclusively', () => {
    expect(evidenceHistory({ events, obligations }, { from: '2026-07-15', to: '2026-07-15' }))
      .toHaveLength(1);
    expect(evidenceHistory({ events, obligations }, { from: '2026-08-01', to: '2026-12-31' }))
      .toHaveLength(0);
  });

  // A booked job that never happened is invisible in `completed` and is exactly
  // what you are looking for in `due` — which is why both modes exist.
  it('shows what was due but not done only in due mode', () => {
    const window = { from: '2027-01-01', to: '2027-12-31' };
    expect(evidenceHistory({ events, obligations }, { ...window })).toHaveLength(0);
    const due = evidenceHistory({ events, obligations }, { ...window, mode: 'due' });
    expect(due).toHaveLength(1);
    expect(due[0].outcome).toBe('Booked, not yet done');
  });

  // Review finding: an empty array meant "selected nothing", but was read as
  // "no filter", so the history widened to everything exactly when the user had
  // narrowed it to none — e.g. filtering the position report to "Not scheduled",
  // whose rows have no obligations at all.
  it('returns nothing when the selection is empty, and everything when there is no selection', () => {
    expect(evidenceHistory({ events, obligations }, { obligationIds: [] })).toHaveLength(0);
    expect(evidenceHistory({ events, obligations }, {}).length).toBeGreaterThan(0);
    expect(evidenceHistory({ events, obligations }, { obligationIds: undefined }).length).toBeGreaterThan(0);
  });

  it('narrows to selected obligations', () => {
    expect(evidenceHistory({ events, obligations }, { obligationIds: ['other'] })).toHaveLength(0);
    expect(evidenceHistory({ events, obligations }, { obligationIds: ['o1'] }).length).toBeGreaterThan(0);
  });

  it('carries the register context onto each occurrence', () => {
    const h = evidenceHistory({ events, obligations }, {});
    expect(h[0].basis).toBe('statute');
    expect(h[0].group).toBe('other_statutory');
    expect(h[0].obligationName).toBe('Lift — LOLER thorough examination');
  });

  it('names an occurrence whose obligation has been deleted rather than dropping it', () => {
    const h = evidenceHistory({ events, obligations: [] }, {});
    expect(h[0].obligationName).toBe('Unknown obligation');
  });

  it('tolerates junk and no window', () => {
    expect(evidenceHistory({ events: [null, {}], obligations }, {})).toEqual([]);
    expect(evidenceHistory({ events, obligations }, {}).length).toBe(2);
  });
});
