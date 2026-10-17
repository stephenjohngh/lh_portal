// src/lib/workflow/workflowStats.js
//
// How a workflow is actually being used, from its items and their history
// (workflow_events) — the "process mining" view a standard model gives every
// process for free (2026-10-17). Pure.
//
//   per step: how many are in it now, how many of those are overdue, how many
//             have ever been in it, and the median days an item spends there
//   per move: how many times it has been made
//   off-path: moves made that the workflow does not (or no longer) allow —
//             conformance, since a workflow can be changed after use

import { daysBetween, calendarDate } from '#lib/utils/dates.js';

/** A move's London calendar date — days in a step are counted in the building's time. */
const dayOf = (/** @type {string} */ iso) => /** @type {string} */ (calendarDate(iso));

/** @param {number[]} xs */
function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * @param {{ steps: Array<{ key: string, kind: string }>, moves: Array<{ from_key: string, to_key: string }>,
 *           items: Array<{ id: string, step_key: string, due_on?: string|null }>,
 *           events: Array<{ item_id: string, from_key: string|null, to_key: string, at: string }>,
 *           today: string }} w
 */
export function workflowStats({ steps, moves, items, events, today }) {
  const finished = new Set(steps.filter((s) => s.kind === 'done' || s.kind === 'declined').map((s) => s.key));
  /** @type {Record<string, { now: number, overdue: number, ever: number, medianDays: number|null }>} */
  const step = Object.fromEntries(steps.map((s) => [s.key, { now: 0, overdue: 0, ever: 0, medianDays: null }]));
  for (const i of items) {
    if (!step[i.step_key]) continue;
    step[i.step_key].now += 1;
    if (!finished.has(i.step_key) && i.due_on && i.due_on < today) step[i.step_key].overdue += 1;
  }

  // Each item's history in order: when it entered each step and when it left.
  /** @type {Map<string, any[]>} */
  const byItem = new Map();
  for (const e of [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))) {
    if (!byItem.has(e.item_id)) byItem.set(e.item_id, []);
    /** @type {any[]} */ (byItem.get(e.item_id)).push(e);
  }
  /** @type {Record<string, number[]>} */
  const spans = {};
  /** @type {Record<string, number>} */
  const moveCount = {};
  const allowed = new Set(moves.map((m) => `${m.from_key}>${m.to_key}`));
  /** @type {Record<string, number>} */
  const offPath = {};
  for (const evs of byItem.values()) {
    const seen = new Set();
    evs.forEach((e, n) => {
      if (step[e.to_key] && !seen.has(e.to_key)) { step[e.to_key].ever += 1; seen.add(e.to_key); }
      if (e.from_key) {
        const k = `${e.from_key}>${e.to_key}`;
        moveCount[k] = (moveCount[k] ?? 0) + 1;
        if (!allowed.has(k)) offPath[k] = (offPath[k] ?? 0) + 1;
      }
      const next = evs[n + 1];
      if (next && !finished.has(e.to_key)) (spans[e.to_key] ??= []).push(daysBetween(dayOf(e.at), dayOf(next.at)));
    });
  }
  for (const [k, xs] of Object.entries(spans)) if (step[k]) step[k].medianDays = median(xs);

  const open = items.filter((i) => !finished.has(i.step_key)).length;
  const overdue = Object.values(step).reduce((n, s) => n + s.overdue, 0);
  return { step, moveCount, offPath, open, overdue, total: items.length };
}
