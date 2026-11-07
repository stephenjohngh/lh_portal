// src/lib/apps/inspection/utils/asRecorded.test.js

import { describe, it, expect } from 'vitest';
import {
  recordedAnswers, recordedComponent, withoutSnapshot, todaysNamesNote, UNKNOWN_CHECK,
} from './asRecorded.js';

const then = [
  { id: 'c1', name: 'Closer (then)', display_type: 'checkbox', order: 1, visible: true },
  { id: 'c2', name: 'Hidden check', display_type: 'checkbox', order: 2, visible: false },
  { id: 'c3', name: 'Skipped check', display_type: 'checkbox', order: 3, visible: false },
  { id: 'r1', name: 'Gap mm', display_type: 'number', order: 4, visible: true },
  { id: 'c4', name: 'Not answered', display_type: 'checkbox', order: 5, visible: true },
];
const today = [
  { id: 'c1', name: 'Closer (today)', display_type: 'checkbox', checkable: true, visible: true, presentation_order: 1 },
  { id: 'x',  name: 'A fixed attribute', display_type: 'text', checkable: false, visible: true, presentation_order: 2 },
];

describe('recordedAnswers', () => {
  const row = { recorded_checks: then, checklist_results: { c1: true, c2: false }, readings: { r1: 3 } };

  it('uses the names the result was judged against, not today’s', () => {
    const { conditions, fromSnapshot } = recordedAnswers(row, today);
    expect(fromSnapshot).toBe(true);
    expect(conditions[0]).toMatchObject({ def: { name: 'Closer (then)' }, passed: true });
  });

  it('keeps a hidden check that was answered, and drops one that was not', () => {
    const names = recordedAnswers(row, today).conditions.map((c) => c.def.name);
    expect(names).toContain('Hidden check');
    expect(names).not.toContain('Skipped check');
  });

  it('lists an unanswered check as not recorded, never as a pass', () => {
    const c = recordedAnswers(row, today).conditions.find((x) => x.def.name === 'Not answered');
    expect(c.passed).toBeNull();
  });

  it('gives the readings that were taken', () => {
    expect(recordedAnswers(row, today).readings).toEqual([{ def: then[3], value: 3 }]);
  });

  it('falls back to today’s names with no snapshot, and says so', () => {
    const r = recordedAnswers({ checklist_results: { c1: false } }, today);
    expect(r.fromSnapshot).toBe(false);
    expect(r.conditions).toEqual([{ def: today[0], passed: false }]);
  });

  it('never loses an answer whose check has gone', () => {
    const r = recordedAnswers({ checklist_results: { gone: false }, readings: { old: 7 } }, today);
    expect(r.conditions.find((c) => c.def.name === UNKNOWN_CHECK)).toMatchObject({ passed: false });
    expect(r.readings).toEqual([{ def: { id: 'old', name: UNKNOWN_CHECK }, value: 7 }]);
  });
});

describe('recordedComponent', () => {
  it('gives the component as it stood', () => {
    const c = recordedComponent({ as_recorded: { ref: '1/A/05', component: { label: '12a', floor: '1' }, fixed: [{ id: 'f', name: 'Rating', value: 'FD60' }] } });
    expect(c).toMatchObject({ ref: '1/A/05', label: '12a', type_initial: 'A' });
    expect(c.fixed[0].value).toBe('FD60');
  });

  it('is null for a result with none, or whose snapshot failed', () => {
    expect(recordedComponent({})).toBeNull();
    expect(recordedComponent({ as_recorded: { error: 'x' } })).toBeNull();
  });
});

describe('saying what is not known', () => {
  it('counts results with no snapshot', () => {
    expect(withoutSnapshot([{ recorded_checks: [] }, {}, { recorded_checks: null }])).toBe(2);
  });

  it('says nothing when every result has one', () => {
    expect(todaysNamesNote(0)).toBeNull();
    expect(todaysNamesNote(1)).toContain('1 result was');
    expect(todaysNamesNote(3)).toContain('3 results were');
  });
});
