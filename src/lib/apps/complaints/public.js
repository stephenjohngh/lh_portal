// src/lib/apps/complaints/public.js
//
// PUBLIC INTERFACE of the Complaints app — what other apps may read from it.
// Other apps import from HERE and nowhere else inside `complaints/`.
//
// ⛔ A complaint names a person and may concern staff conduct. Nothing exported
// here returns the complainant, what they said or the response: a row names a
// complaint by its REFERENCE and the step it is in, never a person.

import { listDeadlines } from '#lib/workflow/workflowApi.js';
import { COMPLAINT_WORKFLOW_KEY } from './utils/complaintWorkflow.js';
import { today as todayISO } from '#lib/utils/dates.js';

/**
 * Complaints' clocks for the Planner (migration 252): each open complaint
 * whose workflow step has a deadline — acknowledge within 5 working days,
 * respond within 20, as set in Admin → Workflows. The deadline is the
 * workflow item's own `due_on`, never derived again here (one place answers
 * "what is due").
 *
 * Bounded at `to` only: a complaint already past its deadline is overdue and
 * must not fall out of view. RLS on workflow items is gated on the
 * `complaints` grant, so without it this returns nothing.
 *
 * @param {string|null} to  YYYY-MM-DD
 * @returns {Promise<Array<{ id: string, title: string, date: string, overdue: boolean }>>}
 */
export async function listComplaintDueDates(to = null) {
  const today = todayISO();
  const deadlines = await listDeadlines(COMPLAINT_WORKFLOW_KEY);
  return deadlines
    .filter((d) => !to || d.due_on <= to)
    .map((d) => ({
      id: `complaint:${d.id}`,
      title: `Complaint ${d.label ?? ''} — ${d.step}`.replace(/\s+—/, ' —'),
      date: d.due_on,
      overdue: d.due_on < today,
    }));
}
