// src/lib/utils/statutoryExclusions.js
//
// The recorded decision that a periodic check does not apply to this building
// (migration 208's `statutory_exclusions`). Pure, no I/O — Type-1 testable.
//
// The table is APPEND-ONLY: a decision is never edited or deleted, it is
// superseded by a later one. So "is this check currently excluded?" is a
// reduction over the log rather than a column read, and that reduction is here
// so it is testable and so every surface answers it the same way.

/**
 * @typedef {object} ExclusionDecision
 * @property {string} template_key
 * @property {'not_applicable'|'applicable'} decision
 * @property {string} reason
 * @property {string|null} [review_due]
 * @property {string|null} [decided_by]
 * @property {string} decided_at
 */

/** Newest decision wins; ties break on id so the answer is never arbitrary. */
function newer(a, b) {
  const ta = Date.parse(a?.decided_at ?? '') || 0;
  const tb = Date.parse(b?.decided_at ?? '') || 0;
  if (ta !== tb) return ta > tb ? a : b;
  return String(a?.id ?? '') >= String(b?.id ?? '') ? a : b;
}

/**
 * The current position per template key — the latest decision in the log.
 * @param {ExclusionDecision[]} rows
 * @returns {Map<string, ExclusionDecision>}
 */
export function currentDecisions(rows) {
  const out = new Map();
  for (const r of rows ?? []) {
    const key = r?.template_key;
    if (!key) continue;
    const held = out.get(key);
    out.set(key, held ? newer(r, held) : r);
  }
  return out;
}

/**
 * Keys currently excluded. A key whose latest decision is 'applicable' is NOT
 * excluded — that is a reinstatement, and the earlier exclusion stays in the
 * log as history rather than being erased.
 * @param {ExclusionDecision[]} rows
 * @returns {string[]}
 */
export function excludedKeys(rows) {
  return [...currentDecisions(rows)]
    .filter(([, d]) => d.decision === 'not_applicable')
    .map(([key]) => key);
}

/**
 * Every decision ever recorded for one key, newest first — the "who decided
 * this, when, and why" answer, including reversals.
 * @param {ExclusionDecision[]} rows
 * @param {string} key
 */
export function decisionHistory(rows, key) {
  return (rows ?? [])
    .filter(r => r?.template_key === key)
    .sort((a, b) => (Date.parse(b?.decided_at ?? '') || 0) - (Date.parse(a?.decided_at ?? '') || 0));
}

/**
 * Exclusions whose review date has passed, or falls within `withinDays`.
 *
 * An exclusion nobody revisits is how a building drifts out of compliance while
 * its register still reads green: "no dwelling is let on a relevant tenancy"
 * is exactly the kind of statement that quietly stops being true.
 *
 * @param {ExclusionDecision[]} rows
 * @param {{ today?: string, withinDays?: number }} [opts]
 */
export function reviewsDue(rows, opts = {}) {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const withinDays = opts.withinDays ?? 0;
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + withinDays * 86_400_000)
    .toISOString().slice(0, 10);

  return [...currentDecisions(rows).values()]
    .filter(d => d.decision === 'not_applicable' && d.review_due && d.review_due <= horizon)
    .sort((a, b) => String(a.review_due).localeCompare(String(b.review_due)));
}

/**
 * Is this reason good enough to record against a legal requirement?
 *
 * Deliberately minimal — it rejects nothing and empty, and that is all. The
 * point is to stop a blank or a shrug being stored as a compliance decision,
 * not to referee the wording: a real reason can be four words ("No lift in
 * building") and a long one can still be worthless. The DB enforces non-empty
 * too, because the form is not the only thing that could write this row.
 * @param {string} reason
 */
export function isRecordableReason(reason) {
  return String(reason ?? '').trim().length >= 3;
}
