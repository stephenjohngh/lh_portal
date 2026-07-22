// src/lib/apps/maintenance/utils/tenYearPlan.js
//
// Pure capital-plan forecast engine for the 10-Year Plan (Admin → Long Term).
//
// Given a set of maintenance_groups — each a replaceable asset class carrying a
// last_renewal_date, a lifetime_years cycle and an expected_cost — this projects
// every renewal occurrence into its calendar year across a plan window and sums
// the capex per year, then accumulates it into a cumulative reserve requirement.
//
// DESIGN PRINCIPLE (R0 — the planner authors, derivation only assists):
//   * This is a *forecast*, not a decision. It reads the group inputs the planner
//     controls (last_renewal_date / lifetime_years / expected_cost) and spreads
//     them across the years. Changing any of those inputs re-shapes the forecast;
//     nothing here overrides a planner's figure.
//   * A group with no membership (a purely manual capital line — "external
//     redecoration", "reserve contingency") is a first-class citizen: it just
//     needs the three planning fields and it forecasts like any other.
//   * A group missing any of the three fields simply contributes nothing to the
//     spread and is reported in `incomplete` so the UI can prompt for it.
//
// Everything here is pure (no store / DB / Date.now hidden state — `today` is an
// injectable option) so it is Type-1 unit tested (tenYearPlan.test.js).

/** @typedef {{ id:string, name:string, last_renewal_date:string|null, lifetime_years:number|null, expected_cost:number|null }} PlanGroup */

/**
 * Advance a date by a fractional number of years (whole years + rounded months),
 * matching TenYearPlanTab.expectedRenewal so the tab's per-group "next renewal"
 * and this forecast agree to the month.
 * @param {Date} date
 * @param {number} years
 * @returns {Date}
 */
export function addYearsFractional(date, years) {
  const d = new Date(date);
  const whole  = Math.floor(years);
  const months = Math.round((years - whole) * 12);
  d.setFullYear(d.getFullYear() + whole);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Renewal occurrences for a single group that fall within [startYear..endYear].
 *
 * Renewals cycle from last_renewal_date by lifetime_years: last+L, last+2L, …
 * A renewal whose calendar year is before the window is an outstanding liability
 * (overdue / due now); it is collapsed into a SINGLE occurrence in the first plan
 * year (you only owe the outstanding renewal once, not once per missed cycle).
 *
 * @param {PlanGroup} g
 * @param {number} startYear
 * @param {number} endYear
 * @returns {Array<{ date:string, year:number, cost:number, overdue:boolean }>}
 */
export function renewalOccurrences(g, startYear, endYear) {
  const cost = Number(g.expected_cost) || 0;
  const life = Number(g.lifetime_years) || 0;
  if (!g.last_renewal_date || life <= 0 || cost <= 0) return [];

  const occ = [];
  let d = addYearsFractional(new Date(g.last_renewal_date + 'T00:00:00'), life);
  let seenOverdue = false;
  let guard = 0;

  while (guard++ < 1000) {
    const yActual = d.getFullYear();
    if (yActual > endYear) break;
    if (yActual < startYear) {
      // Outstanding renewal → count once, in the first plan year.
      if (!seenOverdue) {
        seenOverdue = true;
        occ.push({ date: d.toISOString().split('T')[0], year: startYear, cost, overdue: true });
      }
    } else {
      occ.push({ date: d.toISOString().split('T')[0], year: yActual, cost, overdue: false });
    }
    d = addYearsFractional(d, life);
  }
  return occ;
}

/**
 * Build the whole-plan forecast.
 *
 * @param {PlanGroup[]} groups
 * @param {{ startYear?:number, years?:number, today?:Date }} [opts]
 * @returns {{
 *   startYear:number, years:number[],
 *   rows:Array<{ id:string, name:string, lifetime_years:number|null, expected_cost:number|null,
 *                occurrences:Array<{date:string,year:number,cost:number,overdue:boolean}>,
 *                byYear:Record<number,number>, total:number }>,
 *   incomplete:Array<{ id:string, name:string }>,
 *   perYear:Record<number,number>, cumulative:Record<number,number>, grandTotal:number
 * }}
 */
export function buildTenYearForecast(groups, { startYear, years = 10, today = new Date() } = {}) {
  const start = startYear ?? today.getFullYear();
  const span  = Math.max(1, Math.floor(years));
  const end   = start + span - 1;
  const yearList = Array.from({ length: span }, (_, i) => start + i);

  const rows = [];
  const incomplete = [];
  const perYear = Object.fromEntries(yearList.map(y => [y, 0]));

  for (const g of groups ?? []) {
    const occ = renewalOccurrences(g, start, end);
    if (occ.length === 0) {
      // Nothing to forecast — either a group with no planning data, or one whose
      // whole cycle lands outside the window.
      const hasPlanningData = g.last_renewal_date || g.lifetime_years || g.expected_cost;
      if (hasPlanningData) incomplete.push({ id: g.id, name: g.name });
      continue;
    }
    const byYear = Object.fromEntries(yearList.map(y => [y, 0]));
    for (const o of occ) {
      byYear[o.year]  += o.cost;
      perYear[o.year] += o.cost;
    }
    rows.push({
      id: g.id,
      name: g.name,
      lifetime_years: g.lifetime_years ?? null,
      expected_cost:  g.expected_cost  ?? null,
      occurrences: occ,
      byYear,
      total: occ.reduce((s, o) => s + o.cost, 0),
    });
  }

  // Cumulative reserve requirement — the running sum of capex across the window.
  let running = 0;
  const cumulative = {};
  for (const y of yearList) { running += perYear[y]; cumulative[y] = running; }

  const grandTotal = yearList.reduce((s, y) => s + perYear[y], 0);

  // Heaviest capex first, then by name — the biggest renewals lead the plan.
  rows.sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name));

  return { startYear: start, years: yearList, rows, incomplete, perYear, cumulative, grandTotal };
}
