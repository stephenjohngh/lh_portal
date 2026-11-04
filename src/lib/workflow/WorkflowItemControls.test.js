// @vitest-environment jsdom
//
// The shared item controls: the form follows the saved values when they change
// under it (a move that clears fields, migration 282; a timer; somebody else).
// Left behind, it offers the old answers to be saved back and holds every move
// with "Save the fields first." Found on dev, 2026-11-04.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import WorkflowItemControls from './WorkflowItemControls.svelte';

vi.mock('./workflowApi.js', () => ({
  itemHistory: async () => [],
  setItemFields: async () => ({ fields: {}, changed: true }),
  timerDue: async () => null,
  listSignoffs: async () => [],
  giveSignoff: async () => {},
  withdrawSignoff: async () => {},
}));
vi.mock('./fieldLinks.js', () => ({ loadLinkOptions: async () => ({ component: [], space: [], person: [] }) }));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: () => {} }));
vi.mock('#lib/supabaseClient.js', () => ({ supabase: {} }));
vi.mock('#lib/stores/profiles.js', () => ({
  profiles: { subscribe: (/** @type {any} */ r) => { r({ loaded: true, list: [] }); return () => {}; } },
  profilesStore: { load: async () => {} },
}));

const steps = [{ key: 'check', name: 'Check', kind: 'start' }, { key: 'owner', name: 'Owner told', kind: 'open' }, { key: 'done', name: 'Done', kind: 'done' }];
const moves = [{ from_key: 'check', to_key: 'owner', label: 'Failed', clears_fields: ['evidence'] }, { from_key: 'owner', to_key: 'done', label: 'Finish', required_fields: ['evidence'] }];
const fields = [{ key: 'evidence', label: 'Evidence', type: 'text', position: 1 }, { key: 'keep', label: 'Keep', type: 'text', position: 2 }];
const props = (/** @type {any} */ item) => ({ item, steps, moves, fields, workflow: { id: 'w', key: 'k' }, reference: 'CAS-1', isAdmin: true, canEdit: true, me: 'me',
  onMove: async () => {}, onAssign: async () => {} });
const atCheck = { id: 'i1', step_key: 'check', assigned_to: null, fields: { evidence: 'First repair', keep: 'Stays' } };
const atOwner = { id: 'i1', step_key: 'owner', assigned_to: null, fields: { keep: 'Stays' } };

describe('WorkflowItemControls', () => {
  beforeEach(cleanup);

  it('says what a move will clear, naming only fields holding something', async () => {
    render(WorkflowItemControls, props(atCheck));
    expect((await screen.findByTestId('wf-move-clears')).textContent).toContain('Failed clears Evidence.');
  });

  it('the form empties when a move clears a field, and the next move asks for it', async () => {
    const { rerender } = render(WorkflowItemControls, props(atCheck));
    const box = /** @type {HTMLInputElement} */ (await screen.findByLabelText(/Evidence/));
    expect(box.value).toBe('First repair');
    await rerender({ item: atOwner });
    await waitFor(() => expect(/** @type {HTMLInputElement} */ (screen.getByLabelText(/Evidence/)).value).toBe(''));
    const finish = screen.getByRole('button', { name: 'Finish' });
    expect(finish.getAttribute('title')).toBe('Fill in "Evidence" first.');
  });

  it('keeps what the person has typed but not saved', async () => {
    const { rerender } = render(WorkflowItemControls, props(atCheck));
    await fireEvent.input(await screen.findByLabelText(/Keep/), { target: { value: 'Typed here' } });
    await rerender({ item: { ...atCheck, fields: { evidence: 'Changed elsewhere', keep: 'Stays' } } });
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText(/Keep/)).value).toBe('Typed here');
  });
});
