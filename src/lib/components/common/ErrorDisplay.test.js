// @vitest-environment jsdom
//
// src/lib/components/common/ErrorDisplay.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import ErrorDisplay from './ErrorDisplay.svelte';

beforeEach(() => cleanup());

describe('ErrorDisplay', () => {
  it('renders nothing when there is no message', () => {
    render(ErrorDisplay, { props: { message: '' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the message in an alert region', () => {
    render(ErrorDisplay, { props: { message: 'Something broke' } });
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Something broke');
  });

  it('shows a dismiss button only when onDismiss is provided, and calls it', async () => {
    const onDismiss = vi.fn();
    render(ErrorDisplay, { props: { message: 'X', onDismiss } });
    await fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('has no dismiss button without an onDismiss handler', () => {
    render(ErrorDisplay, { props: { message: 'X' } });
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });
});
