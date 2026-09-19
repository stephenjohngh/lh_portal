// src/lib/components/common/filterSummary.test.js
// TYPE-1. One description, used by the pills on screen and by an export's
// header — so what a document claims it was filtered to cannot drift from what
// the person was looking at.

import { describe, it, expect } from 'vitest';
import { filterPills, describeFilters } from './filterSummary.js';

const FIELDS = [
  { key: 'basis', label: 'Source', options: [
    { value: 'statute', label: 'Legislation' },
    { value: 'standard', label: 'Standard / code' },
  ] },
  { key: 'status', label: 'Status', options: [
    { value: 'not_covered', label: 'Not covered (79)', short: 'Not covered' },
  ] },
];

const sets = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, new Set(v)]));

describe('filterPills', () => {
  it('names the facet and the chosen values', () => {
    expect(filterPills(FIELDS, sets({ basis: ['statute'] })))
      .toEqual(['Source: Legislation']);
  });

  it('joins several values within one facet', () => {
    expect(filterPills(FIELDS, sets({ basis: ['statute', 'standard'] })))
      .toEqual(['Source: Legislation, Standard / code']);
  });

  it('⚠ uses `short`, so a live count never freezes into a description', () => {
    // "Not covered (79)" is useful while choosing and wrong the moment the
    // filter is recorded — the count moves as the building is worked on.
    expect(filterPills(FIELDS, sets({ status: ['not_covered'] })))
      .toEqual(['Status: Not covered']);
  });

  it('includes the search text, quoted', () => {
    expect(filterPills(FIELDS, {}, '  fire door ')).toEqual(['"fire door"']);
  });

  it('skips facets with nothing selected, and a missing Set', () => {
    // ⚠ `undefined` on purpose — a caller can render a bar before every facet
    // has been given its Set, and a description must not throw over it.
    const values = /** @type {any} */ ({ basis: new Set(), status: undefined });
    expect(filterPills(FIELDS, values)).toEqual([]);
  });

  it('returns nothing when nothing is filtered', () => {
    expect(filterPills(FIELDS, {}, '')).toEqual([]);
  });
});

describe('describeFilters', () => {
  it('⛔ says so explicitly when nothing is filtered', () => {
    // An empty string would leave a document header silently omitting the
    // filter line, which reads as "this covers everything" — true here, but
    // only by accident, and the reader cannot tell the two apart.
    expect(describeFilters(FIELDS, {}, '')).toBe('No filters — every row');
  });

  it('joins the pills into one line', () => {
    const text = describeFilters(FIELDS, sets({ basis: ['statute'], status: ['not_covered'] }), 'door');
    expect(text).toBe('Source: Legislation · Status: Not covered · "door"');
  });

  it('tolerates missing fields and values', () => {
    expect(describeFilters(undefined, undefined)).toBe('No filters — every row');
  });
});
