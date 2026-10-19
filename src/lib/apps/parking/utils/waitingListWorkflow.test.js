// The waiting-list place workflow (migration 262): the seed saves, its steps
// are exactly the place's statuses, and its timer is the lapse.
import { describe, it, expect } from 'vitest';
import { DEFAULT_WAITING_LIST_WORKFLOW as WF } from './waitingListWorkflow.js';
import { APPLICATION_STATUSES } from './waitingListModel.js';
import { contractProblem, contractFor } from '#lib/workflow/workflowContracts.js';
import { workflowProblem, publicStatusAllowed } from '#lib/workflow/workflowModel.js';
import { shippedWorkflowFor } from '#lib/workflow/shippedWorkflows.js';

describe('the waiting-list place workflow', () => {
  it('is a workflow the manager would save, and keeps its own rules', () => {
    expect(workflowProblem(WF)).toBeNull();
    expect(contractProblem('parking', WF, WF.key)).toBeNull();
  });

  it('has exactly the place statuses as its steps', () => {
    expect(WF.steps.map((s) => s.key).sort()).toEqual(APPLICATION_STATUSES.map((s) => s.value).sort());
    expect(Object.keys(contractFor('parking', WF.key)?.steps ?? {}).sort()).toEqual(WF.steps.map((s) => s.key).sort());
  });

  it('lets an offer go back to the queue by itself, the day after it expires', () => {
    const back = WF.moves.find((m) => m.from_key === 'offered' && m.to_key === 'waiting');
    expect(back).toMatchObject({ timer_days: 1, timer_basis: 'deadline' });
  });

  it('refuses a timer into a step that needs a bay or an agreement', () => {
    const moves = WF.moves.map((m) => (m.to_key === 'offered' && m.from_key === 'waiting' ? { ...m, timer_days: 3, timer_basis: 'calendar' } : m));
    expect(contractProblem('parking', { ...WF, moves }, WF.key)).toMatch(/cannot be made by a timer/);
    expect(workflowProblem({ ...WF, moves })).toMatch(/cannot be made by a timer/);
  });

  it('refuses a step or move the waiting list does not have', () => {
    expect(contractProblem('parking', { ...WF, steps: [...WF.steps, { key: 'held', name: 'Held', kind: 'open' }] }, WF.key)).toMatch(/fixed: "held"/);
    const moves = [...WF.moves, { from_key: 'waiting', to_key: 'allocated', label: 'Straight in' }];
    expect(contractProblem('parking', { ...WF, moves }, WF.key)).toMatch(/not one a waiting-list place can make/);
  });

  it('leaves Parking’s online application to its own (unfixed) rules', () => {
    expect(contractFor('parking', 'parking_application')).toBeNull();
  });

  it('can never answer the public, unlike the online application', () => {
    expect(publicStatusAllowed('parking', WF.key)).toBe(false);
    expect(publicStatusAllowed('parking', 'parking_application')).toBe(true);
  });

  it('ships', () => {
    expect(shippedWorkflowFor(WF.key)).toBe(WF);
  });
});
