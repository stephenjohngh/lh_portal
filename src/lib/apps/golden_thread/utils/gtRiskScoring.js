// src/lib/apps/golden_thread/utils/gtRiskScoring.js
//
// Pure risk-scoring logic (FR-RISK-002, FR-RISK-006). 5x5 likelihood × impact,
// inherent vs residual, RAG band, and the "live rating" that escalates while a
// linked operational record is in an alerting state. All computed at read time
// so the heat-map reflects current reality; nothing derived is stored. No I/O —
// Type-1 testable (gtRiskScoring.test.js).

export const RISK_DOMAINS = ['fire', 'structural', 'other'];
export const RISK_DOMAIN_LABELS = { fire: 'Fire', structural: 'Structural', other: 'Other' };
export const RISK_SOURCES = ['fra', 'mor', 'inspection', 'safety_case', 'survey', 'manual'];

export const LIKELIHOOD_LABELS = { 1: 'Rare', 2: 'Unlikely', 3: 'Possible', 4: 'Likely', 5: 'Almost certain' };
export const IMPACT_LABELS     = { 1: 'Negligible', 2: 'Minor', 3: 'Moderate', 4: 'Major', 5: 'Catastrophic' };

/**
 * RAG bands by (residual/inherent) score. Ordered ascending by `max`; the band
 * order also defines escalation steps. Configurable later via portal_settings.
 */
export const DEFAULT_RISK_BANDS = [
  { band: 'low',       max: 4,  label: 'Low',       badge: 'bg-green-600' },
  { band: 'medium',    max: 9,  label: 'Medium',    badge: 'bg-amber-600' },
  { band: 'high',      max: 15, label: 'High',      badge: 'bg-orange-600' },
  { band: 'very_high', max: 25, label: 'Very high', badge: 'bg-red-700' },
];

/** The band a numeric score falls into, or null when score is null. */
export function scoreBand(score, bands = DEFAULT_RISK_BANDS) {
  if (score == null || Number.isNaN(score)) return null;
  for (const b of bands) if (score <= b.max) return b;
  return bands[bands.length - 1];
}

/** Effective (control-adjusted) score: residual if set, else inherent. */
export function effectiveScore(risk) {
  if (!risk) return null;
  if (risk.residual_score != null) return risk.residual_score;
  if (risk.inherent_score != null) return risk.inherent_score;
  if (risk.likelihood != null && risk.impact != null) return risk.likelihood * risk.impact;
  return null;
}

/** Escalate a band by one step (capped at the top band). */
export function escalateBand(band, bands = DEFAULT_RISK_BANDS) {
  const i = bands.findIndex((b) => b.band === band?.band);
  if (i < 0) return band;
  return bands[Math.min(i + 1, bands.length - 1)];
}

/**
 * Which "live" alert signals are active for a risk, from its resolved linked
 * records. Each field is a boolean. Pure — the caller resolves the records.
 * @param {object} ctx
 * @param {Array<{status?:string}>} [ctx.morCases]           open = status not in closed/reclassified
 * @param {Array<{inspection_result?:string}>} [ctx.inspections]  failed/problem result
 * @param {Array<{status?:string, safety_critical?:boolean, overdue?:boolean}>} [ctx.maintenance] overdue & safety-critical
 * @param {Array<{status?:string, review_due?:string|null}>} [ctx.documents]  current doc past review_due
 * @param {Array<{status?:string, priority?:number}>} [ctx.actions]          open high-priority action
 * @param {string} todayISO  YYYY-MM-DD
 */
export function riskAlertSignals(ctx = {}, todayISO) {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  const MOR_TERMINAL = new Set(['closed', 'reclassified']);
  const openMor = (ctx.morCases ?? []).some((c) => c.status && !MOR_TERMINAL.has(c.status));
  const failedInspection = (ctx.inspections ?? []).some((i) => i.inspection_result === 'failed' || i.inspection_result === 'problem');
  // Linked maintenance that is incomplete/overdue. A linked job is treated as
  // relevant unless explicitly flagged safety_critical=false.
  const overdueMaintenance = (ctx.maintenance ?? []).some((m) =>
    m.safety_critical !== false && (m.overdue || (m.status && m.status !== 'completed')));
  const expiredDocument = (ctx.documents ?? []).some((d) => d.status === 'current' && d.review_due && d.review_due < today);
  const openHighAction = (ctx.actions ?? []).some((a) => a.status && a.status !== 'completed' && (a.priority == null || a.priority <= 2));
  return { openMor, failedInspection, overdueMaintenance, expiredDocument, openHighAction };
}

/** Human labels for the alert signals (for chips / tooltips). */
export const ALERT_LABELS = {
  openMor:            'Open occurrence (MOR)',
  failedInspection:   'Failed inspection',
  overdueMaintenance: 'Overdue safety-critical maintenance',
  expiredDocument:    'Expired control document',
  openHighAction:     'Open high-priority action',
};

/**
 * The live (effective) rating for a risk: its score band, escalated by one step
 * while any alert signal is active.
 * @param {object} risk
 * @param {Record<string, boolean>} [signals]  from riskAlertSignals()
 * @param {Array} [bands]
 * @returns {{ band: object|null, base: object|null, escalated: boolean, activeAlerts: string[] }}
 */
export function liveRating(risk, signals = {}, bands = DEFAULT_RISK_BANDS) {
  const base = scoreBand(effectiveScore(risk), bands);
  const activeAlerts = Object.keys(signals).filter((k) => signals[k]);
  if (base == null || activeAlerts.length === 0) {
    return { band: base, base, escalated: false, activeAlerts: [] };
  }
  return { band: escalateBand(base, bands), base, escalated: true, activeAlerts };
}
