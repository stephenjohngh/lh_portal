// src/lib/workflow/workflowActions.js
//
// The built-in ACTIONS a workflow move may run, by the app that owns the
// workflow (2026-10-17, migration 247). An action does the app's own work in
// the same database transaction as the move — so it is written in SQL
// (workflow_move() dispatches on the key) and listed here for the Admin screen
// and the checks before saving. ⛔ A new action is added in BOTH places:
// here, and workflow_action_allowed() + workflow_move() in a migration.
// An action may only be on a move into a finished ("done") step.

/** @typedef {{ key: string, appId: string, label: string, explains: string }} WorkflowAction */

/** @type {ReadonlyArray<WorkflowAction>} */
export const WORKFLOW_ACTIONS = Object.freeze([
  {
    key: 'parking_add_to_waiting_list', appId: 'parking',
    label: 'Add to the Parking waiting list',
    explains: 'Makes the holder from the application (or uses the holder with the same email) and puts them on the waiting list, dated the day the application was received.',
  },
]);

/** The actions an app's workflows may use. @param {string} appId */
export function actionsFor(appId) {
  return WORKFLOW_ACTIONS.filter((a) => a.appId === appId);
}

/** @param {string|null|undefined} key */
export function actionLabel(key) {
  return WORKFLOW_ACTIONS.find((a) => a.key === key)?.label ?? key ?? '';
}
