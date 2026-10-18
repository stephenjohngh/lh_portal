// src/lib/workflow/workflowContracts.js
//
// What an app needs its workflow to keep (migration 254, the 2026-10-18
// review). The review mark says WHO may change a workflow; this says whether a
// change will WORK. Without it an administrator could save a Complaints step
// that is not a status, or a move s.93 does not allow, and nothing failed
// until somebody pressed the button.
//
// The database holds the same rules (workflow_app_problem(), called by
// workflow_save()) and enforces them; this copy says why before saving and
// lets the editor show what is fixed. The words, deadlines, conditions and
// fields stay the administrator's. ⛔ A new app's fixed parts are added in
// BOTH places, like an action (workflowActions.js).

import { isValidTransition } from '#lib/apps/complaints/utils/complaintLifecycle.js';

/**
 * @typedef {{ steps?: Record<string, string>, moveAllowed?: (from: string, to: string) => boolean, explains: string }} Contract
 *   steps — the step keys the workflow must have exactly, each with its fixed kind
 */

/** @type {Readonly<Record<string, Contract>>} */
export const CONTRACTS = Object.freeze({
  complaints: {
    steps: {
      received: 'start', acknowledged: 'open', investigating: 'open', responded: 'open',
      closed: 'done', escalated_to_bsr: 'done', withdrawn: 'declined',
    },
    moveAllowed: isValidTransition,
    explains: 'Its steps are the complaint statuses (BSA s.93) and each has a fixed kind; a move must be one s.93 allows. The names, deadlines, conditions and fields can be changed.',
  },
});

/** The fixed parts of an app's workflows, or null. @param {string} appId */
export function contractFor(appId) {
  return CONTRACTS[appId] ?? null;
}

/**
 * Why this workflow would break its app, or null — the database's own words.
 * @param {string} appId
 * @param {{ steps: Array<{ key: string, name: string, kind: string }>, moves: Array<{ from_key: string, to_key: string }> }} def
 */
export function contractProblem(appId, { steps, moves }) {
  const c = contractFor(appId);
  if (!c) return null;
  if (c.steps) {
    const fixed = c.steps;
    const extra = steps.find((s) => !(s.key in fixed));
    if (extra) return `The Complaints workflow's steps are the complaint statuses (BSA s.93) and are fixed: "${extra.key}" is not one.`;
    const lost = Object.keys(fixed).find((k) => !steps.some((s) => s.key === k));
    if (lost) return `The Complaints workflow must keep its step "${lost}".`;
    const wrongKind = steps.find((s) => s.kind !== fixed[s.key]);
    if (wrongKind) return `Step "${wrongKind.name}" has a fixed kind in the Complaints workflow.`;
  }
  if (c.moveAllowed) {
    const bad = moves.find((m) => !c.moveAllowed?.(m.from_key, m.to_key));
    if (bad) return `A move from "${bad.from_key}" to "${bad.to_key}" is not one BSA s.93 allows a complaint to make.`;
  }
  return null;
}
