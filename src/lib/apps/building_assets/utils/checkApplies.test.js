// src/lib/apps/building_assets/utils/checkApplies.test.js

import { describe, it, expect } from 'vitest';
import {
  checkApplies, checksFor, recordedCheckApplies, describeCondition, conditionFor, conditionProblem,
} from './checkApplies.js';

const EMERGENCY = { id: 'em', name: 'Emergency', checkable: false, display_type: 'checkbox' };
const RATING = { id: 'rt', name: 'Rating', checkable: false, display_type: 'dropdown' };
const LIT = { id: 'lit', name: 'Lit after mains off', checkable: true, display_type: 'checkbox',
  applies_when: [{ defName: 'Emergency', checkable: false, op: 'is_true' }] };
const LAMP = { id: 'lamp', name: 'Lamp works', checkable: true, display_type: 'checkbox' };
const defs = [EMERGENCY, RATING, LIT, LAMP];
const attrs = {
  e1: [{ type_attribute_id: 'em', value: 'true' }],
  e2: [{ type_attribute_id: 'em', value: 'false' }],
  e3: [],
};

describe('checkApplies', () => {
  it('applies a check with no condition to every component', () => {
    expect(['e1', 'e2', 'e3'].map((id) => checkApplies(LAMP, { id }, defs, attrs))).toEqual([true, true, true]);
  });

  it('applies "Lit after mains off" only where Emergency is ticked', () => {
    expect(['e1', 'e2', 'e3'].map((id) => checkApplies(LIT, { id }, defs, attrs))).toEqual([true, false, false]);
  });

  it('does not apply where the type has no such attribute at all', () => {
    expect(checkApplies(LIT, { id: 'e1' }, [LIT, LAMP], attrs)).toBe(false);
  });

  it('matches a dropdown value', () => {
    const fd = { ...LAMP, applies_when: conditionFor(RATING, 'in', 'FD30') };
    const a = { d1: [{ type_attribute_id: 'rt', value: 'FD30' }], d2: [{ type_attribute_id: 'rt', value: 'FD60' }] };
    expect(checkApplies(fd, { id: 'd1' }, defs, a)).toBe(true);
    expect(checkApplies(fd, { id: 'd2' }, defs, a)).toBe(false);
  });
});

describe('checksFor', () => {
  it('keeps every fixed attribute and only the checks that apply', () => {
    expect(checksFor(defs, { id: 'e2' }, attrs).map((d) => d.id)).toEqual(['em', 'rt', 'lamp']);
    expect(checksFor(defs, { id: 'e1' }, attrs).map((d) => d.id)).toEqual(['em', 'rt', 'lit', 'lamp']);
  });
});

describe('recordedCheckApplies', () => {
  it('judges a past result on the component as it was', () => {
    expect(recordedCheckApplies(LIT, [{ id: 'em', name: 'Emergency', display_type: 'checkbox', value: 'true' }])).toBe(true);
    expect(recordedCheckApplies(LIT, [{ id: 'em', name: 'Emergency', display_type: 'checkbox', value: null }])).toBe(false);
  });

  it('treats a result with no record of the component as applying', () => {
    expect(recordedCheckApplies(LIT, undefined)).toBe(true);
  });
});

describe('describeCondition', () => {
  it('says when a check applies, in words', () => {
    expect(describeCondition(LAMP)).toBe('');
    expect(describeCondition(LIT)).toBe('Only where Emergency is ticked');
    expect(describeCondition({ applies_when: conditionFor(RATING, 'in', ['FD30', 'FD60']) })).toBe('Only where Rating is one of FD30, FD60');
  });
});

describe('conditionProblem', () => {
  it('refuses a condition with nothing chosen', () => {
    expect(conditionProblem(null)).toBeNull();
    expect(conditionProblem(conditionFor(EMERGENCY, 'is_true'))).toBeNull();
    expect(conditionProblem(conditionFor(RATING, 'in', ''))).toContain('Rating');
    expect(conditionProblem([])).toBeTruthy();
  });
});
