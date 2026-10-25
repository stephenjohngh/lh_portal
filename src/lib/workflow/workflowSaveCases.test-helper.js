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
import { DEFAULT_MOR_WORKFLOW as MOR } from '#lib/apps/mor/utils/morWorkflow.js';
import { DEFAULT_GT_DOCUMENT_WORKFLOW as GTD, DEFAULT_GT_RISK_WORKFLOW as GTR } from '#lib/apps/golden_thread/utils/gtWorkflow.js';

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
const morSteps = () => MOR.steps.map((s) => ({ ...s }));
const morMoves = () => MOR.moves.map((m) => ({ ...m }));
const gtdSteps = () => GTD.steps.map((s) => ({ ...s }));
const gtdMoves = () => GTD.moves.map((m) => ({ ...m }));
const gtrSteps = () => GTR.steps.map((s) => ({ ...s }));
const gtrMoves = () => GTR.moves.map((m) => ({ ...m }));

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
  // Migration 263: MOR (BSA s.87).
  { name: 'the shipped MOR workflow saves', appId: 'mor', steps: morSteps(), moves: morMoves(), expect: null },
  { name: 'MOR: a step that is not a status', appId: 'mor',
    steps: [...morSteps(), { key: 'parked', name: 'Parked', kind: 'open' }],
    moves: [...morMoves(), { from_key: 'in_triage', to_key: 'parked', label: 'Park' }], expect: /are fixed: "parked" is not one/ },
  { name: 'MOR: a status of the wrong kind', appId: 'mor',
    steps: morSteps().map((x) => (x.key === 'reclassified' ? { ...x, kind: 'done' } : x)), moves: morMoves(),
    expect: /has a fixed kind in the MOR workflow/ },
  { name: 'MOR: a move the case cannot make', appId: 'mor', steps: morSteps(),
    moves: [...morMoves(), { from_key: 'submitted', to_key: 'closed', label: 'Close at once' }], expect: /not one an MOR case can make/ },
  { name: 'MOR: a timer', appId: 'mor', steps: morSteps(),
    moves: morMoves().map((m) => (m.from_key === 'submitted' ? { ...m, timer_days: 5 } : m)),
    expect: /a person decides every step of an MOR case/ },
  // Migration 264: Golden Thread (BSA s.88). ⛔ The audit chain names who made
  // every change, so no timer; a document is superseded only by its successor.
  { name: 'the shipped Golden Thread document workflow saves', appId: 'golden_thread', key: 'gt_document',
    steps: gtdSteps(), moves: gtdMoves(), expect: null },
  { name: 'the shipped Golden Thread risk workflow saves', appId: 'golden_thread', key: 'gt_risk',
    steps: gtrSteps(), moves: gtrMoves(), expect: null },
  { name: 'GT document: a step that is not a status', appId: 'golden_thread', key: 'gt_document',
    steps: [...gtdSteps(), { key: 'approved', name: 'Approved', kind: 'open' }],
    moves: [...gtdMoves(), { from_key: 'under_review', to_key: 'approved', label: 'Approve' }], expect: /are fixed: "approved" is not one/ },
  { name: 'GT document: a status of the wrong kind', appId: 'golden_thread', key: 'gt_document',
    steps: gtdSteps().map((x) => (x.key === 'withdrawn' ? { ...x, kind: 'done' } : x)), moves: gtdMoves(),
    expect: /has a fixed kind in the Golden Thread document workflow/ },
  { name: 'GT document: a move the register does not allow', appId: 'golden_thread', key: 'gt_document', steps: gtdSteps(),
    moves: [...gtdMoves(), { from_key: 'draft', to_key: 'current', label: 'Make current at once' }], expect: /not one a Golden Thread document can make/ },
  { name: 'GT document: another move into Superseded', appId: 'golden_thread', key: 'gt_document', steps: gtdSteps(),
    moves: [...gtdMoves(), { from_key: 'withdrawn', to_key: 'superseded', label: 'Supersede' }], expect: /not one a Golden Thread document can make|superseded only from Current/ },
  { name: 'GT document: the supersede move removed', appId: 'golden_thread', key: 'gt_document', steps: gtdSteps(),
    moves: gtdMoves().filter((m) => m.to_key !== 'superseded'), expect: /must keep its move from Current to Superseded|cannot be reached from the start/ },
  { name: 'GT document: a condition on the supersede move', appId: 'golden_thread', key: 'gt_document', steps: gtdSteps(),
    moves: gtdMoves().map((m) => (m.to_key === 'superseded' ? { ...m, four_eyes: true } : m)), expect: /cannot carry conditions of its own/ },
  { name: 'GT document: a timer', appId: 'golden_thread', key: 'gt_document', steps: gtdSteps(),
    moves: gtdMoves().map((m) => (m.from_key === 'draft' && m.to_key === 'under_review' ? { ...m, timer_days: 5 } : m)),
    expect: /audit chain against the person/ },
  { name: 'GT risk: a move the register does not allow', appId: 'golden_thread', key: 'gt_risk', steps: gtrSteps(),
    moves: [...gtrMoves(), { from_key: 'identified', to_key: 'monitored', label: 'Monitor at once' }], expect: /not one a Golden Thread risk can make/ },
  { name: 'GT risk: a timer', appId: 'golden_thread', key: 'gt_risk', steps: gtrSteps(),
    moves: gtrMoves().map((m) => (m.from_key === 'monitored' && m.to_key === 'assessed' ? { ...m, timer_days: 365 } : m)),
    expect: /audit chain against the person/ },
  // Migration 267: pause, sign-offs, escalation, evidence.
  { name: 'a step that is not in progress pauses the clock', appId: 'cases',
    steps: STEPS().map((s) => (s.key === 'open' ? { ...s, pauses_clock: true } : s)), moves: MOVES(), expect: /only a step in progress can pause the clock/ },
  { name: 'a step that pauses the clock has a deadline', appId: 'cases',
    steps: [...STEPS(), { key: 'wait', name: 'Waiting', kind: 'open', pauses_clock: true, deadline_days: 3 }],
    moves: [...MOVES(), { from_key: 'open', to_key: 'wait', label: 'Pause' }], expect: /pauses the clock, so it has no deadline of its own/ },
  { name: 'sign-offs on a finished step', appId: 'cases',
    steps: STEPS().map((s) => (s.key === 'done' ? { ...s, signoffs: [{ key: 'a', label: 'A' }] } : s)), moves: MOVES(), expect: /sign-offs belong to a step that is not finished/ },
  { name: 'a sign-off with no label', appId: 'cases',
    steps: STEPS().map((s) => (s.key === 'open' ? { ...s, signoffs: [{ key: 'a', label: ' ' }] } : s)), moves: MOVES(), expect: /every sign-off needs a label/ },
  { name: 'two sign-offs with one key', appId: 'cases',
    steps: STEPS().map((s) => (s.key === 'open' ? { ...s, signoffs: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }] } : s)), moves: MOVES(), expect: /two sign-offs share a key/ },
  { name: 'a move needs sign-offs its step does not list', appId: 'cases', steps: STEPS(),
    moves: MOVES().map((m) => (m.to_key === 'done' ? { ...m, needs_signoffs: true } : m)), expect: /needs sign-offs, but the step it leaves lists none/ },
  { name: 'a move that needs sign-offs has a timer', appId: 'cases',
    steps: STEPS().map((s) => (s.key === 'open' ? { ...s, signoffs: [{ key: 'a', label: 'A' }] } : s)),
    moves: MOVES().map((m) => (m.to_key === 'done' ? { ...m, needs_signoffs: true, timer_days: 3 } : m)), expect: /needs sign-offs, so a timer cannot make it/ },
  { name: 'escalation with days and no one to escalate to', appId: 'cases',
    steps: STEPS().map((s) => (s.key === 'open' ? { ...s, escalate_after_days: 3 } : s)), moves: MOVES(), expect: /escalation needs both the days past the deadline and who it goes to/ },
  { name: 'a process with sign-offs and a pause saves', appId: 'cases',
    steps: [{ key: 'open', name: 'Open', kind: 'start', signoffs: [{ key: 'budget', label: 'Budget' }] }, { key: 'wait', name: 'Waiting', kind: 'open', pauses_clock: true },
      { key: 'done', name: 'Done', kind: 'done' }],
    moves: [{ from_key: 'open', to_key: 'wait', label: 'Pause' }, { from_key: 'wait', to_key: 'open', label: 'Resume' },
      { from_key: 'open', to_key: 'done', label: 'Authorise', needs_signoffs: true }], expect: null },
  { name: 'a document field outside a Cases process', appId: 'parking', steps: STEPS(), moves: MOVES(),
    fields: [{ key: 'cert', label: 'Certificate', type: 'document' }], expect: /only a Cases process can have a document field/ },
  { name: 'a document field needed to open the item', appId: 'cases', steps: STEPS(), moves: MOVES(),
    fields: [{ key: 'cert', label: 'Certificate', type: 'document', required_on_create: true }], expect: /cannot be needed to open one/ },
];
