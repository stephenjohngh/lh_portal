// @vitest-environment jsdom
//
// src/lib/components/common/ConfirmDialog.test.js
// Behaviour: visibility, confirm/cancel dispatch, Escape → cancel, and the
// processing state (buttons disabled + "Processing..." label).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import ConfirmDialog from './ConfirmDialog.svelte';

beforeEach(() => cleanup());

describe('ConfirmDialog', () => {
  it('renders nothing when show is false', () => {
    render(ConfirmDialog, { props: { show: false } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and message when shown', () => {
    render(ConfirmDialog, { props: { show: true, title: 'Delete?', message: 'This cannot be undone.' } });
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('dispatches confirm and cancel from the action buttons', async () => {
    const onConfirm = vi.fn(), onCancel = vi.fn();
    render(ConfirmDialog, {
      props: { show: true, confirmText: 'Delete', cancelText: 'Keep' },
      events: { confirm: onConfirm, cancel: onCancel },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('dispatches cancel on Escape', async () => {
    const onCancel = vi.fn();
    render(ConfirmDialog, { props: { show: true }, events: { cancel: onCancel } });
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables the buttons and shows "Processing..." while processing', () => {
    render(ConfirmDialog, { props: { show: true, processing: true, confirmText: 'Delete' } });
    const confirm = screen.getByRole('button', { name: 'Processing...' });
    expect(confirm).toBeDisabled();
  });
});
