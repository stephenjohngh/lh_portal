// src/lib/apps/golden_thread/utils/gtSafetyCase.js
//
// Pure builder for the Safety Case summary model — the single shape rendered
// both on-screen (GtSafetyCase.svelte) and into the Word export
// (/api/golden-thread/safety-case). No DB/I-O: the app passes in the already
// loaded register + completeness + MOR cases so the view and the document can
// never diverge. Type-1 testable (gtSafetyCase.test.js).

import { reviewBand, daysToReview } from './gtReview.js';

/** Display projection of a register document for the summary. */
function pickDoc(d, todayISO) {
  const band = d.review_due ? reviewBand(daysToReview(d, todayISO)) : null;
  return {
    reference: d.reference,
    title: d.title,
    document_type: d.document_type,
    schedule1_category: d.schedule1_category,
    effective_from: d.effective_from ?? null,
    review_due: d.review_due ?? null,
    review_band: band,
    safety_critical: !!d.safety_critical,
  };
}

/**
 * Assemble the Safety Case summary model.
 * @param {object} args
 * @param {Array} args.documents     register documents (any status; only 'current' is summarised)
 * @param {Array} args.completeness  scheduleOneCompleteness() output ({code,name,currentCount,satisfied})
 * @param {Array} args.morCases      MOR cases (mor/public.js listCases) — {reference,status,...}
 * @param {string} args.generatedAt  ISO timestamp
 * @param {string} [args.building]
 */
export function buildSafetyCaseModel({ documents = [], completeness = [], morCases = [], generatedAt, building = '' }) {
  const todayISO = (generatedAt ?? new Date().toISOString()).slice(0, 10);
  const current  = documents.filter((d) => d.status === 'current').map((d) => pickDoc(d, todayISO));

  let dueSoon = 0, overdue = 0;
  for (const d of current) {
    if (d.review_band === 'overdue') overdue++;
    else if (d.review_band) dueSoon++;
  }

  // Register grouped by Schedule-1 category (ascending), named from completeness.
  const catName = new Map(completeness.map((c) => [c.code, c.name]));
  const byCatMap = new Map();
  for (const d of current) {
    const arr = byCatMap.get(d.schedule1_category) ?? [];
    arr.push(d);
    byCatMap.set(d.schedule1_category, arr);
  }
  const byCategory = [...byCatMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([code, docs]) => ({ code, name: catName.get(code) ?? `Category ${code}`, documents: docs }));

  const safetyCritical = current.filter((d) => d.safety_critical);

  // Occurrences (MOR) — total + a status breakdown, most-common first.
  const byStatus = {};
  for (const c of morCases) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  const statusBreakdown = Object.entries(byStatus)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: generatedAt ?? new Date().toISOString(),
    building,
    summary: {
      current: current.length,
      safetyCritical: safetyCritical.length,
      dueSoon,
      overdue,
      categoriesApplicable: completeness.length,
      categoriesSatisfied: completeness.filter((c) => c.satisfied).length,
      occurrences: morCases.length,
    },
    completeness,
    byCategory,
    safetyCritical,
    occurrences: { total: morCases.length, byStatus: statusBreakdown },
  };
}
