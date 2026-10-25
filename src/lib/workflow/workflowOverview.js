// src/lib/workflow/workflowOverview.js
//
// One table across EVERY process (2026-10-25, from a reviewer's note that each
// workflow's figures were only on its own screen): how many items are open,
// how many are late or due soon, how many are with no one, how old the oldest
// open one is and how many finished lately. Every process is items in steps,
// so one reading serves them all. Pure.
//
// ⛔ Counts and ages only — no item, no name — so it can be shown to anyone who
// may see the Workflows screen. A row says which process, never which case.

import { daysBetween, calendarDate } from '#lib/utils/dates.js';
import { deadlineBand } from './workflowDeadlines.js';
import { isFinished } from './workflowModel.js';

/** Days back that count as "lately finished". */
export const RECENT_DAYS = 30;

/**
 * @param {{ workflows: Array<{ id: string, key: string, name: string, app_id: string }>,
 *           steps: Array<{ workflow_id: string, key: string, kind: string, pauses_clock?: boolean }>,
 *           items: Array<{ workflow_id: string, step_key: string, due_on?: string|null, assigned_to?: string|null,
 *                          started_at?: string|null, updated_at?: string|null }>,
 *           today: string }} w
 * @returns {Array<{ workflow: any, open: number, overdue: number, dueSoon: number, paused: number, unassigned: number,
 *                   oldestDays: number|null, finishedRecently: number }>}
 */
export function workflowOverview({ workflows, steps, items, today }) {
  const kindOf = new Map(steps.map((s) => [`${s.workflow_id}:${s.key}`, s]));
  return workflows.map((workflow) => {
    const mine = items.filter((i) => i.workflow_id === workflow.id);
    const row = { workflow, open: 0, overdue: 0, dueSoon: 0, paused: 0, unassigned: 0, oldestDays: /** @type {number|null} */ (null), finishedRecently: 0 };
    for (const i of mine) {
      const step = kindOf.get(`${workflow.id}:${i.step_key}`);
      if (!step) continue;
      if (isFinished(step.kind)) {
        const when = i.updated_at ? calendarDate(i.updated_at) : null;
        if (when && daysBetween(when, today) <= RECENT_DAYS) row.finishedRecently++;
        continue;
      }
      row.open++;
      if (!i.assigned_to) row.unassigned++;
      if (step.pauses_clock) row.paused++;
      const band = i.due_on ? deadlineBand(i.due_on, today) : null;
      if (band === 'overdue') row.overdue++; else if (band === 'due_soon') row.dueSoon++;
      const started = i.started_at ? calendarDate(i.started_at) : null;
      if (started) {
        const age = daysBetween(started, today);
        if (row.oldestDays === null || age > row.oldestDays) row.oldestDays = age;
      }
    }
    return row;
  });
}

/** The table's totals line. @param {ReturnType<typeof workflowOverview>} rows */
export function overviewTotals(rows) {
  return rows.reduce((t, r) => ({ open: t.open + r.open, overdue: t.overdue + r.overdue, dueSoon: t.dueSoon + r.dueSoon,
    unassigned: t.unassigned + r.unassigned, finishedRecently: t.finishedRecently + r.finishedRecently }),
  { open: 0, overdue: 0, dueSoon: 0, unassigned: 0, finishedRecently: 0 });
}
