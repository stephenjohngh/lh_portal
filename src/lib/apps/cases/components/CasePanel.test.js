// @vitest-environment jsdom
//
// A case on its process (migration 253): the buttons are the process's moves
// from where the case is, and a move that needs a field filled says so —
// naming the field — before anything is pressed. The database refuses the
// same move; this is the screen saying no first.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';

vi.mock('../stores/casesStore.js', () => ({
  casesStore: { subscribe: (/** @type {any} */ f) => { f({}); return () => {}; },
    history: vi.fn(async () => []), move: vi.fn(async () => ({ step: 'approved' })), assign: vi.fn(), save: vi.fn(), remove: vi.fn() },
}));
vi.mock('#lib/supabaseClient.js', () => ({ supabase: {} }));
const wf = vi.hoisted(() => ({ sent: /** @type {any[]} */ ([]) }));
vi.mock('#lib/workflow/workflowApi.js', () => ({ itemHistory: async () => [],
  setItemFields: async (/** @type {string} */ id, /** @type {any} */ changes) => { wf.sent.push([id, changes]); return { fields: changes, changed: true }; } }));
vi.mock('#lib/workflow/fieldLinks.js', () => ({ loadLinkOptions: async () => ({ component: [], space: [], person: [] }) }));

vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: vi.fn() }));
vi.mock('#lib/utils/documentApi.js', () => ({ listDocuments: vi.fn(async () => []), uploadDocument: vi.fn(), deleteDocument: vi.fn(), updateDocument: vi.fn() }));
vi.mock('#lib/stores/portalSettings.js', () => ({
  portalSettings: { subscribe: (/** @type {(v: object) => void} */ fn) => { fn({}); return () => {}; } },
}));

const { default: CasePanel } = await import('./CasePanel.svelte');

const steps = [{ key: 'open', name: 'Open', kind: 'start' }, { key: 'approved', name: 'Approved', kind: 'done' }];
const moves = [{ from_key: 'open', to_key: 'approved', label: 'Approve', note_required: false, admin_only: false,
  who: 'anyone', four_eyes: false, action: null, required_fields: ['where'] }];
const fields = [{ key: 'where', label: 'Where', type: 'text', position: 0 }];
const base = { workflow: { id: 'w1', key: 'case_change', name: 'Change control' }, steps, moves, fields,
  item: { id: 'i1', subject_id: 'c1', step_key: 'open', assigned_to: null, due_on: null },
  canEdit: true, me: 'u1', nameById: {}, assignees: [] };
const kase = { id: 'c1', reference: 'CAS-2026-000001', title: 'Boiler', description: '', created_at: '2026-10-18T09:00:00Z' };
/** The case with its item's field values (migration 254: the values are the item's). */
const withValues = (/** @type {Record<string, any>} */ values) => ({ ...base, c: kase, item: { ...base.item, fields: values } });

beforeEach(() => cleanup());

describe('CasePanel', () => {
  it('a move that needs a field is held, and names the field', () => {
    render(CasePanel, withValues({}));
    const approve = /** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Approve' }));
    expect(approve.disabled).toBe(true);
    expect(screen.getByTestId('wf-move-refusal').textContent).toBe('Approve: Fill in "Where" first.');
  });

  it('with the field filled, the move is offered', () => {
    render(CasePanel, withValues({ where: 'Riser 3' }));
    const approve = /** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Approve' }));
    expect(approve.disabled).toBe(false);
    expect(screen.queryByTestId('wf-move-refusal')).toBeNull();
  });

  it('a move made says the step reached, not only the button pressed', async () => {
    render(CasePanel, withValues({ where: 'Riser 3' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('status')).toHaveTextContent('CAS-2026-000001: Approve — now Approved.');
  });

  it('a field typed and not saved holds the moves; Save fields sends only the change', async () => {
    wf.sent.length = 0;
    render(CasePanel, withValues({}));
    await fireEvent.input(screen.getByLabelText('Where'), { target: { value: ' Riser 3 ' } });
    expect(screen.getByTestId('wf-move-refusal').textContent).toBe('Approve: Save the fields first.');
    await fireEvent.click(screen.getByRole('button', { name: 'Save fields' }));
    await vi.waitFor(() => expect(wf.sent).toEqual([['i1', { where: 'Riser 3' }]]));
  });
});
