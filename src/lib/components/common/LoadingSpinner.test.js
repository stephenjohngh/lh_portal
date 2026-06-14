// @vitest-environment jsdom
//
// src/lib/components/common/LoadingSpinner.test.js

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import LoadingSpinner from './LoadingSpinner.svelte';

beforeEach(() => cleanup());

describe('LoadingSpinner', () => {
  it('exposes a polite status region with a default label', () => {
    render(LoadingSpinner, { props: {} });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Loading...');
  });

  it('uses the provided text as the accessible label and renders it', () => {
    render(LoadingSpinner, { props: { text: 'Loading inspections' } });
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading inspections');
    expect(screen.getByText('Loading inspections')).toBeInTheDocument();
  });
});
