// src/lib/apps/mor/utils/morStateMachine.test.js
// Truth-table test for the MOR case state machine. The map below mirrors
// TRANSITIONS in morHelpers.js, which in turn MUST match the
// mor_is_valid_transition() SQL function in migration 137. If a transition
// changes, all three places change together — this test failing is the
// reminder.
import { describe, it, expect } from 'vitest';
import { isValidTransition } from './morHelpers.js';

const EXPECTED = {
  submitted:        ['acknowledged'],
  acknowledged:     ['in_triage'],
  in_triage:        ['in_assessment', 'decision_pending', 'reclassified', 'closed'],
  in_assessment:    ['decision_pending'],
  decision_pending: ['bsr_notice', 'in_remediation', 'closed', 'in_triage'],
  bsr_notice:       ['bsr_report'],
  bsr_report:       ['in_remediation', 'awaiting_bsr'],
  in_remediation:   ['remediated', 'awaiting_reporter'],
  awaiting_reporter:['in_remediation', 'in_triage'],
  awaiting_bsr:     ['bsr_report', 'in_remediation'],
  remediated:       ['closed'],
  closed:           ['reopened'],
  reopened:         ['in_triage'],
  reclassified:     [],
};

const ALL_STATES = Object.keys(EXPECTED);

describe('isValidTransition', () => {
  it('matches the documented transition map exactly (full truth table)', () => {
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        const expected = EXPECTED[from].includes(to);
        expect(isValidTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it('rejects unknown states on either side', () => {
    expect(isValidTransition('nonsense', 'closed')).toBe(false);
    expect(isValidTransition('submitted', 'nonsense')).toBe(false);
    expect(isValidTransition(null, 'closed')).toBe(false);
  });

  it('reclassified and no-self-loops are terminal invariants', () => {
    expect(EXPECTED.reclassified).toHaveLength(0);
    for (const from of ALL_STATES) {
      expect(isValidTransition(from, from), `${from} self-loop`).toBe(false);
    }
  });

  it('every non-initial state is reachable from submitted', () => {
    const reachable = new Set(['submitted']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const from of reachable) {
        for (const to of EXPECTED[from] ?? []) {
          if (!reachable.has(to)) { reachable.add(to); grew = true; }
        }
      }
    }
    expect([...reachable].sort()).toEqual(ALL_STATES.slice().sort());
  });
});
