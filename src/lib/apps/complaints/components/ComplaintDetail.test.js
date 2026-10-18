// @vitest-environment jsdom
//
// The case screen on the workflow manager (migration 252): the buttons are the
// workflow's moves from where the complaint is, with their conditions and
// s.93's own reasons said before anything is pressed; who it is with and the
// deadline are the workflow item's.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { DEFAULT_COMPLAINT_WORKFLOW as W } from '../utils/complaintWorkflow.js';

// The item's controls are the shared ones (#lib/workflow/WorkflowItemControls),
// which read the item's history — who made the last move — themselves.
const h = vi.hoisted(() => ({ hist: /** @type {any[]} */ ([]), assigned: /** @type {any[]} */ ([]), moved: /** @type {any[]} */ ([]) }));
vi.mock('#lib/workflow/workflowApi.js', () => ({ itemHistory: async () => h.hist, setItemFields: async () => ({ fields: {}, changed: true }) }));
vi.mock('#lib/workflow/fieldLinks.js', () => ({ loadLinkOptions: async () => ({ component: [], space: [], person: [] }) }));

vi.mock('#lib/supabaseClient.js', () => ({ supabase: {} }));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: vi.fn() }));
const ComplaintDetail = (await import('./ComplaintDetail.svelte')).default;

const complaint = (status, extra = {}) => ({
  id: 'c1', reference: 'CMP-2026-000001', status, subject: 'Fire door', description: 'It does not close',
  in_scope: true, complainant_contact: 'a@x.co', received_at: '2026-10-17T09:00:00Z', channel: 'email', response_text: '', ...extra,
});
const item = (step, extra = {}) => ({ id: 'i1', subject_id: 'c1', step_key: step, assigned_to: null, due_on: null, ...extra });
const base = { steps: W.steps, wfMoves: W.moves, canEdit: true, me: 'me', nameById: { me: 'Pat Smith', u2: 'Sam Lee' },
  assignees: [{ id: 'me', full_name: 'Pat Smith' }, { id: 'u2', full_name: 'Sam Lee' }],
  onMove: async (/** @type {any} */ m, /** @type {string} */ note) => { h.moved.push([m.to_key, note]); },
  onAssign: async (/** @type {string|null} */ uid) => { h.assigned.push(uid); return { changed: true }; } };

beforeEach(() => { cleanup(); h.hist = []; h.assigned.length = 0; h.moved.length = 0; });

describe('ComplaintDetail on the workflow', () => {
  it('offers the workflow’s moves from its step, by their button labels', () => {
    render(ComplaintDetail, { ...base, complaint: complaint('received'), item: item('received') });
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Withdrawn' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Respond' })).toBeNull();
  });

  it('closing is an administrator’s move: hidden from others, offered to an admin', () => {
    render(ComplaintDetail, { ...base, complaint: complaint('responded', { responded_at: '2026-10-18T09:00:00Z', response_text: 'Done' }), item: item('responded') });
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    cleanup();
    render(ComplaintDetail, { ...base, isAdmin: true, complaint: complaint('responded', { responded_at: '2026-10-18T09:00:00Z', response_text: 'Done' }), item: item('responded') });
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('a reopen is offered on a closed complaint, and waits for a note', async () => {
    render(ComplaintDetail, { ...base, complaint: complaint('closed', { responded_at: '2026-10-18T09:00:00Z', response_text: 'Done' }), item: item('closed') });
    const reopen = screen.getByRole('button', { name: 'Reopen' });
    expect(reopen.hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByTestId('wf-move-refusal').map((p) => p.textContent).join(' ')).toMatch(/Reopen: Add a note/);
    await fireEvent.input(screen.getAllByRole('textbox')[1], { target: { value: 'They wrote back' } });
    expect(screen.getByRole('button', { name: 'Reopen' }).hasAttribute('disabled')).toBe(false);
  });

  it('s.93’s own reason still shows: no response, no Respond', () => {
    render(ComplaintDetail, { ...base, complaint: complaint('investigating'), item: item('investigating') });
    expect(screen.getByRole('button', { name: 'Respond' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByTestId('wf-move-refusal').map((p) => p.textContent).join(' ')).toMatch(/Respond: Write the response first/);
  });

  it('a four-eyes move set in Admin is held back for the person who made the last move', async () => {
    h.hist = [{ id: 1, kind: 'move', from_key: null, to_key: 'received', by: 'me', at: '2026-10-17T09:00:00Z' }];
    const moves = W.moves.map((m) => (m.from_key === 'received' && m.to_key === 'acknowledged' ? { ...m, four_eyes: true } : m));
    render(ComplaintDetail, { ...base, wfMoves: moves, complaint: complaint('received'), item: item('received') });
    await vi.waitFor(() => expect(screen.getAllByTestId('wf-move-refusal').map((p) => p.textContent).join(' '))
      .toMatch(/Acknowledge: Someone other than the person who made the last move/));
    expect(screen.getByRole('button', { name: 'Acknowledge' }).hasAttribute('disabled')).toBe(true);
  });

  it('who it is with, and the deadline, come from the workflow item; Take it gives it to me', async () => {
    render(ComplaintDetail, { ...base, complaint: complaint('received'), item: item('received', { assigned_to: 'u2', due_on: '2000-01-03' }) });
    expect(screen.getByLabelText('Who it is with')).toHaveValue('u2');
    expect(screen.getByTestId('wf-due').textContent).toMatch(/overdue/);
    await fireEvent.click(screen.getByRole('button', { name: 'Take it' }));
    expect(h.assigned).toEqual(['me']);
  });

  it('before the workflow is set up, it says so and offers no moves', () => {
    render(ComplaintDetail, { ...base, complaint: complaint('received'), item: null });
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    expect(screen.getByText(/Not yet in its workflow/)).toBeTruthy();
  });

  it('a move is asked first, then made through the app with its note', async () => {
    render(ComplaintDetail, { ...base, complaint: complaint('received'), item: item('received') });
    await fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(h.moved).toEqual([]);                                   // not before it is confirmed
    await fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await vi.waitFor(() => expect(h.moved).toEqual([['acknowledged', '']]));
    expect(await screen.findByRole('status')).toHaveTextContent('CMP-2026-000001: Acknowledge — now Acknowledged.');
  });
});
