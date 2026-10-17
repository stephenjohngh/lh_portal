// @vitest-environment jsdom
//
// Parking → Applications (migration 247): online applications moved through
// their workflow.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { DEFAULT_APPLICATION_WORKFLOW as WF } from '../utils/applicationWorkflow.js';

const h = vi.hoisted(() => {
  const makeStore = (init) => { let v = init; const subs = new Set();
    return { subscribe: (r) => { r(v); subs.add(r); return () => subs.delete(r); }, set: (n) => { v = n; subs.forEach((r) => r(v)); }, get: () => v }; };
  return { req: makeStore({}), perms: makeStore({ isAdmin: false, canModify: true }), moved: /** @type {any[]} */ ([]),
    parkingLoads: 0, setUp: 0, action: /** @type {string|null} */ (null) };
});
vi.mock('../stores/requestStore.js', () => ({ requestStore: {
  subscribe: h.req.subscribe,
  load: async () => {},
  setUpWorkflow: async () => { h.setUp += 1; },
  history: async () => [{ id: 1, from_key: null, to_key: 'received', note: 'Received from the online form', at: '2026-10-17T09:00:00Z' }],
  move: async (r, to, note) => { h.moved.push([r.reference, to, note]); return { step: to, action: h.action }; },
} }));
vi.mock('../stores/parkingStore.js', () => ({ parkingStore: { load: async () => { h.parkingLoads += 1; } } }));
vi.mock('#lib/workflow/workflowApi.js', () => ({ listEvents: async () => ({ items: [], events: [
  { item_id: 'ia', from_key: null, to_key: 'received', at: '2026-10-17T09:00:00Z' }] }) }));
vi.mock('#lib/stores/permissions.js', () => ({ permissions: { subscribe: h.perms.subscribe } }));

const ApplicationsTab = (await import('./ApplicationsTab.svelte')).default;

const REQ = (id, ref, step, due_on = null) => ({ request: { id, reference: ref, display_name: `Person ${id}`, email: `${id}@x.co`, holder_type: 'leaseholder',
  wanted_size: 'Car', received_at: '2026-10-17T09:00:00Z', privacy_notice_text: 'notice' }, item: { id: `i${id}`, subject_id: id, step_key: step, due_on } });
function state(list) {
  return { workflow: { id: 'w1' }, steps: WF.steps, moves: WF.moves, requests: list.map((x) => x.request), items: list.map((x) => x.item),
    loading: false, loaded: true, error: null };
}

beforeEach(() => { cleanup(); h.moved.length = 0; h.parkingLoads = 0; h.setUp = 0; h.action = null; h.perms.set({ isAdmin: false, canModify: true }); });

describe('Parking → Applications', () => {
  it('lists the open applications with their step; finished ones are behind the filter', async () => {
    h.req.set(state([REQ('a', 'PKR-2026-000001', 'received'), REQ('b', 'PKR-2026-000002', 'declined')]));
    render(ApplicationsTab, { canEdit: true });
    const list = await screen.findByTestId('application-list');
    expect(list.textContent).toMatch(/PKR-2026-000001/);
    expect(list.textContent).toMatch(/Received/);
    expect(list.textContent).not.toMatch(/PKR-2026-000002/);
  });

  it('offers the moves from its step; one needing a note waits for it; accepting re-reads the waiting list', async () => {
    h.req.set(state([REQ('a', 'PKR-2026-000001', 'checking')]));
    render(ApplicationsTab, { canEdit: true });
    await fireEvent.click(await screen.findByText('PKR-2026-000001'));
    const panel = await screen.findByTestId('application-panel');
    expect(panel.textContent).toMatch(/a@x\.co/);
    const decline = screen.getByRole('button', { name: 'Decline' });
    expect(decline.hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Start checking' })).toBeNull();   // not from this step
    h.action = 'parking_add_to_waiting_list';
    await fireEvent.click(screen.getByRole('button', { name: 'Accept onto the waiting list' }));
    await waitFor(() => expect(h.moved).toEqual([['PKR-2026-000001', 'waiting_list', '']]));
    expect(h.parkingLoads).toBe(1);
    expect(await screen.findByTestId('application-history')).toBeTruthy();
  });

  it('a person who cannot edit Parking gets no moves', async () => {
    h.perms.set({ isAdmin: false, canModify: false });
    h.req.set(state([REQ('a', 'PKR-2026-000001', 'checking')]));
    render(ApplicationsTab, { canEdit: false });
    await fireEvent.click(await screen.findByText('PKR-2026-000001'));
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
  });

  it('with no workflow yet, an admin opening the tab sets it up', async () => {
    h.perms.set({ isAdmin: true, canModify: true });
    h.req.set({ ...state([]), workflow: null });
    render(ApplicationsTab, { canEdit: true });
    await waitFor(() => expect(h.setUp).toBe(1));
  });

  it('shows how each open application stands against its step’s deadline', async () => {
    h.req.set(state([REQ('a', 'PKR-2026-000001', 'received', '2000-01-03'), REQ('b', 'PKR-2026-000002', 'checking')]));
    render(ApplicationsTab, { canEdit: true });
    const due = await screen.findAllByTestId('application-due');
    expect(due[0].textContent).toMatch(/days overdue/);
    expect(due[1].textContent.trim()).toBe('');
  });

  it('the process can be shown, drawn from the workflow, with how many are in each step', async () => {
    h.req.set(state([REQ('a', 'PKR-2026-000001', 'checking', '2000-01-03')]));
    render(ApplicationsTab, { canEdit: true });
    await fireEvent.click(await screen.findByText('Show the process'));
    const diagram = await screen.findByTestId('workflow-diagram');
    expect(diagram.querySelectorAll('[data-testid="workflow-diagram-step"]')).toHaveLength(5);
    await waitFor(() => expect(diagram.textContent).toMatch(/1 now/));
  });
});
