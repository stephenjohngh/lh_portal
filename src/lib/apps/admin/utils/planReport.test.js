// src/lib/apps/admin/utils/planReport.test.js
//
// Pins the plan-report payload builder: summary figures, the per-year narrative
// (only years with spend, biggest-first), and the assumptions register (join of
// groups + membership + derived next renewal).

import { describe, it, expect } from 'vitest';
import { buildPlanReportPayload, nextRenewalDate } from './planReport.js';
import { buildTenYearForecast } from './tenYearPlan.js';

const groups = [
  { id: 'a', name: 'Lift',   last_renewal_date: '2020-06-01', lifetime_years: 10, expected_cost: 50000, notes: 'Otis' },
  { id: 'b', name: 'Boiler', last_renewal_date: '2025-01-01', lifetime_years: 3,  expected_cost: 9000,  notes: '' },
  { id: 'c', name: 'Blank',  last_renewal_date: null,         lifetime_years: null, expected_cost: null, notes: '' },
];
const membership = {
  a: { total: 2, byStatus: { ok: 1, problem: 0, failed: 1, inactive: 0 }, attention: 1, manual: false },
  b: { total: 1, byStatus: { ok: 1, problem: 0, failed: 0, inactive: 0 }, attention: 0, manual: false },
};

const forecast = buildTenYearForecast(groups, { startYear: 2026, years: 10 });
const payload  = buildPlanReportPayload(forecast, membership, groups, { building: 'LH', generatedAt: '22 Jul 2026' });

describe('nextRenewalDate', () => {
  it('adds lifetime to the last renewal', () => {
    expect(nextRenewalDate('2020-06-01', 10)).toBe('2030-06-01');
  });
  it('returns null when inputs are missing', () => {
    expect(nextRenewalDate(null, 10)).toBeNull();
    expect(nextRenewalDate('2020-06-01', null)).toBeNull();
  });
});

describe('buildPlanReportPayload', () => {
  it('carries the window + headline figures', () => {
    expect(payload.startYear).toBe(2026);
    expect(payload.endYear).toBe(2035);
    expect(payload.grandTotal).toBe(77000);              // 50k + 3×9k
    expect(payload.avgPerYear).toBeCloseTo(7700);
    expect(payload.peakYear).toBe(2030);                 // the lift renewal year
    expect(payload.peakSpend).toBe(50000);
    expect(payload.building).toBe('LH');
  });

  it('lists spend by year, biggest item first, skipping empty years', () => {
    const y2030 = payload.byYear.find(x => x.year === 2030);
    expect(y2030.total).toBe(50000);
    expect(y2030.items[0].name).toBe('Lift');
    // 2027 has no renewals → omitted from the narrative.
    expect(payload.byYear.some(x => x.year === 2027)).toBe(false);
  });

  it('builds an assumptions register from groups + membership, costliest first', () => {
    // Blank group (no planning data) is excluded.
    expect(payload.assumptions.map(a => a.name)).toEqual(['Lift', 'Boiler']);
    const lift = payload.assumptions[0];
    expect(lift.nextRenewal).toBe('2030-06-01');
    expect(lift.costPerCycle).toBe(50000);
    expect(lift.assets).toMatchObject({ total: 2, failed: 1, attention: 1, manual: false });
  });

  it('exposes the matrix for the appendix table', () => {
    const lift = payload.matrix.find(r => r.name === 'Lift');
    expect(lift.byYear[2030]).toBe(50000);
    expect(lift.total).toBe(50000);
  });
});
