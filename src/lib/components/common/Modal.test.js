// @vitest-environment jsdom
//
// src/lib/components/common/Modal.test.js
// Behaviour: visible only when show=true; close button, Escape, and backdrop
// click all dispatch 'close'.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import Modal from './Modal.svelte';

beforeEach(() => cleanup());

describe('Modal', () => {
  it('renders nothing when show is false', () => {
    render(Modal, { props: { show: false, title: 'Hidden' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog with its title when show is true', () => {
    render(Modal, { props: { show: true, title: 'My Modal' } });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('My Modal')).toBeInTheDocument();
  });

  it('dispatches close when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(Modal, { props: { show: true, title: 'X' }, events: { close: onClose } });
    await fireEvent.click(screen.getByRole('button', { name: /close modal/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dispatches close on Escape', async () => {
    const onClose = vi.fn();
    render(Modal, { props: { show: true, title: 'X' }, events: { close: onClose } });
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('dispatches close when the backdrop (the dialog container) is clicked', async () => {
    const onClose = vi.fn();
    render(Modal, { props: { show: true, title: 'X' }, events: { close: onClose } });
    await fireEvent.click(screen.getByRole('dialog'));   // target === currentTarget
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the close button when showClose is false', () => {
    render(Modal, { props: { show: true, title: 'X', showClose: false } });
    expect(screen.queryByRole('button', { name: /close modal/i })).not.toBeInTheDocument();
  });
});
