// src/lib/apps/inspection/utils/checklistRules.js
//
// Pure logic for a definition's checklist_mode and pass_fail_rule
// (Configurable Inspections, Phase 2 optionals). Consumed by the walk UI
// (InspectionPanel / InspectionResultSection) and the Admin definition
// editor's preview, so both always agree.

/**
 * Applies a definition's checklist_mode to a component's checkable attrs.
 *
 * - No definition, or checklist_mode='type_driven' (default): the component
 *   checks all of its own type's checkable attrs — pass through unchanged.
 * - checklist_mode='explicit': only the attrs the definition names in
 *   checklist_attr_ids (per-type attrs the component's type doesn't have
 *   simply don't intersect).
 *
 * @template {{id: string}} T
 * @param {T[]} checkableDefs  type_attributes with checkable=true
 * @param {{checklist_mode?: string, checklist_attr_ids?: string[]}|null} [definition]
 * @returns {T[]}
 */
export function applyChecklistMode(checkableDefs, definition) {
  if (definition?.checklist_mode !== 'explicit') return checkableDefs;
  const ids = new Set(definition.checklist_attr_ids ?? []);
  return checkableDefs.filter(d => ids.has(d.id));
}

/**
 * Derives the inspection outcome from the pass/fail checklist state.
 *
 * Result semantics (both rules): any FAIL → 'failed' immediately (one fail
 * decides, even with checks unanswered); every check PASS → 'ok'; otherwise
 * undetermined (null).
 *
 * pass_fail_rule='manual' (default): the derived result is a suggestion the
 * inspector may override with the result buttons.
 * pass_fail_rule='all_checks_pass': the derived result is binding — `enforced`
 * is true (when there are pass/fail checks to enforce), the manual buttons are
 * hidden, and saving needs a determined result. A component with no pass/fail
 * checks falls back to manual (otherwise it could never be saved).
 *
 * @param {Array<{id: string, name: string}>} passFailDefs
 * @param {Record<string, boolean|undefined>} checklistResults  { attrId: true|false }
 * @param {string} [passFailRule]  'manual' | 'all_checks_pass'
 */
export function deriveChecklistOutcome(passFailDefs, checklistResults, passFailRule = 'manual') {
  const failedNames = passFailDefs
    .filter(d => checklistResults[d.id] === false)
    .map(d => d.name);
  const anyFail = failedNames.length > 0;
  const allPass = passFailDefs.length > 0 && passFailDefs.every(d => checklistResults[d.id] === true);
  const result  = anyFail ? 'failed' : (allPass ? 'ok' : null);
  const enforced = passFailRule === 'all_checks_pass' && passFailDefs.length > 0;
  return { anyFail, allPass, failedNames, result, enforced };
}
