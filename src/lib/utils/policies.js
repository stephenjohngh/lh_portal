// src/lib/utils/policies.js
//
// The portal's POLICY numbers in ONE list, each an admin setting: Admin →
// Other Config → Policies (2026-10-04, PROJECT_STATUS §6ccc item 10, B).
// User, 2026-10-03: "things that can change … should have an admin parameter".
//
// Each entry is the SHIPPED DEFAULT — the number the code used when they were
// gathered — with the bounds an admin may move it within. Exactly the Due
// windows pattern (dueWindows.js): what is stored (portal_settings, key
// `policies`) is only the values that DIFFER from the default, so an untouched
// one follows the default, including a later release's.
//
// ⛔ READ A POLICY WHEN IT IS USED — policy('parkingOfferDays') inside the
// function — never once at module scope: a module loads before the setting
// does. On the server, ensure the setting is fresh first
// (`#lib/server/policies.js` → `loadServerPolicies()`).
//
// ⚠ Bounds are deliberate: an admin is trusted, but a sign-in lockout of 0 or
// a rate limit of 100,000 is not a policy, it is the control switched off.
// Groups whose values must rise in order (review bands, risk bands) are
// checked as a group.
//
// Pure: imports nothing, so the browser and the server share it.

export const POLICIES_KEY = 'policies';

/**
 * Rate limits on the public and AI endpoints: the window is part of what the
 * limit means, so only the number allowed in it is a policy.
 */
export const RATE_LIMIT_WINDOWS = Object.freeze({
  photo_upload:  { windowMinutes: 15, label: 'Photos uploaded to the public MOR form, per address',   default: 10,  max: 100 },
  case_submit:   { windowMinutes: 60, label: 'Reports sent through the public MOR form, per address',  default: 3,   max: 50 },
  status_lookup: { windowMinutes: 15, label: 'Public MOR status look-ups, per address',               default: 10,  max: 100 },
  ai_suggest:    { windowMinutes: 60, label: 'AI action suggestions, per person',                     default: 60,  max: 1000 },
  ai_summary:    { windowMinutes: 60, label: 'AI summaries, per person',                              default: 60,  max: 1000 },
  pack_read:     { windowMinutes: 15, label: 'Published Dossier pack page views, per address',        default: 120, max: 2000 },
  pack_asset:    { windowMinutes: 15, label: 'Published Dossier pack files and images, per address',  default: 300, max: 5000 },
  pack_unlock:   { windowMinutes: 15, label: 'Passphrase attempts on a published pack, per address',  default: 10,  max: 50 },
  pack_archive:  { windowMinutes: 15, label: 'Whole-pack downloads, per person',                     default: 10,  max: 100 },
});

/** @typedef {{ key: string, area: string, label: string, unit: string, default: number, min: number, max: number, governs: string, group?: string }} PolicyDef */

/** @type {ReadonlyArray<PolicyDef>} */
const DEFS = Object.freeze([
  { key: 'loginFailuresPerAddress', area: 'Sign-in', unit: 'wrong passwords', default: 5, min: 3, max: 50,
    label: 'Wrong passwords from one address before it is paused',
    governs: 'What one person guessing meets. The account owner signing in from elsewhere is not affected.' },
  { key: 'loginFailuresPerAccount', area: 'Sign-in', unit: 'wrong passwords', default: 20, min: 5, max: 500,
    label: 'Wrong passwords for one account, from anywhere, before it is paused',
    governs: 'The ceiling for a guesser who changes address.' },
  { key: 'loginPauseMinutes', area: 'Sign-in', unit: 'minutes', default: 15, min: 1, max: 1440,
    label: 'How long the wrong passwords are counted, and the pause lasts',
    governs: 'The window both limits above count within.' },
  { key: 'fileAccessHours', area: 'Sign-in', unit: 'hours', default: 12, min: 1, max: 72,
    label: 'How long a signed-in browser may open stored files before re-checking',
    governs: 'The file pass is renewed while the person stays signed in; this is how long one lasts if they do not.' },
  { key: 'morPhotosPerReport', area: 'MOR', unit: 'photos', default: 5, min: 1, max: 10,
    label: 'Photos on one report from the public MOR form',
    governs: 'Shown on the form, and enforced when it is sent.' },
  { key: 'parkingOfferDays', area: 'Parking', unit: 'days', default: 14, min: 1, max: 90,
    label: 'How long an offer from the waiting list holds a bay',
    governs: 'The suggested end date of a new offer; it can be changed on the offer itself.' },
  { key: 'dossierRevisionsKept', area: 'Dossier', unit: 'versions', default: 20, min: 5, max: 200,
    label: 'Saved versions kept for each Dossier document',
    governs: 'Older versions beyond this are deleted when a new one is saved.' },
  { key: 'gtReviewBand1', area: 'Golden Thread', unit: 'days', default: 30, min: 1, max: 365, group: 'gtReview',
    label: 'Document review: first warning band',
    governs: 'A current document whose review is due within this many days.' },
  { key: 'gtReviewBand2', area: 'Golden Thread', unit: 'days', default: 60, min: 2, max: 365, group: 'gtReview',
    label: 'Document review: second warning band', governs: 'Must be more than the first band.' },
  { key: 'gtReviewBand3', area: 'Golden Thread', unit: 'days', default: 90, min: 3, max: 365, group: 'gtReview',
    label: 'Document review: third warning band', governs: 'Must be more than the second band. Beyond it a review is not shown as due.' },
  { key: 'gtRiskLowMax', area: 'Golden Thread', unit: 'score', default: 4, min: 1, max: 22, group: 'gtRisk',
    label: 'Risk score that is still Low (likelihood × impact, 1–25)', governs: 'A score up to this is Low.' },
  { key: 'gtRiskMediumMax', area: 'Golden Thread', unit: 'score', default: 9, min: 2, max: 23, group: 'gtRisk',
    label: 'Risk score that is still Medium', governs: 'Must be more than Low.' },
  { key: 'gtRiskHighMax', area: 'Golden Thread', unit: 'score', default: 15, min: 3, max: 24, group: 'gtRisk',
    label: 'Risk score that is still High', governs: 'Must be more than Medium. Above it is Very high.' },
  ...Object.entries(RATE_LIMIT_WINDOWS).map(([action, r]) => ({
    key: `rate_${action}`, area: 'Rate limits', unit: `per ${r.windowMinutes} minutes`,
    default: r.default, min: 1, max: r.max, label: r.label,
    governs: 'More than this in the window is refused until the window has passed.',
  })),
]);

const BY_KEY = new Map(DEFS.map((d) => [d.key, d]));

/** Groups whose values must rise strictly in this order. */
const ORDERED_GROUPS = Object.freeze({
  gtReview: ['gtReviewBand1', 'gtReviewBand2', 'gtReviewBand3'],
  gtRisk:   ['gtRiskLowMax', 'gtRiskMediumMax', 'gtRiskHighMax'],
});

/** Every policy, for the Admin screen. */
export function policyInfo() { return DEFS; }

export const POLICY_DEFAULTS = Object.freeze(Object.fromEntries(DEFS.map((d) => [d.key, d.default])));

let stored = /** @type {Record<string, number>} */ ({});

/** @param {unknown} v @param {PolicyDef} d */
function inBounds(v, d) {
  return typeof v === 'number' && Number.isInteger(v) && v >= d.min && v <= d.max;
}

/**
 * What would be stored: only known keys, in bounds, that differ from default.
 * @param {unknown} raw
 * @returns {Record<string, number>}
 */
export function cleanPolicies(raw) {
  const v = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const d of DEFS) {
    const n = typeof v[d.key] === 'string' && v[d.key] !== '' ? Number(v[d.key]) : v[d.key];
    if (inBounds(n, d) && n !== d.default) out[d.key] = /** @type {number} */ (n);
  }
  return out;
}

/**
 * Problems with a set of values, `{ key: message }` — empty when all is well.
 * Checks the bounds of each, then the order of each group, against the values
 * that would be in force (defaults for anything not given).
 * @param {Record<string, unknown>} values
 */
export function validatePolicies(values) {
  /** @type {Record<string, string>} */
  const problems = {};
  const merged = { ...POLICY_DEFAULTS };
  for (const d of DEFS) {
    const raw = values?.[d.key];
    if (raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (!inBounds(n, d)) problems[d.key] = `A whole number from ${d.min} to ${d.max}.`;
    else merged[d.key] = n;
  }
  for (const keys of Object.values(ORDERED_GROUPS)) {
    for (let i = 1; i < keys.length; i++) {
      if (!problems[keys[i]] && merged[keys[i]] <= merged[keys[i - 1]]) {
        problems[keys[i]] = `Must be more than “${BY_KEY.get(keys[i - 1])?.label}”.`;
      }
    }
  }
  return problems;
}

/**
 * Put an admin's stored choices in force (called as the setting is read).
 * A stored set that fails its group order is ignored as a whole group: half a
 * band set would be worse than the defaults.
 * @param {unknown} raw
 * @returns {Record<string, number>} what is now in force beyond the defaults
 */
export function setPolicies(raw) {
  const clean = cleanPolicies(raw);
  const problems = validatePolicies(clean);
  for (const keys of Object.values(ORDERED_GROUPS)) {
    if (keys.some((k) => problems[k])) for (const k of keys) delete clean[k];
  }
  for (const k of Object.keys(problems)) delete clean[k];
  stored = clean;
  return stored;
}

/**
 * A policy's value now.
 * @param {string} key
 * @returns {number}
 */
export function policy(key) {
  const d = BY_KEY.get(key);
  if (!d) throw new Error(`Unknown policy: ${key}`);
  return stored[key] ?? d.default;
}

/** Every policy in force (defaults plus an admin's changes). */
export function activePolicies() {
  return Object.fromEntries(DEFS.map((d) => [d.key, policy(d.key)]));
}

/** A rate limit in force: `{ max, windowMinutes }`, or null for an unknown action. */
export function rateLimit(action) {
  const r = RATE_LIMIT_WINDOWS[action];
  return r ? { max: policy(`rate_${action}`), windowMinutes: r.windowMinutes } : null;
}
