// @vitest-environment jsdom
//
// One dialog for adding and for editing an action (2026-10-30). Editing used to
// be a form opened in place on the row; every edit in Management is a dialog now.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

vi.mock('#lib/stores/permissions', async () => {
  const { writable } = await import('svelte/store');
  return { permissions: writable({ isAdmin: false, canModify: true }) };
});

import ActionForm from './ActionForm.svelte';

const action = { id: 'a1', action_text: 'Get two quotes', name_text: 'SP', date_deadline: '2026-11-04', status: 'in-progress',
                 created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z' };
const options = [{ value: 'SP', label: 'SP' }, { value: '', label: '—' }];

function form(props) {
  const sent = [];
  const events = { submit: (e) => sent.push(['submit', e.detail]), update: (e) => sent.push(['update', e.detail]),
                   cancel: () => sent.push(['cancel']) };
  render(ActionForm, { props: { show: true, assigneeOptions: options, ...props }, events });
  return sent;
}

describe('ActionForm', () => {
  it('adds: titled New Action, empty, sends submit', async () => {
    const sent = form({});
    expect(screen.getByText('New Action')).toBeTruthy();
    await fireEvent.input(screen.getByLabelText(/Action Description/), { target: { value: 'Book the lift engineer' } });
    await fireEvent.click(screen.getByRole('button', { name: /Add Action/ }));
    expect(sent[0][0]).toBe('submit');
    expect(sent[0][1].action_text).toBe('Book the lift engineer');
  });

  it('edits: titled Edit Action, filled with the action, sends update with its id', async () => {
    const sent = form({ action });
    expect(screen.getByText('Edit Action')).toBeTruthy();
    expect(screen.getByLabelText(/Action Description/).value).toBe('Get two quotes');
    await fireEvent.input(screen.getByLabelText(/Action Description/), { target: { value: 'Get three quotes' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(sent[0][0]).toBe('update');
    expect(sent[0][1]).toMatchObject({ id: 'a1', action_text: 'Get three quotes', status: 'in-progress' });
  });

  it('offers Close, not Cancel, when editing, and shows a failed save inside the dialog', () => {
    form({ action, error: 'Failed to update action' });
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.getByText('Failed to update action')).toBeTruthy();
  });
});
