// Workflows that must be refused when saved, each with the reason — ONE list
// for BOTH copies of the save rules (2026-10-18 review): workflowProblem() in
// the browser (workflowSaveCases.test.js) and workflow_save() in the database
// (workflowDb.test.js, run against dev with `npm run test:db`). A rule changed
// in one copy and not the other fails one of the two.
//
// Each case starts from a valid workflow and breaks one thing; `expect` is a
// pattern both copies' messages must match (null: it must save).

import { DEFAULT_COMPLAINT_WORKFLOW as COMPLAINT } from '#lib/apps/complaints/utils/complaintWorkflow.js';

/** @typedef {{ name: string, appId: string, steps: any[], moves: any[], fields?: any[], expect: RegExp|null }} SaveCase */

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
];
