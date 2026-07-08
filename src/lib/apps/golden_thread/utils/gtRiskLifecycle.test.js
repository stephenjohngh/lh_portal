// src/lib/apps/golden_thread/utils/gtRiskLifecycle.test.js
import { describe, it, expect } from 'vitest';
import { RISK_STATUSES, nextRiskStates, isValidRiskTransition } from './gtRiskLifecycle.js';

describe('gtRiskLifecycle', () => {
  it('forward flow identified → assessed → controlled → monitored', () => {
    expect(isValidRiskTransition('identified', 'assessed')).toBe(true);
    expect(isValidRiskTransition('assessed', 'controlled')).toBe(true);
    expect(isValidRiskTransition('controlled', 'monitored')).toBe(true);
  });

  it('allows re-assessment (loops back to assessed)', () => {
    expect(isValidRiskTransition('controlled', 'assessed')).toBe(true);
    expect(isValidRiskTransition('monitored', 'assessed')).toBe(true);
  });

  it('close / supersede from active states; reopen from closed', () => {
    expect(isValidRiskTransition('monitored', 'closed')).toBe(true);
    expect(isValidRiskTransition('monitored', 'superseded')).toBe(true);
    expect(isValidRiskTransition('closed', 'monitored')).toBe(true);
  });

  it('superseded is terminal', () => {
    expect(nextRiskStates('superseded')).toEqual([]);
    expect(isValidRiskTransition('superseded', 'monitored')).toBe(false);
  });

  it('rejects skips and unknowns', () => {
    expect(isValidRiskTransition('identified', 'monitored')).toBe(false);
    expect(isValidRiskTransition('identified', 'controlled')).toBe(false);
    expect(isValidRiskTransition('bogus', 'assessed')).toBe(false);
  });

  it('nextRiskStates only returns members of RISK_STATUSES', () => {
    for (const s of RISK_STATUSES) {
      for (const n of nextRiskStates(s)) expect(RISK_STATUSES).toContain(n);
    }
  });
});
