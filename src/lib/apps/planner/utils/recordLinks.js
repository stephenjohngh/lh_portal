// src/lib/apps/planner/utils/recordLinks.js
//
// Where another app's item can be opened in full, from the Planner's details
// dialog (user, 2026-11-12). The cross-app jump is the user's own call, made
// item by item (CLAUDE.md, standing decisions: a hub is allowed, a mesh is not;
// navigation is asked for, not assumed) — so this is a short list, not a rule.
// It goes through #lib/utils/appLink.js; the target app decides what the params
// mean and opens normally when it cannot find the record.
//
// Pure.

/** source key → how to open its record */
const LINKS = {
  // An open fault is a component: open its record in Building Assets.
  fault: (o) => ({ app: 'building_assets', params: { component: o.sourceId }, label: 'Open the component in Building Assets' }),
};

/**
 * @param {any} occurrence
 * @returns {{ app: string, params: Record<string,string>, label: string } | null}
 */
export function recordLinkFor(occurrence) {
  if (!occurrence?.linked || !occurrence?.sourceId) return null;
  const make = LINKS[occurrence.source];
  return make ? make(occurrence) : null;
}
