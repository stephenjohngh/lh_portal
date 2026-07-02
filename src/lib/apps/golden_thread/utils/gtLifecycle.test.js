// src/lib/apps/golden_thread/utils/gtLifecycle.test.js
//
// Type-1 pure-logic test (node env, no jsdom/mocks). Pins the GT lifecycle
// transition truth table so it cannot drift from the SQL validator
// `gt_is_valid_transition` (migration 144). If you change one, change both and
// update this table.

import { describe, it, expect } from 'vitest';
import {
  GT_STATUSES,
  isValidTransition,
  nextStates,
  isTerminal,
  statusLabel
} from './gtLifecycle.js';

describe('gtLifecycle — transition truth table', () => {
  // Exhaustive from×to matrix; `true` cells are the ONLY valid transitions.
  // Mirrors gt_is_valid_transition exactly.
  const VALID = new Set([
    'draft->under_review',
    'draft->withdrawn',            // admin exit for mistaken/orphan drafts (mig 149)
    'under_review->current',
    'under_review->returned_to_author',
    'current->superseded',
    'current->withdrawn',
    'superseded->current'
  ]);

  for (const from of GT_STATUSES) {
    for (const to of GT_STATUSES) {
      const key = `${from}->${to}`;
      const expected = VALID.has(key);
      it(`${key} is ${expected ? 'valid' : 'invalid'}`, () => {
        expect(isValidTransition(from, to)).toBe(expected);
      });
    }
  }

  it('no status transitions to itself', () => {
    for (const s of GT_STATUSES) {
      expect(isValidTransition(s, s)).toBe(false);
    }
  });

  it('unknown statuses are inert', () => {
    expect(isValidTransition('bogus', 'current')).toBe(false);
    expect(isValidTransition('current', 'bogus')).toBe(false);
    expect(nextStates('bogus')).toEqual([]);
  });
});

describe('gtLifecycle — helpers', () => {
  it('nextStates lists exactly the reachable statuses', () => {
    expect(nextStates('draft').sort()).toEqual(['under_review', 'withdrawn']);
    expect(nextStates('under_review').sort()).toEqual(['current', 'returned_to_author']);
    expect(nextStates('current').sort()).toEqual(['superseded', 'withdrawn']);
    expect(nextStates('superseded')).toEqual(['current']);
  });

  it('returned_to_author and withdrawn are terminal', () => {
    expect(isTerminal('returned_to_author')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
    expect(isTerminal('draft')).toBe(false);
    expect(isTerminal('current')).toBe(false);
  });

  it('statusLabel maps known statuses and falls back to the raw value', () => {
    expect(statusLabel('under_review')).toBe('Under Review');
    expect(statusLabel('current')).toBe('Current');
    expect(statusLabel('whatever')).toBe('whatever');
  });
});
