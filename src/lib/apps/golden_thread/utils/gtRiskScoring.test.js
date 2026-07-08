// src/lib/apps/golden_thread/utils/gtRiskScoring.test.js
import { describe, it, expect } from 'vitest';
import {
  scoreBand, effectiveScore, escalateBand, riskAlertSignals, liveRating,
} from './gtRiskScoring.js';

describe('scoreBand', () => {
  it('bands the 5x5 range', () => {
    expect(scoreBand(1).band).toBe('low');       // 1..4
    expect(scoreBand(4).band).toBe('low');
    expect(scoreBand(5).band).toBe('medium');     // 5..9
    expect(scoreBand(9).band).toBe('medium');
    expect(scoreBand(10).band).toBe('high');      // 10..15
    expect(scoreBand(15).band).toBe('high');
    expect(scoreBand(16).band).toBe('very_high'); // 16..25
    expect(scoreBand(25).band).toBe('very_high');
  });
  it('null for no score', () => {
    expect(scoreBand(null)).toBeNull();
  });
});

describe('effectiveScore', () => {
  it('prefers residual over inherent', () => {
    expect(effectiveScore({ residual_score: 6, inherent_score: 20 })).toBe(6);
  });
  it('falls back to inherent, then likelihood×impact', () => {
    expect(effectiveScore({ inherent_score: 12 })).toBe(12);
    expect(effectiveScore({ likelihood: 3, impact: 4 })).toBe(12);
    expect(effectiveScore({})).toBeNull();
  });
});

describe('escalateBand', () => {
  it('bumps one step, capped at very_high', () => {
    expect(escalateBand(scoreBand(3)).band).toBe('medium');    // low → medium
    expect(escalateBand(scoreBand(12)).band).toBe('very_high');// high → very_high
    expect(escalateBand(scoreBand(20)).band).toBe('very_high');// very_high stays
  });
});

describe('riskAlertSignals', () => {
  const TODAY = '2026-07-07';
  it('detects each alert source', () => {
    const s = riskAlertSignals({
      morCases:    [{ status: 'in_triage' }],
      inspections: [{ inspection_result: 'failed' }],
      maintenance: [{ safety_critical: true, status: 'scheduled' }],
      documents:   [{ status: 'current', review_due: '2025-01-01' }],
      actions:     [{ status: 'open', priority: 1 }],
    }, TODAY);
    expect(s).toEqual({
      openMor: true, failedInspection: true, overdueMaintenance: true,
      expiredDocument: true, openHighAction: true,
    });
  });

  it('ignores non-alerting records', () => {
    const s = riskAlertSignals({
      morCases:    [{ status: 'closed' }],
      inspections: [{ inspection_result: 'ok' }],
      maintenance: [{ safety_critical: false, status: 'scheduled' }],
      documents:   [{ status: 'current', review_due: '2030-01-01' }],
      actions:     [{ status: 'completed', priority: 1 }],
    }, TODAY);
    expect(Object.values(s).every((v) => v === false)).toBe(true);
  });

  it('low-priority open action is not an alert', () => {
    const s = riskAlertSignals({ actions: [{ status: 'open', priority: 4 }] }, TODAY);
    expect(s.openHighAction).toBe(false);
  });
});

describe('liveRating', () => {
  it('no alerts → base band, not escalated', () => {
    const r = liveRating({ residual_score: 3 }, {});
    expect(r.band.band).toBe('low');
    expect(r.escalated).toBe(false);
    expect(r.activeAlerts).toEqual([]);
  });
  it('any alert escalates one band and lists the alerts', () => {
    const r = liveRating({ residual_score: 3 }, { openMor: true, failedInspection: false });
    expect(r.base.band).toBe('low');
    expect(r.band.band).toBe('medium');
    expect(r.escalated).toBe(true);
    expect(r.activeAlerts).toEqual(['openMor']);
  });
  it('no score → null band, never escalates', () => {
    const r = liveRating({}, { openMor: true });
    expect(r.band).toBeNull();
    expect(r.escalated).toBe(false);
  });
});
