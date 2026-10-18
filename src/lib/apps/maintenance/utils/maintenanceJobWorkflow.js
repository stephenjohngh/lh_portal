// src/lib/apps/maintenance/utils/maintenanceJobWorkflow.js
//
// The workflow of a MAINTENANCE JOB (migration 260) — a SEED, saved by the app
// the first time an administrator opens Maintenance, then edited in Admin →
// Workflows like any other.
//
// ⭐ Unlike complaints, actions and works schedules, the STEPS ARE THE
// ADMINISTRATOR'S: a building adds the stages its contractors work to (quote
// requested, ordered, certificate received…). What is fixed is how a step
// reads as the job's STATUS — by its KIND (STATUS_FOR_KIND, the database's
// maintenance_status_for_kind) — so everything that reads the status reads it
// as before.
//
// ⛔ A move INTO a finished — accepted step is made through Record completion,
// which records the result with it (maintenance_job_complete()); the shared
// controls hand it to that form. No timer may make one (workflowContracts.js).

export const MAINTENANCE_JOB_WORKFLOW_KEY = 'maintenance_job';

/** A step's kind → the job's status (migration 260, maintenance_status_for_kind). */
export const STATUS_FOR_KIND = Object.freeze({
  start: 'scheduled', open: 'in_progress', done: 'completed', declined: 'cancelled',
});

/** The job statuses — the database's CHECK (parity-tested). */
export const MAINTENANCE_JOB_STATUSES = Object.freeze(['scheduled', 'in_progress', 'completed', 'cancelled']);

export const DEFAULT_MAINTENANCE_JOB_WORKFLOW = Object.freeze({
  key: MAINTENANCE_JOB_WORKFLOW_KEY,
  name: 'Maintenance job',
  appId: 'maintenance',
  description: 'A dated piece of contractor work, from scheduled to booked and attended, and completed when its result is recorded. Add the stages your contractors work to; a step’s kind sets the job’s status.',
  reviewRequired: false,
  reviewReason: null,
  steps: [
    { key: 'scheduled', name: 'Scheduled', public_name: null, kind: 'start' },
    { key: 'booked',    name: 'Booked',    public_name: null, kind: 'open' },
    { key: 'attended',  name: 'Attended',  public_name: null, kind: 'open' },
    { key: 'completed', name: 'Completed', public_name: null, kind: 'done' },
    { key: 'cancelled', name: 'Cancelled', public_name: null, kind: 'declined' },
  ],
  moves: [
    { from_key: 'scheduled', to_key: 'booked',    label: 'Book' },
    { from_key: 'booked',    to_key: 'attended',  label: 'Mark attended' },
    { from_key: 'booked',    to_key: 'scheduled', label: 'Unbook', note_required: true },
    // A job can be completed from any open stage: a contractor who turns up
    // unannounced still produces a certificate.
    { from_key: 'scheduled', to_key: 'completed', label: 'Record completion' },
    { from_key: 'booked',    to_key: 'completed', label: 'Record completion' },
    { from_key: 'attended',  to_key: 'completed', label: 'Record completion' },
    { from_key: 'scheduled', to_key: 'cancelled', label: 'Cancel', note_required: true, admin_only: true },
    { from_key: 'booked',    to_key: 'cancelled', label: 'Cancel', note_required: true, admin_only: true },
    { from_key: 'attended',  to_key: 'cancelled', label: 'Cancel', note_required: true, admin_only: true },
    { from_key: 'completed', to_key: 'scheduled', label: 'Re-open', note_required: true, admin_only: true },
    { from_key: 'cancelled', to_key: 'scheduled', label: 'Re-open', note_required: true, admin_only: true },
  ],
});

/**
 * The stage a job is at, when that says more than its status: the name of an
 * IN-PROGRESS step (Booked, Attended, Quote requested…). A start or finished
 * step is already said by the status, so null.
 * @param {{ id: string }} job @param {Array<{ subject_id: string, step_key: string }>} items
 * @param {Array<{ key: string, name: string, kind: string }>} steps
 */
export function jobStage(job, items, steps) {
  const item = (items ?? []).find((i) => i.subject_id === job.id);
  const step = item ? (steps ?? []).find((s) => s.key === item.step_key) : null;
  return step?.kind === 'open' ? step.name : null;
}
