// src/lib/apps/admin/utils/jobHistorySuggest.js
//
// Suggests a last-renewal date for a maintenance group from its completed job
// history (R2 of the review).
//
// SUGGESTION ONLY (R0 — the planner authors, derivation assists). This returns
// the recent completed jobs that relate to the group so the UI can offer them as
// candidates; the planner sees each job's title + date and decides. It never
// auto-fills, never overwrites a stored value. maintenance_jobs carry no explicit
// "this was a renewal" flag, so the evidence (title + date) is surfaced for the
// human to judge — a "Boiler replacement" is a renewal, an annual service is not.
//
// A job relates to a group when its scope intersects the group's membership:
//   * system    scope → job.scope_id ∈ group.systemIds
//   * type      scope → job.scope_id resolves to a code ∈ group.typeCodes
//                       (scope_id may be a component_types.id or already a code —
//                        both are handled via typeIdToCode with a raw fallback)
//   * component scope → any of the job's componentIds ∈ group.componentIds
//   * building  scope → excluded (a building-wide job isn't a group-renewal signal)
//
// Pure + Type-1 tested (jobHistorySuggest.test.js). Dates are YYYY-MM-DD strings,
// which sort lexically === chronologically.

/**
 * @param {{ systemIds?:string[], typeCodes?:string[], componentIds?:string[] }} group
 * @param {Array<{ id:string, title:string, completed_date:string|null, status:string,
 *                 scope_type:string, scope_id:string|null, scope_label:string|null,
 *                 componentIds?:string[] }>} jobs
 * @param {{ typeIdToCode?:Map<string,string>|Record<string,string>, limit?:number }} [opts]
 * @returns {{ candidates:object[], best:object|null }}
 */
export function suggestLastRenewal(group = {}, jobs = [], opts = {}) {
  const systemIds = new Set(group.systemIds    ?? []);
  const typeCodes = new Set(group.typeCodes    ?? []);
  const members   = new Set(group.componentIds ?? []);
  const limit     = opts.limit ?? 5;
  const t2c = opts.typeIdToCode instanceof Map
    ? opts.typeIdToCode
    : new Map(Object.entries(opts.typeIdToCode ?? {}));

  const relevant = (jobs ?? []).filter((j) => {
    if (j.status !== 'completed' || !j.completed_date) return false;
    switch (j.scope_type) {
      case 'system':    return systemIds.has(j.scope_id);
      case 'type':      return typeCodes.has(t2c.get(j.scope_id) ?? j.scope_id);
      case 'component': return (j.componentIds ?? []).some((id) => members.has(id));
      default:          return false;
    }
  });

  // Most recent completion first.
  relevant.sort((a, b) =>
    a.completed_date < b.completed_date ? 1 : a.completed_date > b.completed_date ? -1 : 0);

  const candidates = relevant.slice(0, limit);
  return { candidates, best: candidates[0] ?? null };
}
