// src/lib/apps/compliance/utils/correctiveWork.test.js
//
// ⛔ THE RULE THESE GUARD IS NOT ARITHMETIC. Corrective work discharges no
// duty, so its figures must never join the obligation figures — and an open
// fault must never be able to read as covered because somebody started a draft.
import { describe, it, expect } from 'vitest';
import {
  correctiveSummary, faultLabel, FAULT_STATUSES, COVERING_SCHEDULE_STATUSES,
} from './correctiveWork.js';

const comp = (id, status, extra = {}) => ({ id, status, label: `C${id}`, ...extra });
const item = (componentId, scheduleId, status, extra = {}) => ({
  component_id: componentId,
  schedule: { id: scheduleId, title: `S${scheduleId}`, reference: null, status, ...extra },
});

describe('which components are open faults', () => {
  it('counts failed and problem, and nothing else', () => {
    const s = correctiveSummary({
      components: [
        comp('a', 'failed'), comp('b', 'problem'),
        comp('c', 'ok'), comp('d', 'inactive'), comp('e', null),
      ],
    });
    expect(s.open).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.problem).toBe(1);
  });

  // ⚠ `inactive` is switched off and STILL READS AS A GAP elsewhere in the
  // portal (CLAUDE.md, three kinds of "it doesn't count"). It is deliberately
  // not a fault: nothing is broken, somebody turned it off.
  it('does not treat inactive as a fault', () => {
    expect(FAULT_STATUSES).not.toContain('inactive');
    expect(correctiveSummary({ components: [comp('a', 'inactive')] }).open).toBe(0);
  });

  it('survives junk in the component list', () => {
    const junk = /** @type {any[]} */ ([null, undefined, {}, comp('a', 'failed')]);
    const s = correctiveSummary({ components: junk });
    expect(s.open).toBe(1);
  });
});

describe('what counts as coverage', () => {
  it('an issued schedule covers the fault', () => {
    const s = correctiveSummary({
      components: [comp('a', 'failed')],
      worksItems: [item('a', 's1', 'issued')],
    });
    expect(s.covered).toBe(1);
    expect(s.uncovered).toBe(0);
    expect(s.rows[0].schedules).toEqual([
      { id: 's1', title: 'Ss1', reference: null, status: 'issued' },
    ]);
  });

  it('a completed schedule covers it too', () => {
    const s = correctiveSummary({
      components: [comp('a', 'failed')],
      worksItems: [item('a', 's1', 'completed')],
    });
    expect(s.covered).toBe(1);
  });

  // ⛔ The one that matters. A draft has not been sent to anybody.
  it('a DRAFT schedule does not cover it', () => {
    const s = correctiveSummary({
      components: [comp('a', 'failed')],
      worksItems: [item('a', 's1', 'draft')],
    });
    expect(s.covered).toBe(0);
    expect(s.uncovered).toBe(1);
    expect(s.rows[0].schedules).toEqual([]);
    expect(COVERING_SCHEDULE_STATUSES).not.toContain('draft');
  });

  it('counts a component on two real schedules once, keeping both', () => {
    const s = correctiveSummary({
      components: [comp('a', 'failed')],
      worksItems: [item('a', 's1', 'issued'), item('a', 's2', 'completed')],
    });
    expect(s.covered).toBe(1);
    expect(s.rows[0].schedules.map(x => x.id)).toEqual(['s1', 's2']);
  });

  it('does not repeat one schedule listed twice', () => {
    const s = correctiveSummary({
      components: [comp('a', 'failed')],
      worksItems: [item('a', 's1', 'issued'), item('a', 's1', 'issued')],
    });
    expect(s.rows[0].schedules).toHaveLength(1);
  });

  it('ignores works items for components that are not faults', () => {
    const s = correctiveSummary({
      components: [comp('a', 'ok')],
      worksItems: [item('a', 's1', 'issued')],
    });
    expect(s.open).toBe(0);
    expect(s.covered).toBe(0);
  });

  it('ignores an item with no schedule joined', () => {
    const s = correctiveSummary({
      components: [comp('a', 'failed')],
      worksItems: /** @type {any[]} */ ([
        { component_id: 'a', schedule: null },
        { schedule: { id: 's1', status: 'issued' } },
      ]),
    });
    expect(s.covered).toBe(0);
  });

  // ⭐ The invariant, stated as arithmetic so it cannot drift: every open fault
  // is in exactly one of the two buckets.
  it('covered + uncovered always equals open', () => {
    const s = correctiveSummary({
      components: [comp('a', 'failed'), comp('b', 'problem'), comp('c', 'failed')],
      worksItems: [item('a', 's1', 'issued'), item('b', 's2', 'draft')],
    });
    expect(s.covered + s.uncovered).toBe(s.open);
    expect(s.open).toBe(3);
    expect(s.covered).toBe(1);
  });
});

describe('empty is empty, not an error', () => {
  it('returns zeroes for no input at all', () => {
    const s = correctiveSummary();
    expect(s).toMatchObject({ open: 0, failed: 0, problem: 0, covered: 0, uncovered: 0 });
    expect(s.rows).toEqual([]);
  });
});

describe('faultLabel', () => {
  it('leads with the label and adorns with the asset id', () => {
    expect(faultLabel({ label: 'Landing light 3', asset_id: 'L/3/07' })).toBe('Landing light 3 · L/3/07');
  });
  it('copes with either half missing', () => {
    expect(faultLabel({ label: 'Landing light 3' })).toBe('Landing light 3');
    expect(faultLabel({ asset_id: 'L/3/07' })).toBe('L/3/07');
  });
  // ⛔ Never a uuid fragment — it identifies the row and not the thing.
  it('says so rather than printing an id when there is no name', () => {
    expect(faultLabel({ id: '244739a8-0000-0000-0000-000000000000' })).toBe('Unnamed component');
  });
});
