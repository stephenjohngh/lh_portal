import { describe, it, expect } from 'vitest';
import { WORKFLOW_TABS, workflowLabel, workflowPlace, sortByLabel } from './workflowNaming.js';
import { SHIPPED_WORKFLOWS } from './shippedWorkflows.js';

describe('workflow names — App.Tab – name', () => {
  it('every shipped workflow says which tab its items are worked on (or that there is none)', () => {
    const missing = SHIPPED_WORKFLOWS.filter((w) => !(w.key in WORKFLOW_TABS)).map((w) => w.key);
    expect(missing).toEqual([]);
  });

  it('builds App.Tab – name from the app and tab, never from the stored name', () => {
    expect(workflowLabel({ key: 'parking_waiting_list', app_id: 'parking', name: 'Waiting list place' }))
      .toBe('Parking.Waiting list – Waiting list place');
    expect(workflowLabel({ key: 'works_schedule', app_id: 'building_assets', name: 'Works schedule' }))
      .toBe('Building Assets.Works – Works schedule');
  });

  it('a workflow with no single tab is App – name', () => {
    expect(workflowLabel({ key: 'complaint', app_id: 'complaints', name: 'Building safety complaint' }))
      .toBe('Complaints – Building safety complaint');
  });

  it('a Cases process is Cases – name: its tab is the process itself', () => {
    expect(workflowPlace({ key: 'case_permit', app_id: 'cases' })).toBe('Cases');
    expect(workflowLabel({ key: 'case_permit', app_id: 'cases', name: 'Permit to work' })).toBe('Cases – Permit to work');
  });

  it('sorts so one app’s workflows sit together', () => {
    const sorted = sortByLabel([
      { key: 'parking_waiting_list', app_id: 'parking', name: 'Waiting list place' },
      { key: 'complaint', app_id: 'complaints', name: 'Building safety complaint' },
      { key: 'parking_application', app_id: 'parking', name: 'Parking application' },
    ]).map((w) => w.key);
    expect(sorted).toEqual(['complaint', 'parking_application', 'parking_waiting_list']);
  });
});
