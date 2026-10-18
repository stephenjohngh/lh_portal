// The works schedule workflow's steps ARE the schedule statuses (migration
// 258): the database writes the step reached back as the status. The seed, the
// status list the screen uses and the app's fixed parts must agree — the
// database's CHECK holds SCHEDULE_STATUS (dbRulesParity.test.js).
import { describe, it, expect } from 'vitest';
import { DEFAULT_WORKS_SCHEDULE_WORKFLOW as WF, WORKS_SCHEDULE_STATUSES } from './worksScheduleWorkflow.js';
import { SCHEDULE_STATUS } from './worksSchedule.js';
import { contractFor, contractProblem } from '#lib/workflow/workflowContracts.js';
import { workflowProblem } from '#lib/workflow/workflowModel.js';

describe('the works schedule workflow', () => {
  it('has one step per schedule status, and nothing else', () => {
    expect(WF.steps.map(s => s.key).sort()).toEqual(SCHEDULE_STATUS.map(s => s.value).sort());
    expect([...WORKS_SCHEDULE_STATUSES].sort()).toEqual(SCHEDULE_STATUS.map(s => s.value).sort());
  });

  it('keeps the fixed kinds the app depends on', () => {
    const fixed = contractFor('building_assets')?.steps ?? {};
    for (const s of WF.steps) expect(s.kind, s.key).toBe(fixed[s.key]);
    expect(contractProblem('building_assets', WF)).toBeNull();
  });

  it('is a workflow the manager would save', () => {
    expect(workflowProblem(WF)).toBeNull();
  });

  it('asks why when a schedule is cancelled or reopened', () => {
    for (const m of WF.moves.filter(m => m.to_key === 'cancelled' || m.from_key === 'cancelled')) {
      expect(m.note_required, `${m.from_key} → ${m.to_key}`).toBe(true);
    }
  });
});
