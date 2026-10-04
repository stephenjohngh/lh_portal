// src/routes/api/media/file/fakeDb.js
// A stand-in for the service-role Supabase client, for the media route tests.
// Only the query shapes #lib/server/mediaAccess.js uses: from().select() then
// any mix of .eq() / .ilike(), awaited directly or through .maybeSingle().
// Not imported by the app.

/**
 * @param {Record<string, any[]>} tables  rows per table
 * @param {{ failTable?: string }} [opts] make one table's query error
 */
export function fakeDb(tables, opts = {}) {
  return {
    from(table) {
      return {
        select() {
          /** @type {Array<[string, string, string]>} */
          const filters = [];
          const run = () => {
            if (opts.failTable === table) return Promise.resolve({ data: null, error: { message: `${table} unavailable` } });
            const rows = (tables[table] ?? []).filter((row) => filters.every(([op, col, val]) => {
              if (op === 'eq') return row[col] === val;
              // ilike '%x%', with LIKE escapes undone.
              const needle = val.slice(1, -1).replace(/\\(.)/g, '$1').toLowerCase();
              return String(row[col] ?? '').toLowerCase().includes(needle);
            }));
            return Promise.resolve({ data: rows, error: null });
          };
          const chain = {
            eq(col, val)    { filters.push(['eq', col, val]); return chain; },
            ilike(col, val) { filters.push(['ilike', col, val]); return chain; },
            maybeSingle()   { return run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); },
            then(res, rej)  { return run().then(res, rej); },
          };
          return chain;
        },
      };
    },
  };
}
