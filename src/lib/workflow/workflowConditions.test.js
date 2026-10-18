// Conditions on a move (migration 251): who may make it (anyone who can edit,
// or only the person it is with) and four-eyes (not the person who made the
// last move). The code says why before anything is pressed; the database
// makes the same check in workflow_move(). Both bind administrators.
import { describe, it, expect } from 'vitest';
import { moveRefusal, workflowProblem, definitionOf, workflowDiff, MOVE_WHO } from './workflowModel.js';
import { DEFAULT_APPLICATION_WORKFLOW as WF } from '#lib/apps/parking/utils/applicationWorkflow.js';

const decline = { from_key: 'checking', to_key: 'declined', label: 'Decline', four_eyes: true };
const accept = { from_key: 'checking', to_key: 'waiting_list', label: 'Accept', who: 'assignee' };

describe('moveRefusal', () => {
  it('an ordinary move is never refused here', () => {
    expect(moveRefusal({ from_key: 'a', to_key: 'b', label: 'Go' }, { userId: 'me', lastMoverId: 'me' })).toBeNull();
  });
  it('four-eyes: not the person who made the last move; anyone else, or a move by nobody (the online form), is fine', () => {
    expect(moveRefusal(decline, { userId: 'me', lastMoverId: 'me' })).toMatch(/Someone other than the person who made the last move/);
    expect(moveRefusal(decline, { userId: 'me', lastMoverId: 'you' })).toBeNull();
    expect(moveRefusal(decline, { userId: 'me', lastMoverId: null })).toBeNull();
  });
  it('assignee only: nobody has it → give it to someone first; someone else has it → only them', () => {
    expect(moveRefusal(accept, { userId: 'me', assignedTo: null })).toMatch(/Give it to someone first/);
    expect(moveRefusal(accept, { userId: 'me', assignedTo: 'you' })).toBe('Only the person it is with can do this.');
    expect(moveRefusal(accept, { userId: 'me', assignedTo: 'me' })).toBeNull();
  });
});

describe('saving and the history', () => {
  const steps = WF.steps.map((s, i) => ({ ...s, position: i + 1 }));
  it('an unknown "who" is refused before saving', () => {
    expect(workflowProblem({ steps, moves: [{ ...WF.moves[0], who: 'boss' }, ...WF.moves.slice(1)], appId: 'parking' })).toMatch(/who may make it/);
    expect(MOVE_WHO.map((w) => w.value)).toEqual(['anyone', 'assignee']);
  });
  it('the change history says when a move gains or loses a condition', () => {
    const before = definitionOf({ name: WF.name, steps, moves: WF.moves });
    const after = definitionOf({ name: WF.name, steps, moves: WF.moves.map((m) => (m.to_key === 'declined' ? { ...m, four_eyes: true } : m.to_key === 'waiting_list' ? { ...m, who: 'assignee' } : m)) });
    const lines = workflowDiff(before, after).join(' ');
    expect(lines).toMatch(/now four-eyes/);
    expect(lines).toMatch(/now only the person it is with/);
    expect(workflowDiff(after, before).join(' ')).toMatch(/no longer four-eyes.*now anyone who can edit|now anyone who can edit.*no longer four-eyes/);
  });
});
