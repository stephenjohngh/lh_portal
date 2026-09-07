// src/lib/apps/golden_thread/utils/gtAccessLog.js
//
// EXT-15.R3 — access to sensitive material is logged, not just changes to it.
// The predicate is pulled out of GtDocumentDetail.svelte because the same
// dedup-on-prop-change shape (loadedLinksFor, loadedAuditKey) already exists
// three times in that file with no regression coverage, and this is exactly
// the class of bug CLAUDE.md's Svelte 5 section warns about: a `$:` guard that
// re-fires on every parent render because it was keyed on the wrong thing.

/**
 * Whether opening `doc` should be logged as a view (EXT-15.R3). Routine
 * 'official', non-PII documents are not logged — logging every ordinary view
 * would just be noise. `loggedFor` is the id last logged (or null); passing it
 * back in is what stops the same document being logged again on every
 * re-render.
 *
 * @param {{id?: string, security_classification?: string, contains_pii?: boolean}|null|undefined} doc
 * @param {string|null} loggedFor
 * @returns {boolean}
 */
export function shouldLogView(doc, loggedFor) {
  if (!doc?.id || doc.id === loggedFor) return false;
  return doc.security_classification === 'official_sensitive' || !!doc.contains_pii;
}
