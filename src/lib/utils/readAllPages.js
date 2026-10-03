// src/lib/utils/readAllPages.js
//
// Every row a Supabase query matches, page by page. ⛔ A query without a range
// stops at PostgREST's 1,000 rows and says nothing, so the read looks complete
// (the audit-log CSV export returned 1,000 of 2,547 rows this way, 2026-10-03).
//
// Imports nothing, so a server route on the service-role client can use it as
// readily as `api.readAll`, which delegates here.
//
// `build` returns a FRESH query each call, with its filters and an order that
// has no ties — put a unique column (usually `id`) last, or rows sharing a
// value can repeat on one page and be missing from both.
//
// For an `.in()` over a long id list use `chunks` too: one request carrying a
// thousand uuids overruns the URL.

/**
 * @param {() => any} build
 * @param {{ pageSize?: number }} [opts]
 * @returns {Promise<any[]>}  throws the Supabase error as it came
 */
export async function readAllPages(build, { pageSize = 1000 } = {}) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

/**
 * Split a list into pieces of `size`, for `.in()` filters.
 * @template T
 * @param {T[]} list
 * @param {number} [size]
 * @returns {T[][]}
 */
export function chunks(list, size = 300) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
