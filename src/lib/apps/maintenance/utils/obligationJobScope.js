// src/lib/apps/maintenance/utils/obligationJobScope.js
//
// What scope should a maintenance job get when it is generated from a shared
// obligation? Pure, no I/O — Type-1 testable.
//
// P3 of docs/requirements/Obligation_Library_Promotion_Build_Plan.md. Before
// the promotion, `maintenance_regime` was one row per component TYPE, so a
// generated job was always scope_type='type' with that type's id. The promoted
// obligation carries a richer jsonb `scope` (typeCodes / systemIds / floorIds /
// attribute filters), which can cover several types, a whole system, or the
// building — so the job scope has to be derived rather than copied.
//
// The rule, and why: a job is a VISIT, not a checklist. "Service the fire alarm
// system" is one contractor attendance covering many devices, not one job per
// detector — so we narrow the scope only when the obligation is unambiguously
// about one thing, and otherwise scope to the building and put the detail in
// the label. Over-narrowing would multiply jobs a contractor would only ever
// do in one trip.

/**
 * @param {{ name?: string, scope?: any }} obligation
 * @param {{ types?: Array<{id: string, code: string, name: string}>,
 *           systems?: Array<{id: string, name: string}> }} [ctx]
 * @returns {{ scope_type: 'building'|'system'|'type', scope_id: string|null, scope_label: string }}
 */
export function obligationJobScope(obligation, ctx = {}) {
  const scope     = obligation?.scope ?? {};
  const typeCodes = Array.isArray(scope.typeCodes) ? scope.typeCodes : [];
  const systemIds = Array.isArray(scope.systemIds) ? scope.systemIds : [];
  const types     = ctx.types ?? [];
  const systems   = ctx.systems ?? [];

  // Exactly one type and nothing else narrowing it → a type-scoped job, which
  // is what the old per-type regime produced. Keeps generated jobs recognisable
  // to anyone used to the previous behaviour.
  if (typeCodes.length === 1 && systemIds.length === 0) {
    const type = types.find((t) => t.code === typeCodes[0]);
    return {
      scope_type:  'type',
      scope_id:    type?.id ?? null,
      scope_label: type?.name ?? typeCodes[0],
    };
  }

  // Exactly one system and no type narrowing → a system-scoped job.
  if (systemIds.length === 1 && typeCodes.length === 0) {
    const system = systems.find((s) => s.id === systemIds[0]);
    return {
      scope_type:  'system',
      scope_id:    system?.id ?? systemIds[0],
      scope_label: system?.name ?? 'System',
    };
  }

  // Anything broader or mixed: one building-scoped visit, labelled with what it
  // actually covers so the label still tells a contractor what they are for.
  return { scope_type: 'building', scope_id: null, scope_label: scopeSummary(obligation, ctx) };
}

/**
 * Human summary of an obligation's scope, for a job label and the scheduler
 * table. Deliberately short — it goes in a table cell.
 * @param {{ scope?: any }} obligation
 * @param {{ types?: Array<{code: string, name: string}>, systems?: Array<{id: string, name: string}> }} [ctx]
 */
export function scopeSummary(obligation, ctx = {}) {
  const scope     = obligation?.scope ?? {};
  const typeCodes = Array.isArray(scope.typeCodes) ? scope.typeCodes : [];
  const systemIds = Array.isArray(scope.systemIds) ? scope.systemIds : [];
  const types     = ctx.types ?? [];
  const systems   = ctx.systems ?? [];

  const parts = [];
  if (systemIds.length) {
    const named = systemIds.map((id) => systems.find((s) => s.id === id)?.name).filter(Boolean);
    parts.push(named.length ? named.join(', ') : `${systemIds.length} system${systemIds.length === 1 ? '' : 's'}`);
  }
  if (typeCodes.length) {
    const named = typeCodes.map((c) => types.find((t) => t.code === c)?.name ?? c);
    // Three names is about as much as a table cell carries before it stops
    // being readable; past that a count communicates more than a truncated list.
    parts.push(named.length <= 3 ? named.join(', ') : `${named.length} types`);
  }
  return parts.length ? parts.join(' · ') : 'Building-wide';
}
