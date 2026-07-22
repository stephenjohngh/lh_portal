// src/lib/apps/admin/utils/tenYearPlan.test.js
//
// Pins the pure capital-plan forecast engine: renewal spreading, overdue
// collapse, per-year totals, cumulative reserve, incomplete-group reporting and
// window/horizon handling. `today` and `startYear` are injected so the tests are
// deterministic without faking the clock (the one default-derivation test passes
// an explicit `today`). Dates are plain YYYY-MM-DD; the engine parses them as
// local midnight, so calendar years are read in local time here too.

import { describe, it, expect } from 'vitest';
import {
  buildTenYearForecast, renewalOccurrences, addYearsFractional,
} from './tenYearPlan.js';

const group = (over) => ({
  id: 'g', name: 'Group', last_renewal_date: null, lifetime_years: null, expected_cost: null, ...over,
});

// A fixed window used by most tests: 2026..2035 inclusive.
const WIN = { startYear: 2026, years: 10 };

describe('addYearsFractional', () => {
  it('adds whole years', () => {
    expect(addYearsFractional(new Date(2020, 0, 1), 10).getFullYear()).toBe(2030);
  });
  it('adds the fractional part as rounded months', () => {
    const d = addYearsFractional(new Date(2025, 0, 1), 7.5); // +7yr 6mo
    expect(d.getFullYear()).toBe(2032);
    expect(d.getMonth()).toBe(6); // July (0-indexed)
  });
});

describe('renewalOccurrences', () => {
  it('returns nothing when planning fields are missing', () => {
    expect(renewalOccurrences(group({ lifetime_years: 10, expected_cost: 5000 }), 2026, 2035)).toEqual([]); // no last_renewal
    expect(renewalOccurrences(group({ last_renewal_date: '2020-01-01', expected_cost: 5000 }), 2026, 2035)).toEqual([]); // no lifetime
    expect(renewalOccurrences(group({ last_renewal_date: '2020-01-01', lifetime_years: 10 }), 2026, 2035)).toEqual([]); // no cost
  });

  it('places a single future renewal in its year', () => {
    const occ = renewalOccurrences(
      group({ last_renewal_date: '2020-06-01', lifetime_years: 10, expected_cost: 50000 }), 2026, 2035);
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ year: 2030, cost: 50000, overdue: false });
  });

  it('repeats the cycle across the window', () => {
    const occ = renewalOccurrences(
      group({ last_renewal_date: '2025-01-01', lifetime_years: 3, expected_cost: 9000 }), 2026, 2035);
    expect(occ.map(o => o.year)).toEqual([2028, 2031, 2034]);
  });

  it('collapses multiple overdue renewals into ONE first-year occurrence', () => {
    // 2010 +5 → 2015, 2020, 2025 (all before window) then 2030, 2035.
    const occ = renewalOccurrences(
      group({ last_renewal_date: '2010-01-01', lifetime_years: 5, expected_cost: 20000 }), 2026, 2035);
    expect(occ.map(o => o.year)).toEqual([2026, 2030, 2035]);
    expect(occ[0].overdue).toBe(true);
    expect(occ[1].overdue).toBe(false);
  });
});

describe('buildTenYearForecast', () => {
  it('handles no groups', () => {
    const f = buildTenYearForecast([], WIN);
    expect(f.rows).toEqual([]);
    expect(f.grandTotal).toBe(0);
    expect(f.years).toHaveLength(10);
    expect(f.years[0]).toBe(2026);
    expect(f.years[9]).toBe(2035);
  });

  it('spreads capex per year with a running cumulative reserve', () => {
    const f = buildTenYearForecast([
      group({ id: 'a', name: 'Lift', last_renewal_date: '2020-06-01', lifetime_years: 10, expected_cost: 50000 }), // 2030
      group({ id: 'b', name: 'Boiler', last_renewal_date: '2025-01-01', lifetime_years: 3, expected_cost: 9000 }), // 2028,2031,2034
    ], WIN);

    expect(f.perYear[2028]).toBe(9000);
    expect(f.perYear[2030]).toBe(50000);
    expect(f.perYear[2031]).toBe(9000);
    expect(f.perYear[2034]).toBe(9000);
    expect(f.perYear[2027]).toBe(0);

    // Cumulative reserve = running total across the window.
    expect(f.cumulative[2027]).toBe(0);
    expect(f.cumulative[2028]).toBe(9000);
    expect(f.cumulative[2030]).toBe(59000);
    expect(f.cumulative[2035]).toBe(77000);
    expect(f.grandTotal).toBe(77000);
  });

  it('sorts rows by total capex descending', () => {
    const f = buildTenYearForecast([
      group({ id: 'small', name: 'Alarms', last_renewal_date: '2025-01-01', lifetime_years: 5, expected_cost: 4000 }),
      group({ id: 'big',   name: 'Roof',   last_renewal_date: '2020-01-01', lifetime_years: 10, expected_cost: 80000 }),
    ], WIN);
    expect(f.rows.map(r => r.id)).toEqual(['big', 'small']);
  });

  it('reports groups with partial planning data as incomplete (not in rows)', () => {
    const f = buildTenYearForecast([
      group({ id: 'p', name: 'Partial', expected_cost: 12000 }),      // has a cost, no cycle
      group({ id: 'blank', name: 'Blank' }),                          // nothing set
    ], WIN);
    expect(f.rows).toEqual([]);
    expect(f.incomplete).toEqual([{ id: 'p', name: 'Partial' }]);     // blank omitted entirely
  });

  it('excludes a group whose whole cycle falls outside the window', () => {
    // last 2024 + 20 = 2044, well past 2035 → no occurrences, and it HAS data, so
    // it is flagged incomplete rather than silently dropped.
    const f = buildTenYearForecast([
      group({ id: 'far', name: 'Structure', last_renewal_date: '2024-01-01', lifetime_years: 20, expected_cost: 100000 }),
    ], WIN);
    expect(f.rows).toEqual([]);
    expect(f.incomplete).toEqual([{ id: 'far', name: 'Structure' }]);
  });

  it('honours a custom horizon length', () => {
    const f = buildTenYearForecast([], { startYear: 2026, years: 5 });
    expect(f.years).toEqual([2026, 2027, 2028, 2029, 2030]);
  });

  it('derives startYear from `today` when not given', () => {
    const f = buildTenYearForecast([], { today: new Date(2026, 0, 1) });
    expect(f.startYear).toBe(2026);
    expect(f.years[0]).toBe(2026);
  });

  it('collapses an overdue renewal into year 1 of the plan', () => {
    const f = buildTenYearForecast([
      group({ id: 'od', name: 'EICR', last_renewal_date: '2019-01-01', lifetime_years: 5, expected_cost: 6000 }),
    ], WIN);
    // 2024 renewal is overdue → year 2026; 2029, 2034 land normally.
    expect(f.perYear[2026]).toBe(6000);
    expect(f.perYear[2029]).toBe(6000);
    expect(f.perYear[2034]).toBe(6000);
    expect(f.rows[0].occurrences[0].overdue).toBe(true);
  });
});
