// src/lib/utils/scrubSecrets.js
// Remove secrets carried in an address before an error report leaves the portal.
//
// A published Dossier link IS its token (/pack/<token>, /api/pack/<token>/file/…),
// and error reports (Sentry) record the page address, request URLs and
// breadcrumbs. Unscrubbed, every error on a recipient's page would hand a working
// link to a third party (security review, 2026-11-03).

const PACK_TOKEN = /(\/(?:api\/)?pack\/)[^/?#\s"'\\]+/g;

/** @param {string} text */
export function scrubText(text) {
  return typeof text === 'string' ? text.replace(PACK_TOKEN, '$1[token]') : text;
}

/**
 * Scrub every string inside an event or breadcrumb, however deep. Returns a copy.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function scrubDeep(value, depth = 0) {
  if (typeof value === 'string') return /** @type {any} */ (scrubText(value));
  if (!value || typeof value !== 'object' || depth > 12) return value;
  if (Array.isArray(value)) return /** @type {any} */ (value.map((v) => scrubDeep(v, depth + 1)));
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, depth + 1);
  return /** @type {any} */ (out);
}
