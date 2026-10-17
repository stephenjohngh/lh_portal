// @vitest-environment jsdom
//
// Admin → Workflows (migration 247): edit a workflow's steps and moves; the
// database's checks are shown before saving.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { DEFAULT_APPLICATION_WORKFLOW as WF } from '#lib/apps/parking/utils/applicationWorkflow.js';

const h = vi.hoisted(() => ({ saved: /** @type {any[]} */ ([]) }));
vi.mock('#lib/workflow/workflowApi.js', () => ({
  listWorkflows: async () => [{ id: 'w1', key: WF.key, name: WF.name, app_id: 'parking', description: WF.description }],
  loadWorkflow: async () => ({ workflow: { id: 'w1', key: WF.key, name: WF.name, app_id: 'parking', description: WF.description },
    steps: WF.steps.map((s, i) => ({ ...s, position: i + 1 })), moves: WF.moves.map((m) => ({ note_required: false, admin_only: false, action: null, ...m })) }),
  saveWorkflow: async (w) => { h.saved.push(w); return 'w1'; },
}));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: () => {} }));
vi.mock('#lib/workflow/nonWorkingDays.js', () => ({
  ensureNonWorkingDays: async () => 0, addNonWorkingDay: async () => {}, removeNonWorkingDay: async () => {},
  listNonWorkingDays: async () => [{ day: '2026-12-25', name: 'Christmas Day' }],
}));

const WorkflowsPanel = (await import('./WorkflowsPanel.svelte')).default;
beforeEach(() => { cleanup(); h.saved.length = 0; });

describe('Admin → Workflows', () => {
  it('shows the steps and moves of the workflow', async () => {
    render(WorkflowsPanel);
    const steps = await screen.findByTestId('workflow-steps');
    await waitFor(() => expect(steps.querySelectorAll('tbody tr')).toHaveLength(WF.steps.length));
    expect(screen.getByTestId('workflow-moves').querySelectorAll('tbody tr')).toHaveLength(WF.moves.length);
  });

  it('a change that breaks it says why and cannot be saved; putting it right saves it whole', async () => {
    render(WorkflowsPanel);
    const steps = await screen.findByTestId('workflow-steps');
    await waitFor(() => expect(steps.querySelectorAll('tbody tr')).toHaveLength(WF.steps.length));
    const kinds = screen.getAllByLabelText('Kind');
    await fireEvent.change(kinds[1], { target: { value: 'start' } });          // two starts
    expect((await screen.findByTestId('workflow-problem')).textContent).toMatch(/exactly one start/);
    expect(screen.getByRole('button', { name: 'Save workflow' }).hasAttribute('disabled')).toBe(true);
    await fireEvent.change(kinds[1], { target: { value: 'open' } });
    await waitFor(() => expect(screen.queryByTestId('workflow-problem')).toBeNull());
    await fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0]).toMatchObject({ key: WF.key, appId: 'parking' });
    expect(h.saved[0].steps.map((s) => s.key)).toEqual(WF.steps.map((s) => s.key));
    expect(h.saved[0].steps[0]).not.toHaveProperty('isNew');
  });

  it('a step can be given a deadline, said in words, and it is saved with the step; the non-working days are listed', async () => {
    render(WorkflowsPanel);
    const steps = await screen.findByTestId('workflow-steps');
    await waitFor(() => expect(steps.querySelectorAll('tbody tr')).toHaveLength(WF.steps.length));
    expect(screen.getByTestId('non-working-days').textContent).toMatch(/Christmas Day/);
    await fireEvent.input(screen.getAllByLabelText('Deadline days')[1], { target: { value: '7' } });
    expect((await screen.findByTestId('workflow-deadlines')).textContent).toMatch(/Being checked:.*Within 7/);
    await fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0].steps.find((s) => s.key === 'checking')).toMatchObject({ deadline_days: 7 });
  });
});
