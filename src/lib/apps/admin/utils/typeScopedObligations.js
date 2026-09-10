// src/lib/apps/admin/utils/typeScopedObligations.js
//
// Which obligations belong on a single component Type's panel, and which of
// them are safe to edit from there. Pure, no I/O — Type-1 testable.
//
// The Admin → Component Types sub-panel is a SHORTCUT onto the shared
// statutory-obligation library, not a rival editor (see
// docs/requirements/Obligation_Library_Promotion_Build_Plan.md D5). That makes
// one rule load-bearing: an obligation covering several types must be visible
// there but NOT editable, because changing its name, cadence or route from one
// type's screen would silently change it for every other type it covers —
// types the person editing cannot see from where they are standing.

/** Obligations whose scope names this type. */
export function obligationsForType(obligations, typeCode) {
  if (!typeCode) return [];
  return (obligations ?? []).filter(o => (o?.scope?.typeCodes ?? []).includes(typeCode));
}

/**
 * Is this type the WHOLE of the obligation's scope? Only then is it safe to
 * edit from that type's panel. Any other narrowing — more types, a system, a
 * floor — means the obligation reaches beyond this screen.
 */
export function scopedToTypeOnly(obligation, typeCode) {
  const scope = obligation?.scope ?? {};
  const typeCodes = scope.typeCodes ?? [];
  return typeCodes.length === 1
    && typeCodes[0] === typeCode
    && (scope.systemIds ?? []).length === 0
    && (scope.floorIds ?? []).length === 0;
}

/** How many types an obligation covers — shown when it is not editable here. */
export function typeCount(obligation) {
  return (obligation?.scope?.typeCodes ?? []).length;
}
