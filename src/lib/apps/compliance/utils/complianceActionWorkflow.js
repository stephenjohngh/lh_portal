// src/lib/apps/compliance/utils/complianceActionWorkflow.js
//
// The workflow of the register's OUTSTANDING ACTIONS (W3, migration 255) — a
// SEED, saved by the app the first time an administrator opens Compliance →
// Compliance obligations → Outstanding actions, then edited in Admin →
// Workflows like any other.
//
// Its STEP KEYS ARE THE ACTION STATUSES (statutory_register.action_status):
// compliance_action_after_move() writes the step reached back as the status,
// and the register refuses a status changed any other way. The names, notes
// and conditions are the administrator's; the four keys and their kinds are
// fixed (workflowContracts.js, and workflow_app_problem() in the database).
//
// The deadline is the action's own DUE DATE (owner, technical authority and
// due date are set on the action, not here), so no step carries one.
// ⚠ No four-eyes on closing in the seed: the building has one administrator,
// and a condition nobody can meet would leave every action stuck answered.

export const COMPLIANCE_ACTION_WORKFLOW_KEY = 'compliance_action';

/** The action statuses, in order — the database's CHECK (parity-tested). */
export const ACTION_STATUSES = Object.freeze(['open', 'in_progress', 'answered', 'closed']);

/** The words for each status on screen — the shipped step names. */
export const ACTION_STATUS_LABEL = Object.freeze({
  open: 'Open', in_progress: 'In progress', answered: 'Answered', closed: 'Closed',
});

export const DEFAULT_COMPLIANCE_ACTION_WORKFLOW = Object.freeze({
  key: COMPLIANCE_ACTION_WORKFLOW_KEY,
  name: 'Compliance action',
  appId: 'compliance',
  description: 'An outstanding action from the compliance obligations register — a decision, a determination, information to obtain, a record or a process to establish — from open to answered and closed.',
  reviewRequired: false,
  reviewReason: null,
  steps: [
    { key: 'open',        name: 'Open',        public_name: null, kind: 'start' },
    { key: 'in_progress', name: 'In progress', public_name: null, kind: 'open' },
    // Answered is not closed: somebody has produced the answer and it has not
    // yet been confirmed as settling the action.
    { key: 'answered',    name: 'Answered',    public_name: null, kind: 'open' },
    { key: 'closed',      name: 'Closed',      public_name: null, kind: 'done' },
  ],
  moves: [
    { from_key: 'open',        to_key: 'in_progress', label: 'Start' },
    { from_key: 'open',        to_key: 'closed',      label: 'Close — no longer needed', note_required: true },
    { from_key: 'in_progress', to_key: 'answered',    label: 'Record the answer', note_required: true },
    { from_key: 'answered',    to_key: 'closed',      label: 'Confirm and close' },
    { from_key: 'answered',    to_key: 'in_progress', label: 'Not settled — back to work', note_required: true },
    { from_key: 'closed',      to_key: 'in_progress', label: 'Reopen', note_required: true },
  ],
});
