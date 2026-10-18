// A workflow as one file (roadmap §6): what a file holds, what is refused, and
// where an imported one goes.
import { describe, it, expect } from 'vitest';
import { workflowFile, workflowFileName, readWorkflowFile, importTarget, WORKFLOW_FILE_FORMAT } from './workflowTransfer.js';
import { definitionOf, workflowProblem } from './workflowModel.js';
import { DEFAULT_MAINTENANCE_JOB_WORKFLOW as JOB } from '#lib/apps/maintenance/utils/maintenanceJobWorkflow.js';

const def = definitionOf({ name: JOB.name, description: JOB.description, steps: JOB.steps, moves: JOB.moves, fields: [] });
const wf = { key: 'maintenance_job', app_id: 'maintenance', name: JOB.name };

describe('a workflow file', () => {
  it('holds the definition and nothing of this building’s', () => {
    const f = workflowFile(wf, def, '2026-10-18T12:00:00Z');
    expect(f).toMatchObject({ format: WORKFLOW_FILE_FORMAT, version: 1, key: 'maintenance_job', appId: 'maintenance' });
    expect(Object.keys(f).sort()).toEqual(['appId', 'definition', 'exportedAt', 'format', 'key', 'version']);
    expect(JSON.stringify(f)).not.toMatch(/subject_id|assigned_to|"by"|created_by|updated_by|"id"/);
  });

  it('reads back as the same definition, and that definition would save', () => {
    const back = readWorkflowFile(JSON.stringify(workflowFile(wf, def, 'x')));
    expect(back.definition).toEqual(def);
    expect(workflowProblem({ ...back.definition, appId: back.appId })).toBeNull();
  });

  it('is named by its key and the day', () => {
    expect(workflowFileName('case_fire watch!', '2026-10-18')).toBe('workflow_case_fire_watch__2026-10-18.json');
  });

  it('refuses what is not a workflow file, saying what is wrong', () => {
    expect(() => readWorkflowFile('not json')).toThrow(/not a workflow file/);
    expect(() => readWorkflowFile('{"format":"other"}')).toThrow(/not a workflow file exported from the portal/);
    expect(() => readWorkflowFile(JSON.stringify({ ...workflowFile(wf, def, 'x'), version: 9 }))).toThrow(/version 9/);
    expect(() => readWorkflowFile(JSON.stringify({ ...workflowFile(wf, def, 'x'), key: '' }))).toThrow(/incomplete/);
    const badStep = { ...def, steps: [...def.steps, { key: 'x' }] };
    expect(() => readWorkflowFile(JSON.stringify(workflowFile(wf, badStep, 'x')))).toThrow(/A step in that file/);
  });
});

describe('where an imported workflow goes', () => {
  const here = [{ key: 'maintenance_job', app_id: 'maintenance', name: 'Maintenance job' },
                { key: 'case_permit', app_id: 'cases', name: 'Permit to work' }];
  const file = (key, appId) => ({ key, appId, definition: { ...def, name: 'Imported' } });

  it('into the workflow with the same key, when it is the same app’s', () => {
    expect(importTarget(file('maintenance_job', 'maintenance'), here)).toEqual({ into: 'maintenance_job' });
    expect(importTarget(file('maintenance_job', 'cases'), here)).toHaveProperty('refused', expect.stringMatching(/another app/));
  });
  it('a Cases process not here yet is set up from it', () => {
    expect(importTarget(file('case_hot_work', 'cases'), here)).toEqual({ newCases: true });
  });
  it('another app’s workflow that is not here yet is refused: its app sets it up', () => {
    expect(importTarget(file('complaint', 'complaints'), here)).toHaveProperty('refused', expect.stringMatching(/open that app/));
  });
});
