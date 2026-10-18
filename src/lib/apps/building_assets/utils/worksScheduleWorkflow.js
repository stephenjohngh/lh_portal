// src/lib/apps/building_assets/utils/worksScheduleWorkflow.js
//
// The workflow of a WORKS SCHEDULE (migration 258) — a SEED, saved by the app
// the first time an administrator opens Building Assets → Works, then edited
// in Admin → Workflows like any other.
//
// Its STEP KEYS ARE THE SCHEDULE STATUSES (works_schedules.status):
// works_schedule_after_move() writes the step reached back as the status, with
// issued_at / completed_at, and the table refuses a status changed any other
// way. The four keys and their kinds are fixed (workflowContracts.js and
// workflow_app_problem()); the names, moves, notes and conditions are the
// administrator's.
//
// The deadline is the schedule's own EXPECTED COMPLETION date, so no step
// carries one. ⚠ "Mark completed" is held back by the Works tab until every
// line has been carried out; applying the last line moves it there by itself.

export const WORKS_SCHEDULE_WORKFLOW_KEY = 'works_schedule';

/** The schedule statuses, in order — the database's CHECK (parity-tested). */
export const WORKS_SCHEDULE_STATUSES = Object.freeze(['draft', 'issued', 'completed', 'cancelled']);

export const DEFAULT_WORKS_SCHEDULE_WORKFLOW = Object.freeze({
  key: WORKS_SCHEDULE_WORKFLOW_KEY,
  name: 'Works schedule',
  appId: 'building_assets',
  description: 'A schedule of works for a contractor — a request for quotation or an instruction to proceed — from draft to issued, and completed once every line has been carried out and applied to the asset register.',
  reviewRequired: false,
  reviewReason: null,
  steps: [
    { key: 'draft',     name: 'Draft',     public_name: null, kind: 'start' },
    { key: 'issued',    name: 'Issued',    public_name: null, kind: 'open' },
    { key: 'completed', name: 'Completed', public_name: null, kind: 'done' },
    { key: 'cancelled', name: 'Cancelled', public_name: null, kind: 'declined' },
  ],
  moves: [
    { from_key: 'draft',     to_key: 'issued',    label: 'Mark issued' },
    // Work done without a formal issue (a small in-house job): the lines are
    // carried out on a draft, and the schedule completes from there.
    { from_key: 'draft',     to_key: 'completed', label: 'Mark completed' },
    { from_key: 'draft',     to_key: 'cancelled', label: 'Cancel', note_required: true },
    { from_key: 'issued',    to_key: 'completed', label: 'Mark completed' },
    { from_key: 'issued',    to_key: 'cancelled', label: 'Cancel', note_required: true },
    { from_key: 'cancelled', to_key: 'draft',     label: 'Reopen as a draft', note_required: true },
  ],
});
