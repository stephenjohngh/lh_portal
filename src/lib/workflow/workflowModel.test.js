// The workflow manager's rules (migration 247) — the same checks as
// workflow_save() and workflow_move() in the database, which were rehearsed
// against these cases on dev.
import { describe, it, expect } from 'vitest';
import { workflowProblem, movesFrom, stepKeyFor, isFinished, STEP_KINDS } from './workflowModel.js';
import { actionsFor, WORKFLOW_ACTIONS } from './workflowActions.js';
import { DEFAULT_APPLICATION_WORKFLOW } from '#lib/apps/parking/utils/applicationWorkflow.js';

const S = (/** @type {string} */ key, /** @type {any} */ kind, name = key) => ({ key, name, kind });
const M = (/** @type {string} */ from_key, /** @type {string} */ to_key, extra = {}) => ({ from_key, to_key, label: `${from_key} to ${to_key}`, ...extra });

describe('workflowProblem — what workflow_save() refuses, said first', () => {
  it('the shipped parking application workflow is well formed', () => {
    const d = DEFAULT_APPLICATION_WORKFLOW;
    expect(workflowProblem({ steps: d.steps, moves: d.moves, appId: d.appId })).toBeNull();
  });
  it('exactly one start', () => {
    expect(workflowProblem({ steps: [S('a', 'start'), S('b', 'start')], moves: [], appId: 'parking' })).toMatch(/exactly one start/);
    expect(workflowProblem({ steps: [S('a', 'open')], moves: [], appId: 'parking' })).toMatch(/exactly one start/);
  });
  it('every step reachable from the start', () => {
    expect(workflowProblem({ steps: [S('a', 'start'), S('b', 'done')], moves: [], appId: 'parking' })).toMatch(/"b" cannot be reached/);
  });
  it('a move OUT of a finished step is allowed — a reopen (migration 252; it was refused before)', () => {
    expect(workflowProblem({ steps: [S('a', 'start'), S('b', 'declined'), S('c', 'open')],
      moves: [M('a', 'b'), M('b', 'c')], appId: 'parking' })).toBeNull();
  });
  it('an action only on a move into an accepted (done) step, and only one the app offers', () => {
    expect(workflowProblem({ steps: [S('a', 'start'), S('b', 'open')],
      moves: [M('a', 'b', { action: 'parking_add_to_waiting_list' })], appId: 'parking' })).toMatch(/runs an action/);
    expect(workflowProblem({ steps: [S('a', 'start'), S('b', 'done')],
      moves: [M('a', 'b', { action: 'parking_add_to_waiting_list' })], appId: 'compliance' })).toMatch(/not one this app offers/);
  });
  it('keys unique and well formed; moves between steps that exist, not to themselves, not twice, with a label', () => {
    expect(workflowProblem({ steps: [S('a', 'start'), S('a', 'done')], moves: [], appId: 'parking' })).toMatch(/share the key/);
    expect(workflowProblem({ steps: [S('A b', 'start')], moves: [], appId: 'parking' })).toMatch(/key that cannot be used/);
    expect(workflowProblem({ steps: [S('a', 'start')], moves: [M('a', 'z')], appId: 'parking' })).toMatch(/not in the workflow/);
    expect(workflowProblem({ steps: [S('a', 'start'), S('b', 'done')], moves: [M('a', 'b'), M('a', 'b')], appId: 'parking' })).toMatch(/two moves/);
    expect(workflowProblem({ steps: [S('a', 'start'), S('b', 'done')], moves: [M('a', 'b', { label: ' ' })], appId: 'parking' })).toMatch(/button label/);
  });
});

describe('movesFrom — what a person may press', () => {
  const moves = [M('a', 'b', { position: 2 }), M('a', 'c', { admin_only: true, position: 1 }), M('b', 'c')];
  it('an editor gets the moves from the step, not the admin-only ones', () => {
    expect(movesFrom(moves, 'a', { canEdit: true }).map((m) => m.to_key)).toEqual(['b']);
  });
  it('an admin gets them all, in order', () => {
    expect(movesFrom(moves, 'a', { isAdmin: true }).map((m) => m.to_key)).toEqual(['c', 'b']);
  });
  it('a read-only person gets none', () => {
    expect(movesFrom(moves, 'a', {})).toEqual([]);
  });
});

describe('the rest', () => {
  it('a new step’s key comes from its name, unique', () => {
    expect(stepKeyFor('Being checked')).toBe('being_checked');
    expect(stepKeyFor('Being checked', ['being_checked'])).toBe('being_checked_2');
    expect(stepKeyFor('2nd look')).toMatch(/^step_/);
  });
  it('the kinds are the database’s list, and done/declined are finished', () => {
    expect(STEP_KINDS.map((k) => k.value)).toEqual(['start', 'open', 'done', 'declined']);
    expect(isFinished('done') && isFinished('declined') && !isFinished('open')).toBe(true);
  });
  it('every action belongs to an app, and Parking offers the waiting-list one', () => {
    expect(WORKFLOW_ACTIONS.every((a) => a.appId && a.key && a.label)).toBe(true);
    expect(actionsFor('parking').map((a) => a.key)).toEqual(['parking_add_to_waiting_list']);
  });
});
