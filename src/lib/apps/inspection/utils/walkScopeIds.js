// src/lib/apps/inspection/utils/walkScopeIds.js
//
// What each walk-evidenced duty COVERS — the component ids its scope resolves
// to, by the same filter the walk itself uses (so the number a manager sees
// and the number a caretaker walks cannot differ). Feeds walkCoverage.js.
//
// Rotating duties are left out on purpose: their session is the cycle.
import { buildWalkComponentsFromScope } from './inspectionWalk.js';
import { isWalkEvidenced } from '#lib/utils/obligationEvidence.js';

/**
 * @param {Array<any>} obligations   planned obligations
 * @param {Array<any>} components    ALL components, flat
 * @param {{ types: any[], attrDefs: any, componentAttrs: any, inspections: any }} ctx
 * @returns {Record<string, Set<string>>}
 */
export function walkScopeIds(obligations, components, ctx) {
  /** @type {Record<string, Set<string>>} */
  const out = {};
  for (const o of obligations ?? []) {
    if (!isWalkEvidenced(o) || o.mode === 'rotating') continue;
    out[o.id] = new Set(buildWalkComponentsFromScope(components ?? [], o.scope ?? {}, ctx).map((c) => c.id));
  }
  return out;
}
