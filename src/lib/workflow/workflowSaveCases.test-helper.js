// Workflows that must be refused when saved, each with the reason — ONE list
// for BOTH copies of the save rules (2026-10-18 review): workflowProblem() in
// the browser (workflowSaveCases.test.js) and workflow_save() in the database
// (workflowDb.test.js, run against dev with `npm run test:db`). A rule changed
// in one copy and not the other fails one of the two.
//
// Each case starts from a valid workflow and breaks one thing; `expect` is a
// pattern both copies' messages must match (null: it must save).

import { DEFAULT_COMPLAINT_WORKFLOW as COMPLAINT } from '#lib/apps/complaints/utils/complaintWorkflow.js';
import { DEFAULT_COMPLIANCE_ACTION_WORKFLOW as ACTION } from '#lib/apps/compliance/utils/complianceActionWorkflow.js';
import { DEFAULT_WORKS_SCHEDULE_WORKFLOW as WORKS } from '#lib/apps/building_assets/utils/worksScheduleWorkflow.js';
import { DEFAULT_MAINTENANCE_JOB_WORKFLOW as JOB } from '#lib/apps/maintenance/utils/maintenanceJobWorkflow.js';
import { DEFAULT_WAITING_LIST_WORKFLOW as WAITING } from '#lib/apps/parking/utils/waitingListWorkflow.js';

/** @typedef {{ name: string, appId: string, key?: string, steps: any[], moves: any[], fields?: any[], expect: RegExp|null }} SaveCase */

const STEPS = () => [
  { key: 'open', name: 'Open', kind: 'start' },
  { key: 'done', name: 'Done', kind: 'done' },
  { key: 'no', name: 'Not needed', kind: 'declined' },
];
const MOVES = () => [
  { from_key: 'open', to_key: 'done', label: 'Finish' },
  { from_key: 'open', to_key: 'no', label: 'Decline' },
];
const FIELDS = () => [{ key: 'where', label: 'Where', type: 'text' }];
const complaintSteps = () => COMPLAINT.steps.map((s) => ({ ...s }));
const waitingSteps = () => WAITING.steps.map((s) => ({ ...s }));
const waitingMoves = () => WAITING.moves.map((m) => ({ ...m }));
const WL = { appId: 'parking', key: WAITING.key };
const complaintMoves = () => COMPLAINT.moves.map((m) => ({ ...m }));

/** @type {SaveCase[]} */
export const SAVE_CASES = [
  { name: 'a valid process saves', appId: 'cases', steps: STEPS(), moves: MOVES(), fields: FIELDS(), expect: null },
  { name: 'the shipped Complaints workflow saves', appId: 'complaints', steps: complaintSteps(), moves: complaintMoves(), expect: null },
  { name: 'two start steps', appId: 'cases', steps: STEPS().map((s) => (s.key === 'done' ? { ...s, kind: 'start' } : s)),
    moves: MOVES(), expect: /exactly one start step/ },
  { name: 'two steps with one key', appId: 'cases', steps: [...STEPS(), { key: 'open', name: 'Again', kind: 'open' }],
    moves: MOVES(), expect: /Two steps share the key "open"/ },
  { name: 'a move to a step that is not there', appId: 'cases', steps: STEPS(),
    moves: [...MOVES(), { from_key: 'open', to_key: 'gone', label: 'Lost' }], expect: /A move refers to a step that is not in the workflow/ },
  { name: 'a deadline on a finished step', appId: 'cases', steps: STEPS().map((s) => (s.key === 'done' ? { ...s, deadline_days: 5 } : s)),
    moves: MOVES(), expect: /is finished, so it has no deadline/ },
  { name: 'a deadline of 400 days', appId: 'cases', steps: STEPS().map((s) => (s.key === 'open' ? { ...s, deadline_days: 400 } : s)),
    moves: MOVES(), expect: /a deadline is 1 to 365 days/ },
  { name: 'an unknown "who may"', appId: 'cases', steps: STEPS(), moves: MOVES().map((m, i) => (i === 0 ? { ...m, who: 'boss' } : m)),
    expect: /who may make it is anyone who can edit, or only the person it is with/ },
  { name: 'a step nothing reaches', appId: 'cases', steps: [...STEPS(), { key: 'island', name: 'Island', kind: 'open' }],
    moves: MOVES(), expect: /cannot be reached from the start/ },
  { name: 'a field of a type not offered', appId: 'cases', steps: STEPS(), moves: MOVES(),
    fields: [{ key: 'who', label: 'Resident', type: 'resident' }], expect: /has a type that is not offered/ },
  { name: 'a choice field with no choices', appId: 'cases', steps: STEPS(), moves: MOVES(),
    fields: [{ key: 'grade', label: 'Grade', type: 'choice', options: [] }], expect: /needs at least one choice/ },
  { name: 'a move needing a field the process has not got', appId: 'cases', steps: STEPS(),
    moves: MOVES().map((m, i) => (i === 0 ? { ...m, required_fields: ['nope'] } : m)), fields: FIELDS(),
    expect: /needs a field the process does not have/ },
  { name: 'a field needed to open, outside Cases', appId: 'parking', steps: STEPS(), moves: MOVES(),
    fields: [{ key: 'where', label: 'Where', type: 'text', required_on_create: true }], expect: /only a Cases process is opened with a form/ },
  { name: 'an action from another app', appId: 'cases', steps: STEPS(),
    moves: MOVES().map((m, i) => (i === 0 ? { ...m, action: 'parking_add_to_waiting_list' } : m)), expect: /is not one this app offers/ },
  { name: 'an action into a step that is not finished-accepted', appId: 'parking', steps: STEPS(),
    moves: MOVES().map((m, i) => (i === 1 ? { ...m, action: 'parking_add_to_waiting_list' } : m)),
    expect: /runs an action, so it must lead to a finished/ },
  { name: 'a move out of a step reached by an action', appId: 'parking', steps: STEPS(),
    moves: [...MOVES().map((m, i) => (i === 0 ? { ...m, action: 'parking_add_to_waiting_list' } : m)),
      { from_key: 'done', to_key: 'open', label: 'Reopen' }],
    expect: /reached by a move that runs an action, which cannot be undone/ },
  { name: 'Complaints: a step that is not a status', appId: 'complaints',
    steps: [...complaintSteps(), { key: 'triage', name: 'Triage', kind: 'open' }],
    moves: [...complaintMoves(), { from_key: 'received', to_key: 'triage', label: 'Triage' }],
    expect: /are fixed: "triage" is not one/ },
  { name: 'Complaints: a status step removed', appId: 'complaints',
    steps: complaintSteps().filter((s) => s.key !== 'withdrawn'), moves: complaintMoves().filter((m) => m.to_key !== 'withdrawn'),
    expect: /must keep its step "withdrawn"/ },
  { name: 'Complaints: a status of the wrong kind', appId: 'complaints',
    steps: complaintSteps().map((s) => (s.key === 'responded' ? { ...s, kind: 'done' } : s)), moves: complaintMoves(),
    expect: /has a fixed kind in the Complaints workflow/ },
  { name: 'Complaints: a move s.93 does not allow', appId: 'complaints', steps: complaintSteps(),
    moves: [...complaintMoves(), { from_key: 'received', to_key: 'closed', label: 'Close at once' }],
    expect: /not one BSA s\.93 allows/ },
  { name: 'the shipped Compliance action workflow saves', appId: 'compliance',
    steps: ACTION.steps.map((x) => ({ ...x })), moves: ACTION.moves.map((m) => ({ ...m })), expect: null },
  { name: 'Compliance action: a step that is not a status', appId: 'compliance',
    steps: [...ACTION.steps.map((x) => ({ ...x })), { key: 'parked', name: 'Parked', kind: 'open' }],
    moves: [...ACTION.moves.map((m) => ({ ...m })), { from_key: 'open', to_key: 'parked', label: 'Park' }],
    expect: /Compliance action workflow's steps are the action statuses and are fixed: "parked"/ },
  { name: 'the shipped Works schedule workflow saves', appId: 'building_assets',
    steps: WORKS.steps.map((x) => ({ ...x })), moves: WORKS.moves.map((m) => ({ ...m })), expect: null },
  { name: 'Works schedule: a status of the wrong kind', appId: 'building_assets',
    steps: WORKS.steps.map((x) => (x.key === 'issued' ? { ...x, kind: 'done' } : { ...x })), moves: WORKS.moves.map((m) => ({ ...m })),
    expect: /has a fixed kind in the Works schedule workflow/ },
  // Timers (migration 259).
  { name: 'a timer of 0 days', appId: 'cases', steps: STEPS(),
    moves: MOVES().map((m, i) => (i === 0 ? { ...m, timer_days: 0 } : m)), expect: /a timer is 1 to 365 days/ },
  { name: 'a timer on a move that runs an action', appId: 'parking', steps: STEPS(),
    moves: MOVES().map((m, i) => (i === 0 ? { ...m, action: 'parking_add_to_waiting_list', timer_days: 5 } : m)),
    expect: /cannot be made by a timer — a person must make it/ },
  { name: 'two timers out of one step', appId: 'cases', steps: STEPS(),
    moves: MOVES().map((m) => ({ ...m, timer_days: 5 })), expect: /more than one move with a timer/ },
  { name: 'a timer out of a finished step', appId: 'cases', steps: STEPS(),
    moves: [...MOVES(), { from_key: 'done', to_key: 'open', label: 'Reopen', timer_days: 3 }],
    expect: /leaves a finished step, so it cannot be made by a timer/ },
  { name: 'a timer counting something else', appId: 'cases', steps: STEPS(),
    moves: MOVES().map((m, i) => (i === 0 ? { ...m, timer_days: 5, timer_basis: 'hours' } : m)),
    expect: /a timer counts calendar or working days/ },
  { name: 'a valid timer saves', appId: 'cases', steps: STEPS(),
    moves: MOVES().map((m, i) => (i === 1 ? { ...m, timer_days: 30, timer_basis: 'working' } : m)), fields: FIELDS(), expect: null },
  // Maintenance jobs (migration 260): the steps are the administrator's.
  { name: 'the shipped Maintenance job workflow saves', appId: 'maintenance',
    steps: JOB.steps.map((x) => ({ ...x })), moves: JOB.moves.map((m) => ({ ...m })), expect: null },
  { name: 'Maintenance job: stages of a building’s own save', appId: 'maintenance',
    steps: [...STEPS(), { key: 'quoted', name: 'Quote requested', kind: 'open' }],
    moves: [...MOVES(), { from_key: 'open', to_key: 'quoted', label: 'Ask for a quote' }, { from_key: 'quoted', to_key: 'done', label: 'Record completion' }],
    expect: null },
  { name: 'Maintenance job: no step where a job is completed', appId: 'maintenance',
    steps: STEPS().filter((x) => x.kind !== 'done'), moves: MOVES().filter((m) => m.to_key !== 'done'),
    expect: /needs a finished — accepted step/ },
  { name: 'Maintenance job: a timer that would complete a job', appId: 'maintenance', steps: STEPS(),
    moves: MOVES().map((m, i) => (i === 0 ? { ...m, timer_days: 10 } : m)),
    expect: /completes a job, so it cannot be made by a timer/ },
  // Migration 262: a timer counted after the item's deadline, and the waiting
  // list's own rules — by its KEY, since Parking has another workflow.
  { name: 'a timer after the deadline saves', appId: 'cases', steps: STEPS(),
    moves: MOVES().map((m, i) => (i === 1 ? { ...m, timer_days: 2, timer_basis: 'deadline' } : m)), fields: FIELDS(), expect: null },
  { name: 'the shipped Waiting list place workflow saves', ...WL, steps: waitingSteps(), moves: waitingMoves(), expect: null },
  { name: 'Waiting list place: a step the list does not have', ...WL,
    steps: [...waitingSteps(), { key: 'held', name: 'Held', kind: 'open' }],
    moves: [...waitingMoves(), { from_key: 'waiting', to_key: 'held', label: 'Hold' }], expect: /are fixed: "held" is not one/ },
  { name: 'Waiting list place: a move the list cannot make', ...WL, steps: waitingSteps(),
    moves: [...waitingMoves(), { from_key: 'waiting', to_key: 'allocated', label: 'Straight in' }], expect: /not one a waiting-list place can make/ },
  { name: 'Waiting list place: a timer that would make an offer', ...WL, steps: waitingSteps(),
    moves: waitingMoves().map((m) => (m.from_key === 'waiting' && m.to_key === 'offered' ? { ...m, timer_days: 3 } : m)),
    expect: /needs a bay or an agreement a person chooses/ },
  { name: 'Parking’s online application is not held to the waiting list’s steps', appId: 'parking', steps: STEPS(), moves: MOVES(), expect: null },
];
