// src/lib/workflow/workflowDeadlines.js
//
// Step deadlines (migration 248, 2026-10-17): a step may give its items N
// days, in calendar or working days, from entering the step or from the
// item's start. The database sets each item's `due_on` (workflow_due_on() and
// workflow_item_due()); this is the same arithmetic and wording for the
// screens. Working days are Monday to Friday less the non-working days
// (bank holidays), held in `non_working_days` and edited in Admin → Workflows.

import { addDaysISO, daysUntil } from '#lib/utils/dates.js';
import { dueBandOf, dueSoonDays } from '#lib/utils/dueWindows.js';

export const DEADLINE_BASES = Object.freeze([
  { value: 'calendar', label: 'calendar days' },
  { value: 'working',  label: 'working days' },
]);
export const DEADLINE_FROM = Object.freeze([
  { value: 'entered', label: 'of reaching this step' },
  { value: 'started', label: 'of the start' },
]);

/** The deadline in words, or '' when the step has none. @param {{ deadline_days?: number|null, deadline_basis?: string, deadline_from?: string }} step */
export function describeDeadline(step) {
  const n = step?.deadline_days;
  if (!n) return '';
  const basis = DEADLINE_BASES.find((b) => b.value === (step.deadline_basis ?? 'calendar'))?.label ?? 'days';
  const from = DEADLINE_FROM.find((f) => f.value === (step.deadline_from ?? 'entered'))?.label ?? '';
  return `Within ${n} ${n === 1 ? basis.replace(/s$/, '') : basis} ${from}`;
}

/**
 * N days on from a date — the database's workflow_due_on(), for previews and tests.
 * @param {string} startISO @param {number} days @param {'calendar'|'working'} basis
 * @param {Set<string>|string[]} [nonWorking]  'YYYY-MM-DD'
 */
export function addDeadlineDays(startISO, days, basis, nonWorking = []) {
  if (basis === 'calendar') return addDaysISO(startISO, days);
  const off = nonWorking instanceof Set ? nonWorking : new Set(nonWorking);
  let d = startISO;
  for (let n = 0; n < days;) {
    d = addDaysISO(d, 1);
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();   // a calendar date's own weekday
    if (dow !== 0 && dow !== 6 && !off.has(d)) n++;
  }
  return d;
}

/**
 * How an item's deadline stands today: 'overdue' · 'due_soon' · 'ok', or null
 * when it has none; the due-soon window is an admin setting (workflowStep).
 * @param {string|null|undefined} dueOn @param {string} [todayISO]
 */
export function deadlineBand(dueOn, todayISO) {
  return dueBandOf(dueOn ?? null, dueSoonDays('workflowStep'), todayISO);
}

/** "Due today", "2 days overdue", "Due in 3 days". @param {string|null|undefined} dueOn @param {string} [todayISO] */
export function deadlineWords(dueOn, todayISO) {
  if (!dueOn) return '';
  const d = daysUntil(dueOn, todayISO);
  if (d === 0) return 'Due today';
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  return `Due in ${d} day${d === 1 ? '' : 's'}`;
}
