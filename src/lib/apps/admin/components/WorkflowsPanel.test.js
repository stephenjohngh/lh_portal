// @vitest-environment jsdom
//
// Admin → Workflows (migrations 247–249): edit a workflow's steps and moves;
// the database's checks are shown before saving; a workflow marked as needing
// a full review asks for the review when a change is saved; every change is
// listed in words.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { DEFAULT_APPLICATION_WORKFLOW as WF } from '#lib/apps/parking/utils/applicationWorkflow.js';

const h = vi.hoisted(() => ({ saved: /** @type {any[]} */ ([]), marked: false, changes: /** @type {any[]} */ ([]) }));
vi.mock('#lib/workflow/workflowApi.js', () => ({
  listWorkflows: async () => [{ id: 'w1', key: WF.key, name: WF.name, app_id: 'parking', description: WF.description }],
  loadWorkflow: async () => ({ workflow: { id: 'w1', key: WF.key, name: WF.name, app_id: 'parking', description: WF.description,
      review_required: h.marked, review_reason: h.marked ? 'Statutory — BSA s.93' : null },
    steps: WF.steps.map((s, i) => ({ ...s, position: i + 1 })), moves: WF.moves.map((m) => ({ note_required: false, admin_only: false, action: null, ...m })) }),
  saveWorkflow: async (w) => { h.saved.push(w); return 'w1'; },
  listChanges: async () => h.changes,
}));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: () => {} }));
vi.mock('#lib/stores/profiles.js', () => ({
  profiles: { subscribe: (run) => { run({ list: [{ id: 'u1', full_name: 'Admin Person' }] }); return () => {}; } },
  profilesStore: { load: async () => {} },
}));
vi.mock('#lib/workflow/nonWorkingDays.js', () => ({
  ensureNonWorkingDays: async () => 0, addNonWorkingDay: async () => {}, removeNonWorkingDay: async () => {},
  listNonWorkingDays: async () => [{ day: '2026-12-25', name: 'Christmas Day' }],
}));

const WorkflowsPanel = (await import('./WorkflowsPanel.svelte')).default;
beforeEach(() => { cleanup(); h.saved.length = 0; h.marked = false; h.changes = []; });

async function opened() {
  render(WorkflowsPanel);
  const steps = await screen.findByTestId('workflow-steps');
  await waitFor(() => expect(steps.querySelectorAll('tbody tr')).toHaveLength(WF.steps.length));
}

describe('Admin → Workflows', () => {
  it('shows the steps and moves of the workflow, and Save waits for a change', async () => {
    await opened();
    expect(screen.getByTestId('workflow-moves').querySelectorAll('tbody tr')).toHaveLength(WF.moves.length);
    expect(screen.getByRole('button', { name: 'Save workflow' }).hasAttribute('disabled')).toBe(true);
  });

  it('a change that breaks it says why and cannot be saved; putting it right saves it whole', async () => {
    await opened();
    const kinds = screen.getAllByLabelText('Kind');
    await fireEvent.change(kinds[1], { target: { value: 'start' } });          // two starts
    expect((await screen.findByTestId('workflow-problem')).textContent).toMatch(/exactly one start/);
    expect(screen.getByRole('button', { name: 'Save workflow' }).hasAttribute('disabled')).toBe(true);
    await fireEvent.change(kinds[1], { target: { value: 'open' } });
    await waitFor(() => expect(screen.queryByTestId('workflow-problem')).toBeNull());
    await fireEvent.input(screen.getAllByLabelText('Step name')[0], { target: { value: 'Arrived' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0]).toMatchObject({ key: WF.key, appId: 'parking', review: null });
    expect(h.saved[0].steps.map((s) => s.key)).toEqual(WF.steps.map((s) => s.key));
    expect(h.saved[0].steps[0]).not.toHaveProperty('isNew');
  });

  it('a step can be given a deadline, said in words, and it is saved with the step; the non-working days are listed', async () => {
    await opened();
    expect(screen.getByTestId('non-working-days').textContent).toMatch(/Christmas Day/);
    await fireEvent.input(screen.getAllByLabelText('Deadline days')[1], { target: { value: '7' } });
    expect((await screen.findByTestId('workflow-deadlines')).textContent).toMatch(/Being checked:.*Within 7/);
    await fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0].steps.find((s) => s.key === 'checking')).toMatchObject({ deadline_days: 7 });
  });

  it('marking needs a reason, and is saved with the workflow', async () => {
    await opened();
    await fireEvent.click(screen.getByLabelText('Needs a full review before any change'));
    expect((await screen.findByTestId('workflow-problem')).textContent).toMatch(/Say why/);
    await fireEvent.input(screen.getByLabelText('Why it needs a review'), { target: { value: 'Statutory — BSA s.93' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0]).toMatchObject({ reviewRequired: true, reviewReason: 'Statutory — BSA s.93', review: null });
  });

  it('⛔ a change to a marked workflow asks who reviewed it and against what, and sends the review with the save', async () => {
    h.marked = true;
    await opened();
    expect(screen.getByTestId('workflow-review-mark').textContent).toMatch(/must not be changed without a full review: Statutory — BSA s\.93/);
    await fireEvent.input(screen.getAllByLabelText('Step name')[0], { target: { value: 'Arrived' } });
    await fireEvent.click(screen.getByRole('button', { name: /record the review/ }));
    const form = await screen.findByTestId('workflow-review-form');
    expect(form.textContent).toMatch(/Step “Received” renamed “Arrived”/);
    const saveIt = screen.getByRole('button', { name: 'Save the change' });
    expect(saveIt.hasAttribute('disabled')).toBe(true);
    expect(h.saved).toEqual([]);
    await fireEvent.input(screen.getByLabelText(/Reviewed by/), { target: { value: 'Pat Smith' } });
    await fireEvent.input(screen.getByLabelText(/Reviewed against/), { target: { value: 'BSA 2022 s.93' } });
    await fireEvent.click(saveIt);
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0].review).toMatchObject({ reviewedBy: 'Pat Smith', reviewedAgainst: 'BSA 2022 s.93' });
  });

  it('lists every change in words, with its review', async () => {
    const before = { name: WF.name, description: null, review_required: false, review_reason: null,
      steps: [{ key: 'received', name: 'Received', public_name: null, kind: 'start', deadline_days: null, deadline_basis: 'calendar', deadline_from: 'entered' }], moves: [] };
    h.changes = [{ id: 2, changed_at: '2026-10-17T10:00:00Z', changed_by: 'u1', reviewed_by: 'Pat Smith', reviewed_against: 'BSA 2022 s.93', review_note: 'rename',
      before, after: { ...before, steps: [{ ...before.steps[0], name: 'Arrived' }] } }];
    await opened();
    const hist = screen.getByTestId('workflow-history');
    expect(hist.textContent).toMatch(/Admin Person/);
    expect(hist.textContent).toMatch(/Reviewed by Pat Smith, against BSA 2022 s\.93 — rename/);
    expect(hist.textContent).toMatch(/Step “Received” renamed “Arrived”/);
  });
});
