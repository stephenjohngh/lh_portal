// src/lib/utils/pgFilter.js
//
// Sanitise free text before embedding it in a PostgREST `.or()` / `.filter()`
// string (e.g. `col.ilike.%term%`). PostgREST parses that string as a grammar:
// commas separate conditions, parentheses group them, and quotes/backslashes
// quote values. If raw user input is interpolated, a term like `a,is_admin.eq.true`
// or `x)` can break out of its ilike value and inject additional filters. We
// can't escape here reliably (there's no server-side quoting we control), so we
// STRIP the grammar-significant characters. Ordinary search chars — letters,
// digits, spaces, and `.@-_` (needed for names/emails) — are preserved, so the
// substring search still works.
//
// Not needed for `.eq()` / `.ilike(col, pattern)` builder calls — those pass the
// value out-of-band and aren't parsed as filter grammar. Only the string forms
// (`.or(...)`, `.filter(...)`) need this.

const PG_FILTER_DELIMITERS = /[,()"\\*]/g;

/**
 * @param {string} term
 * @returns {string} the term with PostgREST filter delimiters removed
 */
export function sanitizeIlikeTerm(term) {
  return String(term ?? '').replace(PG_FILTER_DELIMITERS, ' ').replace(/\s+/g, ' ').trim();
}
