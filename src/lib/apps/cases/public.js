// src/lib/apps/cases/public.js
//
// PUBLIC INTERFACE of the Cases app — what other apps may read from it.
// Other apps import from HERE and nowhere else inside `cases/`.
//
// ⛔ A case's title, description or fields may name a person. Nothing
// exported here returns them: a row names a case by its REFERENCE, its
// process and the step it is in.

import { api } from '#lib/utils/api.js';
import { listDeadlines } from '#lib/workflow/workflowApi.js';
import { today as todayISO } from '#lib/utils/dates.js';

/**
 * Every Cases process's deadlines, for the Planner (migration 253): each open
 * case whose step has a deadline, as set in Admin → Workflows. The date is the
 * workflow item's own `due_on`, never derived again here.
 *
 * Bounded at `to` only: a case past its deadline is overdue and stays in view.
 * RLS on workflows and items is gated on the `cases` grant, so without it this
 * returns nothing.
 *
 * @param {string|null} to  YYYY-MM-DD
 * @returns {Promise<Array<{ id: string, title: string, date: string, overdue: boolean }>>}
 */
export async function listCaseDueDates(to = null) {
  const today = todayISO();
  const processes = await api.getAll('workflows', { select: 'id, key', filters: { app_id: 'cases' }, orderBy: 'key' });
  const lists = await Promise.all(processes.map((p) => listDeadlines(p.key)));
  return lists.flat()
    .filter((d) => !to || d.due_on <= to)
    .map((d) => ({
      id: `case:${d.id}`,
      title: `${d.workflow} ${d.label ?? ''} — ${d.step}`.replace(/\s+—/, ' —'),
      date: d.due_on,
      overdue: d.due_on < today,
    }));
}
