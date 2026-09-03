// src/lib/apps/complaints/utils/complaintLifecycle.test.js

import { describe, it, expect } from 'vitest';
import {
  STATUS, STATUS_ORDER, STATUS_META, OPEN_STATUSES,
  statusMeta, isValidTransition, nextStatuses, isTerminal, isOpen,
  stampsFor, entryTypeFor, blockedReason,
} from './complaintLifecycle.js';

const ALL = Object.values(STATUS);

describe('the state set', () => {
  it('is the seven states the migration allows', () => {
    // If this fails, migration 187's CHECK constraint and this file disagree,
    // and the UI will offer a state the database refuses.
    expect(ALL.sort()).toEqual([
      'acknowledged', 'closed', 'escalated_to_bsr',
      'investigating', 'received', 'responded', 'withdrawn',
    ]);
  });

  it('gives every state an order, a label and a hint', () => {
    expect(STATUS_ORDER.sort()).toEqual(ALL.sort());
    for (const s of ALL) {
      expect(STATUS_META[s].label).toBeTruthy();
      expect(STATUS_META[s].badge).toMatch(/^bg-/);
      expect(STATUS_META[s].hint).toBeTruthy();
    }
  });

  it('renders an unknown status rather than blanking', () => {
    expect(statusMeta('nonsense').label).toBe('nonsense');
    expect(statusMeta(undefined).label).toBe('Unknown');
  });
});

describe('isValidTransition — the happy path', () => {
  it('walks received to closed', () => {
    expect(isValidTransition(STATUS.RECEIVED, STATUS.ACKNOWLEDGED)).toBe(true);
    expect(isValidTransition(STATUS.ACKNOWLEDGED, STATUS.INVESTIGATING)).toBe(true);
    expect(isValidTransition(STATUS.INVESTIGATING, STATUS.RESPONDED)).toBe(true);
    expect(isValidTransition(STATUS.RESPONDED, STATUS.CLOSED)).toBe(true);
  });

  it('allows an update that does not move the status', () => {
    for (const s of ALL) expect(isValidTransition(s, s)).toBe(true);
  });
});

describe('isValidTransition — the rules worth having', () => {
  it('will not skip acknowledgement or investigation', () => {
    expect(isValidTransition(STATUS.RECEIVED, STATUS.INVESTIGATING)).toBe(false);
    expect(isValidTransition(STATUS.RECEIVED, STATUS.RESPONDED)).toBe(false);
    expect(isValidTransition(STATUS.ACKNOWLEDGED, STATUS.RESPONDED)).toBe(false);
  });

  it('will not close a complaint that was never responded to', () => {
    // The state machine's half of it; blockedReason() carries the other half.
    expect(isValidTransition(STATUS.INVESTIGATING, STATUS.CLOSED)).toBe(false);
    expect(isValidTransition(STATUS.RECEIVED, STATUS.CLOSED)).toBe(false);
  });

  it('keeps escalation available AFTER responding and after closing', () => {
    // The whole reason `responded` is not an ending: the escalation window has
    // to stay visible, and escalation can arrive after the file was closed.
    expect(isValidTransition(STATUS.RESPONDED, STATUS.ESCALATED)).toBe(true);
    expect(isValidTransition(STATUS.CLOSED, STATUS.ESCALATED)).toBe(true);
  });

  it('allows a closed complaint to be reopened for investigation', () => {
    expect(isValidTransition(STATUS.CLOSED, STATUS.INVESTIGATING)).toBe(true);
  });

  it('lets a complaint be withdrawn at any point before it ends', () => {
    for (const s of [STATUS.RECEIVED, STATUS.ACKNOWLEDGED, STATUS.INVESTIGATING, STATUS.RESPONDED]) {
      expect(isValidTransition(s, STATUS.WITHDRAWN)).toBe(true);
    }
  });

  it('treats escalated and withdrawn as terminal', () => {
    for (const from of [STATUS.ESCALATED, STATUS.WITHDRAWN]) {
      for (const to of ALL.filter(s => s !== from)) {
        expect(isValidTransition(from, to)).toBe(false);
      }
    }
    expect(isTerminal(STATUS.ESCALATED)).toBe(true);
    expect(isTerminal(STATUS.WITHDRAWN)).toBe(true);
    expect(isTerminal(STATUS.RESPONDED)).toBe(false);
  });

  it('refuses a status it has never heard of, in either direction', () => {
    expect(isValidTransition('made_up', STATUS.CLOSED)).toBe(false);
    expect(isValidTransition(STATUS.RECEIVED, 'made_up')).toBe(false);
    expect(nextStatuses('made_up')).toEqual([]);
  });
});

describe('isOpen', () => {
  it('counts everything still on somebody′s desk', () => {
    expect(OPEN_STATUSES).toHaveLength(4);
    expect(isOpen(STATUS.RESPONDED)).toBe(true);   // responded is still open
    expect(isOpen(STATUS.CLOSED)).toBe(false);
    expect(isOpen(STATUS.ESCALATED)).toBe(false);
    expect(isOpen(STATUS.WITHDRAWN)).toBe(false);
  });
});

describe('stampsFor', () => {
  const NOW = '2026-09-03T10:00:00.000Z';

  it('stamps the date each state is about', () => {
    expect(stampsFor(STATUS.ACKNOWLEDGED, NOW)).toEqual({ acknowledged_at: NOW });
    expect(stampsFor(STATUS.RESPONDED, NOW)).toEqual({ responded_at: NOW });
    expect(stampsFor(STATUS.CLOSED, NOW)).toEqual({ closed_at: NOW });
    expect(stampsFor(STATUS.ESCALATED, NOW)).toEqual({ escalated_at: NOW });
  });

  it('CLEARS closed_at when a complaint is reopened', () => {
    // Otherwise a live complaint reads as finished in every report.
    expect(stampsFor(STATUS.INVESTIGATING, NOW)).toEqual({ closed_at: null });
  });

  it('does not stamp escalation_told_at — that is a separate act', () => {
    for (const s of ALL) {
      expect(stampsFor(s, NOW)).not.toHaveProperty('escalation_told_at');
    }
  });

  it('stamps nothing for a state with no date of its own', () => {
    expect(stampsFor(STATUS.WITHDRAWN, NOW)).toEqual({});
    expect(stampsFor(STATUS.RECEIVED, NOW)).toEqual({});
  });
});

describe('entryTypeFor', () => {
  it('names the entry after what happened', () => {
    expect(entryTypeFor(STATUS.ACKNOWLEDGED)).toBe('acknowledgement');
    expect(entryTypeFor(STATUS.RESPONDED)).toBe('response');
    expect(entryTypeFor(STATUS.ESCALATED)).toBe('escalation');
    expect(entryTypeFor(STATUS.CLOSED)).toBe('closure');
  });

  it('falls back to a plain status change', () => {
    expect(entryTypeFor(STATUS.WITHDRAWN)).toBe('status_change');
    expect(entryTypeFor('made_up')).toBe('status_change');
  });

  it('only ever returns a type the migration allows', () => {
    const ALLOWED = [
      'status_change', 'note', 'acknowledgement', 'investigation', 'response',
      'escalation', 'sla_pause', 'sla_resume', 'reopened', 'closure',
      'scope_decision', 'assignment',
    ];
    for (const s of ALL) expect(ALLOWED).toContain(entryTypeFor(s));
  });
});

describe('blockedReason', () => {
  const at = (status, extra = {}) => ({ status, ...extra });

  it('says nothing when the move is fine', () => {
    expect(blockedReason(at(STATUS.RECEIVED), STATUS.ACKNOWLEDGED)).toBeNull();
  });

  it('will not respond without a response written', () => {
    expect(blockedReason(at(STATUS.INVESTIGATING), STATUS.RESPONDED))
      .toMatch(/response first/i);
    expect(blockedReason(at(STATUS.INVESTIGATING, { response_text: '   ' }), STATUS.RESPONDED))
      .toMatch(/response first/i);
    expect(blockedReason(at(STATUS.INVESTIGATING, { response_text: 'Fixed.' }), STATUS.RESPONDED))
      .toBeNull();
  });

  it('will not close a complaint that was never answered', () => {
    // Reachable: closed -> investigating -> ... a reopened complaint whose
    // responded_at was never set could otherwise be closed silently.
    expect(blockedReason(at(STATUS.RESPONDED), STATUS.CLOSED)).toMatch(/Respond before closing/i);
    expect(blockedReason(at(STATUS.RESPONDED, { responded_at: '2026-09-01' }), STATUS.CLOSED))
      .toBeNull();
  });

  it('explains an illegal move in words, naming both states', () => {
    const why = blockedReason(at(STATUS.RECEIVED), STATUS.CLOSED);
    expect(why).toContain('Received');
    expect(why).toContain('Closed');
  });

  it('survives being handed nothing', () => {
    expect(blockedReason(null, STATUS.CLOSED)).toBeTruthy();
    expect(blockedReason(undefined, STATUS.CLOSED)).toBeTruthy();
  });
});
