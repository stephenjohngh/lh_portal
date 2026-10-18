// The maintenance job workflow (migration 260): its steps are the
// administrator's, and a step's KIND is the job's status. The seed must save,
// every kind must name a status the database accepts, and a job must be able
// to complete — from every open stage — only through Record completion.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAINTENANCE_JOB_WORKFLOW as WF, STATUS_FOR_KIND, MAINTENANCE_JOB_STATUSES, jobStage,
} from './maintenanceJobWorkflow.js';
import { contractProblem } from '#lib/workflow/workflowContracts.js';
import { workflowProblem, STEP_KINDS } from '#lib/workflow/workflowModel.js';

describe('the maintenance job workflow', () => {
  it('is a workflow the manager would save, and keeps the app’s rules', () => {
    expect(workflowProblem(WF)).toBeNull();
    expect(contractProblem('maintenance', WF)).toBeNull();
  });

  it('turns every step kind into a status the database accepts, each status once', () => {
    const kinds = (STEP_KINDS ?? []).map((/** @type {any} */ k) => (typeof k === 'string' ? k : k.value));
    expect(Object.keys(STATUS_FOR_KIND).sort()).toEqual([...kinds].sort());
    expect(Object.values(STATUS_FOR_KIND).sort()).toEqual([...MAINTENANCE_JOB_STATUSES].sort());
  });

  it('can complete a job from every stage it can be at', () => {
    const doneKeys = WF.steps.filter((s) => s.kind === 'done').map((s) => s.key);
    for (const s of WF.steps.filter((x) => x.kind === 'start' || x.kind === 'open')) {
      expect(WF.moves.some((m) => m.from_key === s.key && doneKeys.includes(m.to_key)), s.key).toBe(true);
    }
  });

  it('asks why a job is cancelled or re-opened, and lets only an administrator do it', () => {
    for (const m of WF.moves.filter((x) => x.to_key === 'cancelled' || x.from_key === 'completed' || x.from_key === 'cancelled')) {
      expect(m.note_required, `${m.from_key} → ${m.to_key}`).toBe(true);
      expect(m.admin_only, `${m.from_key} → ${m.to_key}`).toBe(true);
    }
  });

  it('names a job’s stage only when it is in progress', () => {
    const items = [{ subject_id: 'a', step_key: 'booked' }, { subject_id: 'b', step_key: 'scheduled' }];
    expect(jobStage({ id: 'a' }, items, WF.steps)).toBe('Booked');
    expect(jobStage({ id: 'b' }, items, WF.steps)).toBeNull();
    expect(jobStage({ id: 'c' }, items, WF.steps)).toBeNull();
  });
});
