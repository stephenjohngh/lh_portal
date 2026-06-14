// src/lib/apps/mor/utils/morHelpers.test.js
// The statutory SLA clocks, the transition map (mirrors the migration-137 SQL
// trigger), and the personal-queue / nudge predicates. The 10-day BSR clock is
// the compliance-critical one.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bsrReportClock, genericClock, isValidTransition,
  isAwaitingMyApproval, isMyProposalAwaitingApproval, isOpenCase,
} from './morHelpers.js';

const NOW = new Date('2026-06-14T12:00:00Z').getTime();
const inDays = (d) => new Date(NOW + d * 86_400_000).toISOString();

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(()  => { vi.useRealTimers(); });

describe('bsrReportClock — 10-day statutory clock', () => {
  it('returns null without an identification date', () => {
    expect(bsrReportClock(null)).toBeNull();
  });
  it('is breached once the 10 days have passed', () => {
    // identified 11 days ago → deadline was yesterday
    expect(bsrReportClock(inDays(-11)).status).toBe('breach');
  });
  it('is critical inside the final day', () => {
    expect(bsrReportClock(inDays(-9.2)).status).toBe('critical'); // ~0.8 days left
  });
  it('is a warning within 3 days', () => {
    expect(bsrReportClock(inDays(-8)).status).toBe('warning');    // ~2 days left
  });
  it('is ok with plenty of time', () => {
    expect(bsrReportClock(inDays(-1)).status).toBe('ok');         // ~9 days left
  });
  it('anchors the deadline at identification + 10 days', () => {
    const c = bsrReportClock(inDays(0));
    expect(c.daysLeft).toBe(10);
  });
});

describe('genericClock', () => {
  it('returns null without a start date', () => {
    expect(genericClock(null, 24)).toBeNull();
  });
  it('breaches once the target hours elapse', () => {
    const start = new Date(NOW - 30 * 3_600_000).toISOString(); // 30h ago, 24h target
    const c = genericClock(start, 24, 'Ack');
    expect(c.status).toBe('breach');
    expect(c.label).toMatch(/BREACHED/);
  });
  it('is ok early in the window', () => {
    const start = new Date(NOW - 1 * 3_600_000).toISOString();  // 1h ago, 24h target
    expect(genericClock(start, 24).status).toBe('ok');
  });
});

describe('isValidTransition', () => {
  it('permits documented transitions', () => {
    expect(isValidTransition('submitted', 'acknowledged')).toBe(true);
    expect(isValidTransition('decision_pending', 'bsr_notice')).toBe(true);
    expect(isValidTransition('decision_pending', 'in_triage')).toBe(true); // rejection path
    expect(isValidTransition('closed', 'reopened')).toBe(true);
  });
  it('forbids undocumented transitions and terminal exits', () => {
    expect(isValidTransition('submitted', 'closed')).toBe(false);
    expect(isValidTransition('reclassified', 'in_triage')).toBe(false);   // terminal
    expect(isValidTransition('nonsense', 'closed')).toBe(false);
  });
});

describe('personal-queue predicates', () => {
  const base = { status: 'decision_pending', decision_outcome: 'bsr', decision_proposed_by: 'alice', decision_approved_by: null };

  it('isAwaitingMyApproval: admin, not the proposer, unapproved', () => {
    expect(isAwaitingMyApproval(base, 'bob', true)).toBe(true);
    expect(isAwaitingMyApproval(base, 'alice', true)).toBe(false); // proposer can't approve
    expect(isAwaitingMyApproval(base, 'bob', false)).toBe(false);  // not admin
  });

  it('isMyProposalAwaitingApproval: I proposed it and it is still pending', () => {
    expect(isMyProposalAwaitingApproval(base, 'alice')).toBe(true);
    expect(isMyProposalAwaitingApproval(base, 'bob')).toBe(false);
  });

  it('isOpenCase: true for non-terminal statuses', () => {
    expect(isOpenCase({ status: 'in_triage' })).toBe(true);
    expect(isOpenCase({ status: 'closed' })).toBe(false);
    expect(isOpenCase({ status: 'reclassified' })).toBe(false);
    expect(isOpenCase(null)).toBe(false);
  });
});
