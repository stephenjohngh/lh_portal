// src/lib/components/common/filterSummary.js
//
// What the filter bar is currently doing, in words.
//
// ⛔ ONE implementation, used by two surfaces. FilterBar renders these as the
// active pills; an export prints the same text at the top of the document. If
// they were written separately, the document would eventually describe a
// different filter from the one the screen showed — and the whole point of
// exporting "what is on screen" is that the two agree.
//
// Pure so both can be tested without a DOM. See CLAUDE.md "Testing".

/**
 * One label per active facet, in the facets' own words.
 *
 * ⚠ Uses each option's `short` where it has one, exactly as the button summary
 * does — that is what keeps a live count out of a filter description ("Not
 * covered (79)" is useful while choosing and wrong once chosen).
 *
 * @param {{key: string, label: string, options: {value: string, label: string, short?: string}[]}[]} fields
 * @param {Record<string, Set<string>>} values
 * @param {string} [query]
 * @returns {string[]}
 */
export function filterPills(fields, values, query = '') {
  const out = [];
  for (const field of fields ?? []) {
    const selected = values?.[field.key];
    if (!(selected instanceof Set) || selected.size === 0) continue;
    const names = field.options
      .filter(o => selected.has(o.value))
      .map(o => o.short ?? o.label);
    out.push(`${field.label}: ${names.join(', ')}`);
  }
  const q = String(query ?? '').trim();
  if (q) out.push(`"${q}"`);
  return out;
}

/**
 * The same thing as one line, for a document header.
 *
 * ⚠ Returns a definite statement when nothing is filtered rather than an empty
 * string. A header that silently omits the filter line reads as though the
 * document covers everything — which is true here, but only by accident of it
 * being unfiltered, and the reader cannot tell the difference.
 *
 * @returns {string}
 */
export function describeFilters(fields, values, query = '') {
  const pills = filterPills(fields, values, query);
  return pills.length === 0 ? 'No filters — every row' : pills.join(' · ');
}
