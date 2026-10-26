// @vitest-environment jsdom
//
// Admin → Workflows (migrations 247–249): edit a workflow's steps and moves;
// the database's checks are shown before saving; a workflow marked as needing
// a full review asks for the review when a change is saved; every change is
// listed in words.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { DEFAULT_APPLICATION_WORKFLOW as WF } from '#lib/apps/parking/utils/applicationWorkflow.js';

const h = vi.hoisted(() => ({ saved: /** @type {any[]} */ ([]), marked: false, changes: /** @type {any[]} */ ([]), app: 'parking', renamed: false,
  timerRuns: /** @type {any[]} */ ([]), ran: 0, publicOn: false, switched: /** @type {any[]} */ ([]),
  loads: 0, dueOn: '2000-01-01', retired: /** @type {any[]} */ ([]), deleted: /** @type {any[]} */ ([]) }));
vi.mock('#lib/utils/download.js', () => ({ downloadBlob: () => {} }));
vi.mock('#lib/workflow/workflowApi.js', () => ({
  setPublicStatus: async (key, on, review) => { h.switched.push({ key, on, review }); return { changed: true }; },
  listWorkflows: async () => [{ id: 'w1', key: WF.key, name: WF.name, app_id: h.app, description: WF.description }],
  // (a new Cases process is saved through saveWorkflow, below)
  retireWorkflow: async (key, retire, review) => { h.retired.push({ key, retire, review }); return { changed: true }; },
  deleteWorkflow: async (key, review) => { h.deleted.push({ key, review }); return { deleted: true }; },
  listDeletedWorkflows: async () => [],
  loadWorkflow: async () => (h.loads += 1, { fields: [], workflow: { id: 'w1', key: WF.key, name: WF.name, app_id: h.app, description: WF.description,
      updated_at: '2026-10-18T08:00:00Z', public_status: h.publicOn,
      review_required: h.marked, review_reason: h.marked ? 'Statutory — BSA s.93' : null },
    steps: WF.steps.map((s, i) => ({ ...s, position: i + 1, ...(h.renamed && i === 0 ? { name: 'Arrived' } : {}) })), moves: WF.moves.map((m) => ({ note_required: false, admin_only: false, action: null, ...m, ...(h.app !== 'parking' ? { action: null } : {}) })) }),
  saveWorkflow: async (w) => { h.saved.push(w); return 'w1'; },
  listChanges: async () => h.changes,
  listEvents: async () => ({ items: [{ id: 'i1', step_key: 'checking', due_on: h.dueOn }], events: [] }),
  listOverviewData: async () => ({ steps: [], items: [] }),
  listTimerRuns: async () => h.timerRuns ?? [],
  runTimers: async () => { h.ran = (h.ran ?? 0) + 1; return { moved: 2, failed: 0, failures: [] }; },
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
beforeEach(() => { cleanup(); h.saved.length = 0; h.marked = false; h.changes = []; h.app = 'parking'; h.renamed = false; h.timerRuns = []; h.ran = 0; h.publicOn = false; h.switched = []; h.loads = 0; h.dueOn = '2000-01-01'; h.retired = []; h.deleted = []; });

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

  it('a step can be given a deadline, said in words, and it is saved with the step; the non-working days are pointed to, not edited here', async () => {
    await opened();
    expect(screen.getByTestId('non-working-days-pointer').textContent).toMatch(/Non-working days/);
    expect(screen.queryByTestId('non-working-days')).toBeNull();
    await fireEvent.input(screen.getAllByLabelText('Deadline days')[1], { target: { value: '7' } });
    expect((await screen.findByTestId('workflow-deadlines')).textContent).toMatch(/Being checked:.*Within 7/);
    await fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0].steps.find((s) => s.key === 'checking')).toMatchObject({ deadline_days: 7 });
  });

  // Timers (migration 259): a move made by itself after N days in its step.
  it('a move can be set to happen by itself; it is saved with the move and said in the change', async () => {
    await opened();
    const timers = screen.getAllByLabelText(/made by itself after \(days\)/);
    await fireEvent.input(timers[2], { target: { value: '30' } });              // Decline
    await fireEvent.change(await screen.findByLabelText(/timer counts/), { target: { value: 'working' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0].moves[2]).toMatchObject({ timer_days: 30, timer_basis: 'working' });
  });

  it('lists what the timer runs did, and an admin can run them now', async () => {
    h.timerRuns = [{ id: 'r1', ran_at: '2026-10-18T03:15:00Z', moved: 1, failed: 1,
      failures: [{ label: 'CAS-2026-000003', move: 'Lapse', reason: 'Fill in "Why" first.' }] }];
    await opened();
    const box = await screen.findByTestId('workflow-timers');
    await waitFor(() => expect(box.textContent).toMatch(/1 moved, 1 could not be:.*CAS-2026-000003 — Lapse: Fill in "Why" first\./s));
    await fireEvent.click(screen.getByRole('button', { name: 'Run timers now' }));
    await waitFor(() => expect(h.ran).toBe(1));
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

  it('draws the workflow, redraws it as it is edited, and shows how it is being used when asked', async () => {
    await opened();
    const diagram = screen.getByTestId('workflow-diagram');
    expect(diagram.querySelectorAll('[data-testid="workflow-diagram-step"]')).toHaveLength(WF.steps.length);
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a step' }));
    await waitFor(() => expect(diagram.querySelectorAll('[data-testid="workflow-diagram-step"]')).toHaveLength(WF.steps.length + 1));
    await fireEvent.click(screen.getByLabelText('Show how it is being used'));
    await waitFor(() => expect(diagram.textContent).toMatch(/1 now/));
    expect(screen.getByText(/1 in all · 1 open · 1 overdue/)).toBeTruthy();
  });

  it('any process has fields: one added and a move made to need it are saved; only Cases asks "needed to open"', async () => {
    await opened();
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a field' }));
    await fireEvent.input(screen.getByLabelText('Field label'), { target: { value: 'Checked ID' } });
    expect(screen.queryByLabelText('Needed to open a case')).toBeNull();           // Parking is not opened with a form
    const first = WF.moves[0];
    await fireEvent.click(screen.getByLabelText(`${first.label} needs Checked ID`));
    expect(screen.queryByTestId('workflow-problem')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0].fields).toEqual([expect.objectContaining({ key: 'checked_id', label: 'Checked ID', type: 'text' })]);
    expect(h.saved[0].moves.find((m) => m.label === first.label).required_fields).toEqual(['checked_id']);
    cleanup();
    h.app = 'cases';
    await opened();
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a field' }));
    expect(screen.getByLabelText('Needed to open a case')).toBeTruthy();
  });

  it('a save says when the workflow was read, so one over somebody else’s is refused', async () => {
    await opened();
    await fireEvent.input(screen.getAllByLabelText('Step name')[0], { target: { value: 'Arrived' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(h.saved).toHaveLength(1));
    expect(h.saved[0].expectedUpdatedAt).toBe('2026-10-18T08:00:00Z');
  });

  it('a workflow that differs from the shipped one says how, and the shipped steps can be loaded back', async () => {
    h.renamed = true;
    await opened();
    const box = await screen.findByTestId('workflow-shipped');
    expect(box.textContent).toMatch(/Step “Received” renamed “Arrived”/);
    await fireEvent.click(screen.getByRole('button', { name: 'Load the shipped steps and moves' }));
    expect(screen.getAllByLabelText('Step name')[0]).toHaveValue('Received');
  });

  it('an app with fixed parts says so, and its fixed kinds cannot be changed here', async () => {
    h.app = 'complaints';
    await opened();
    expect(screen.getByTestId('workflow-contract').textContent).toMatch(/complaint statuses/);
    // The mock's steps are Parking's, which break Complaints' fixed parts: the save says why.
    expect((await screen.findByTestId('workflow-problem')).textContent).toMatch(/are fixed/);
  });

  // Migration 261: the public status page, off unless switched on.
  it('the public status page is off, says what the public would see, and is switched on by the button', async () => {
    await opened();
    const box = await screen.findByTestId('workflow-public');
    expect(box.textContent).toMatch(/Public status page — off/);
    expect(box.textContent).toContain('“Being checked”');
    await fireEvent.click(screen.getByRole('button', { name: 'Switch the public page on' }));
    await waitFor(() => expect(h.switched).toEqual([{ key: WF.key, on: true, review: null }]));
  });

  it('a workflow marked for review asks who reviewed it before switching', async () => {
    h.marked = true;
    await opened();
    const btn = await screen.findByRole('button', { name: 'Switch the public page on' });
    expect(btn.hasAttribute('disabled')).toBe(true);
    await fireEvent.input(screen.getByLabelText('Public status: reviewed by'), { target: { value: 'A Person' } });
    await fireEvent.input(screen.getByLabelText('Public status: reviewed against'), { target: { value: 'BSA s.93' } });
    await fireEvent.click(btn);
    await waitFor(() => expect(h.switched[0]).toMatchObject({ on: true, review: { reviewedBy: 'A Person', reviewedAgainst: 'BSA s.93' } }));
  });

  // ⚠ 2026-10-20: reading the workflow back after a save cleared the message,
  // so "Saved." (and every switch's confirmation) vanished as it appeared.
  it('a save says so, and the message survives the workflow being read back', async () => {
    await opened();
    await fireEvent.input(screen.getAllByLabelText('Step name')[0], { target: { value: 'Arrived' } });
    const before = h.loads;
    await fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(h.loads).toBeGreaterThan(before));
    expect((await screen.findByRole('status')).textContent).toBe('Saved.');
  });

  it('the usage figures are read again after a save, which re-dates the items (2026-10-20: they stayed stale)', async () => {
    h.dueOn = '2999-01-01';
    await opened();
    await fireEvent.click(screen.getByLabelText('Show how it is being used'));
    expect(await screen.findByText(/1 in all · 1 open · 0 overdue/)).toBeTruthy();
    h.dueOn = '2000-01-01';                       // the save's re-dating made it late
    await fireEvent.input(screen.getAllByLabelText('Step name')[0], { target: { value: 'Arrived' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    expect(await screen.findByText(/1 in all · 1 open · 1 overdue/)).toBeTruthy();
  });

  // Migration 265: a Cases process can be retired or deleted; an app's own cannot.
  it('a Cases process can be retired, and says so', async () => {
    h.app = 'cases';
    await opened();
    await fireEvent.click(await screen.findByRole('button', { name: 'Retire — no new cases' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Retire it' }));
    await waitFor(() => expect(h.retired).toEqual([{ key: WF.key, retire: true, review: null }]));
    expect((await screen.findByRole('status')).textContent).toMatch(/retired: no new cases/);
  });

  it('a Cases process can be deleted; a marked one asks for the review first', async () => {
    h.app = 'cases'; h.marked = true;
    await opened();
    await fireEvent.click(await screen.findByRole('button', { name: 'Delete process…' }));
    const go = await screen.findByRole('button', { name: 'Delete the process' });
    expect(go.hasAttribute('disabled')).toBe(true);
    await fireEvent.input(screen.getByLabelText(/^Reviewed by/), { target: { value: 'A Person' } });
    await fireEvent.input(screen.getByLabelText(/^Reviewed against/), { target: { value: 'The procedure' } });
    await fireEvent.click(go);
    await waitFor(() => expect(h.deleted[0]).toMatchObject({ key: WF.key, review: { reviewedBy: 'A Person', reviewedAgainst: 'The procedure' } }));
  });

  it('an app’s own workflow offers neither', async () => {
    await opened();
    expect(screen.queryByTestId('workflow-lifecycle')).toBeNull();
  });

  // ⚠ 2026-10-20 (the tutorial run): two new moves both started first step →
  // second step, and the diagram, keyed by that pair, threw and blanked the page.
  it('adding moves gives each a pair not yet used, and the diagram keeps drawing', async () => {
    await opened();
    const add = screen.getByRole('button', { name: '+ Add a move' });
    await fireEvent.click(add);
    await fireEvent.click(add);
    await fireEvent.click(add);
    const rows = [...screen.getByTestId('workflow-moves').querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(WF.moves.length + 3);
    const pairs = rows.map((r) => [...r.querySelectorAll('select')].slice(0, 2).map((x) => x.value).join('>'));
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(screen.getByRole('img', { name: /diagram/ })).toBeTruthy();
  });

  it('setting up a new Cases process says so, and the message stays once it is opened', async () => {
    await opened();
    await fireEvent.input(screen.getByLabelText('New process name'), { target: { value: 'Permit to work' } });
    await fireEvent.click(screen.getByRole('button', { name: '+ Set it up' }));
    await waitFor(() => expect(h.saved.some((w) => w.name === 'Permit to work')).toBe(true));
    expect((await screen.findByRole('status')).textContent).toMatch(/“Permit to work” set up/);
  });

  it('a process named by titles has no public page to switch', async () => {
    h.app = 'maintenance';
    await opened();
    expect(screen.queryByTestId('workflow-public')).toBeNull();
  });
});
