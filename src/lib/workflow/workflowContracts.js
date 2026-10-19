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
import { isValidTransition as morTransitionAllowed } from '#lib/apps/mor/utils/morHelpers.js';

/**
 * @typedef {{ name: string, stepsAre?: string, steps?: Record<string, string>, moveAllowed?: (from: string, to: string) => boolean, moveRule?: string, check?: (def: any) => string|null, subjectDue?: boolean, explains: string }} Contract
 *   steps — the step keys the workflow must have exactly, each with its fixed kind
 *   check — a rule of the app's own that is not a fixed list (maintenance)
 *   subjectDue — its items' deadline is the SUBJECT's own date (workflow_subject_due),
 *                not the steps' — so step deadlines do not date them
 */

/** @type {Readonly<Record<string, Contract>>} */
export const CONTRACTS = Object.freeze({
  complaints: {
    name: 'Complaints',
    stepsAre: 'the complaint statuses (BSA s.93)',
    steps: {
      received: 'start', acknowledged: 'open', investigating: 'open', responded: 'open',
      closed: 'done', escalated_to_bsr: 'done', withdrawn: 'declined',
    },
    moveAllowed: isValidTransition,
    explains: 'Its steps are the complaint statuses (BSA s.93) and each has a fixed kind; a move must be one s.93 allows. The names, deadlines, conditions and fields can be changed.',
  },
  // Migration 263: Mandatory Occurrence Reporting (BSA 2022 s.87). ⛔ No timer:
  // a person decides every step — a triage, a decision, a report to the BSR.
  mor: {
    name: 'MOR',
    stepsAre: 'the MOR case statuses (BSA s.87)',
    steps: {
      submitted: 'start', acknowledged: 'open', in_triage: 'open', in_assessment: 'open',
      decision_pending: 'open', bsr_notice: 'open', bsr_report: 'open', in_remediation: 'open',
      awaiting_reporter: 'open', awaiting_bsr: 'open', remediated: 'open',
      closed: 'done', reclassified: 'declined', reopened: 'open',
    },
    moveAllowed: morTransitionAllowed,
    moveRule: 'an MOR case can make',
    check: ({ moves }) => {
      const timed = moves.find((/** @type {any} */ m) => m.timer_days != null && m.timer_days !== '');
      return timed ? `The move "${timed.label}" cannot be made by a timer: a person decides every step of an MOR case.` : null;
    },
    explains: 'Its steps are the MOR case statuses (BSA s.87) and each has a fixed kind; a move must be one the MOR machine allows, and none may be made by a timer. A triage move records its outcome, an approval needs a proposed decision of that outcome and an approver who did not propose it, and the BSR report move records the report’s reference. The names, notes, conditions and who may move can be changed; MOR’s statutory clocks are its own.',
  },
  // W3 (migration 255): the register's outstanding actions.
  compliance: {
    name: 'Compliance action',
    stepsAre: 'the action statuses',
    steps: { open: 'start', in_progress: 'open', answered: 'open', closed: 'done' },
    subjectDue: true,
    explains: 'Its steps are the action statuses of the compliance obligations register and each has a fixed kind. The names, moves, notes and conditions can be changed; an action’s deadline is its own due date.',
  },
  // Migration 258: works schedules. ⚠ Every Building Assets workflow — this is
  // the only one today.
  building_assets: {
    name: 'Works schedule',
    stepsAre: 'the works schedule statuses',
    steps: { draft: 'start', issued: 'open', completed: 'done', cancelled: 'declined' },
    subjectDue: true,
    explains: 'Its steps are the works schedule statuses and each has a fixed kind. The names, moves, notes and conditions can be changed; a schedule’s deadline is its expected completion date.',
  },
  // Migration 260: maintenance jobs. ⭐ The steps are the administrator's —
  // a step's KIND is the job's status — so only two rules are fixed.
  maintenance: {
    name: 'Maintenance job',
    subjectDue: true,
    check: ({ steps, moves }) => {
      const kindOf = new Map(steps.map((/** @type {any} */ s) => [s.key, s.kind]));
      if (!steps.some((/** @type {any} */ s) => s.kind === 'done')) {
        return 'A Maintenance job workflow needs a finished — accepted step: it is where a job is completed.';
      }
      const timed = moves.find((/** @type {any} */ m) => kindOf.get(m.to_key) === 'done' && m.timer_days != null && m.timer_days !== '');
      if (timed) return `The move "${timed.label}" completes a job, so it cannot be made by a timer — a person records the result.`;
      return null;
    },
    explains: 'Its steps are yours: add the stages your contractors work to. A step’s kind sets the job’s status — start is Scheduled, in progress is In progress, finished — accepted is Completed (reached only by recording the result), finished — not accepted is Cancelled. A job’s deadline is its scheduled date, or its hard expiry date when earlier.',
  },
});

/**
 * A workflow's own rules where its app has more than one workflow (migration
 * 262, workflow_key_problem()): Parking's online application has none of its
 * own; its waiting list does. Checked instead of the app's.
 * @type {Readonly<Record<string, Contract>>}
 */
export const KEY_CONTRACTS = Object.freeze({
  parking_waiting_list: {
    name: 'Waiting list place',
    stepsAre: 'the waiting-list statuses',
    steps: { waiting: 'start', offered: 'open', allocated: 'done', withdrawn: 'declined' },
    moveAllowed: (from, to) => WAITING_LIST_MOVES.has(`${from}>${to}`),
    moveRule: 'a waiting-list place can make',
    check: ({ steps, moves }) => {
      const timed = moves.find((/** @type {any} */ m) => ['offered', 'allocated'].includes(m.to_key) && m.timer_days != null && m.timer_days !== '');
      return timed ? `The move "${timed.label}" needs a bay or an agreement a person chooses, so it cannot be made by a timer.` : null;
    },
    subjectDue: true,
    explains: 'Its steps are the waiting-list statuses and each has a fixed kind; a move must be one the waiting list allows. An offer’s deadline is its own expiry date, so “Back to the queue” can happen by itself after it. The names, notes and conditions can be changed. Going back to the queue before the expiry date is recorded as declined, after it as lapsed.',
  },
});

/** The moves a waiting-list place can make — the lifecycle trigger's (224, 229). */
const WAITING_LIST_MOVES = new Set(['waiting>offered', 'waiting>withdrawn', 'offered>waiting',
  'offered>allocated', 'offered>withdrawn', 'allocated>offered']);

/** The fixed parts of a workflow — its own, else its app's — or null. @param {string} appId @param {string} [key] */
export function contractFor(appId, key = '') {
  return KEY_CONTRACTS[key] ?? CONTRACTS[appId] ?? null;
}

/**
 * Why this workflow would break its app, or null — the database's own words.
 * @param {string} appId
 * @param {{ steps: Array<{ key: string, name: string, kind: string }>, moves: Array<{ from_key: string, to_key: string }> }} def
 * @param {string} [key]  the workflow's key — a workflow with its own rules (KEY_CONTRACTS) is checked by them
 */
export function contractProblem(appId, { steps, moves }, key = '') {
  const c = contractFor(appId, key);
  if (!c) return null;
  if (c.steps) {
    const fixed = c.steps;
    const extra = steps.find((s) => !(s.key in fixed));
    if (extra) return `The ${c.name} workflow's steps are ${c.stepsAre} and are fixed: "${extra.key}" is not one.`;
    const lost = Object.keys(fixed).find((k) => !steps.some((s) => s.key === k));
    if (lost) return `The ${c.name} workflow must keep its step "${lost}".`;
    const wrongKind = steps.find((s) => s.kind !== fixed[s.key]);
    if (wrongKind) return `Step "${wrongKind.name}" has a fixed kind in the ${c.name} workflow.`;
  }
  if (c.check) {
    const why = c.check({ steps, moves });
    if (why) return why;
  }
  if (c.moveAllowed) {
    const bad = moves.find((m) => !c.moveAllowed?.(m.from_key, m.to_key));
    if (bad) return `A move from "${bad.from_key}" to "${bad.to_key}" is not one ${c.moveRule ?? 'BSA s.93 allows a complaint to make'}.`;
  }
  return null;
}
