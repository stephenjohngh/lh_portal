// src/lib/apps/maintenance/utils/planReport.js
//
// Assembles the model for the 10-Year Capital Plan Word document (R4) from the
// on-screen forecast, live membership and group assumptions. Pure + Type-1 tested;
// the /api/reports/generate-ten-year-plan endpoint is a pure renderer of this.
//
// The document reflects exactly what the planner sees — same window, same figures —
// and documents the BASIS of every number (renewal drivers + live condition), which
// is what makes a reserve-fund plan credible and R0-honest (these are the planner's
// assumptions, surfaced, not a machine's decision).

import { addYearsFractional } from './tenYearPlan.js';

// Local YYYY-MM-DD (never via toISOString — that shifts a date across the UTC
// boundary, e.g. a June date reads as May 31 under BST).
function toLocalYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The first renewal after a group's last renewal (last + lifetime). May be in the
 * past (i.e. overdue) — matches the tab's "Next Renewal" column.
 * @returns {string|null} YYYY-MM-DD
 */
export function nextRenewalDate(lastRenewal, lifetimeYears) {
  if (!lastRenewal || !lifetimeYears) return null;
  return toLocalYMD(addYearsFractional(new Date(lastRenewal + 'T00:00:00'), Number(lifetimeYears)));
}

/**
 * Build the serialisable plan-report payload posted to the render endpoint.
 *
 * @param {ReturnType<import('./tenYearPlan.js').buildTenYearForecast>} forecast
 * @param {Record<string, { total:number, byStatus:object, attention:number, manual:boolean }>} membership
 * @param {object[]} groups   maintenance_groups rows
 * @param {{ building?:string, generatedAt?:string }} [meta]
 */
export function buildPlanReportPayload(forecast, membership = {}, groups = [], meta = {}) {
  const years      = forecast.years;
  const grandTotal = forecast.grandTotal;
  const avgPerYear = years.length ? grandTotal / years.length : 0;

  // Peak-spend year.
  let peakYear = years[0] ?? null, peakSpend = 0;
  for (const y of years) {
    if ((forecast.perYear[y] ?? 0) > peakSpend) { peakSpend = forecast.perYear[y]; peakYear = y; }
  }

  // Forecast matrix (contributing groups × years).
  const matrix = forecast.rows.map(r => ({ name: r.name, byYear: r.byYear, total: r.total }));

  // Readable per-year breakdown — only years with spend, biggest item first.
  const byYear = years.map(y => ({
    year:  y,
    total: forecast.perYear[y] ?? 0,
    items: forecast.rows
      .filter(r => (r.byYear[y] ?? 0) > 0)
      .map(r => ({ name: r.name, amount: r.byYear[y] }))
      .sort((a, b) => b.amount - a.amount),
  })).filter(x => x.total > 0);

  // Assumptions register — every group carrying planning data, with the live
  // asset roll-up that justifies (or questions) the figures.
  const assumptions = groups
    .filter(g => g.last_renewal_date || g.lifetime_years || g.expected_cost)
    .map(g => {
      const m = membership[g.id] ?? {};
      return {
        name:          g.name,
        notes:         g.notes ?? '',
        lastRenewal:   g.last_renewal_date ?? null,
        lifetimeYears: g.lifetime_years ?? null,
        costPerCycle:  g.expected_cost ?? null,
        nextRenewal:   nextRenewalDate(g.last_renewal_date, g.lifetime_years),
        assets: {
          total:     m.total     ?? 0,
          failed:    m.byStatus?.failed  ?? 0,
          problem:   m.byStatus?.problem ?? 0,
          attention: m.attention ?? 0,
          manual:    m.manual    ?? false,
        },
      };
    })
    .sort((a, b) => (b.costPerCycle ?? 0) - (a.costPerCycle ?? 0) || a.name.localeCompare(b.name));

  return {
    building:    meta.building    ?? 'Lonsdale House',
    generatedAt: meta.generatedAt ?? '',
    startYear:   forecast.startYear,
    endYear:     years[years.length - 1] ?? forecast.startYear,
    years,
    perYear:     forecast.perYear,
    cumulative:  forecast.cumulative,
    grandTotal, avgPerYear, peakYear, peakSpend,
    groupCount:  forecast.rows.length,
    matrix, byYear, assumptions,
    incomplete:  forecast.incomplete.map(g => g.name),
  };
}
