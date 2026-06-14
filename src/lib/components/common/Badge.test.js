// @vitest-environment jsdom
//
// src/lib/components/common/Badge.test.js
// Badge's documented contract is "takes a Tailwind bg class" — so checking the
// colour class lands on the element is a behaviour assertion, not an internal.
// Slot content comes via Badge.harness.svelte (testing-library v5 has no `slots`).

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Badge from './Badge.harness.svelte';

beforeEach(() => cleanup());

describe('Badge', () => {
  it('renders its slot content', () => {
    render(Badge, { props: { text: 'OK', color: 'bg-green-600' } });
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('applies the supplied colour class', () => {
    render(Badge, { props: { text: 'Failed', color: 'bg-red-600' } });
    expect(screen.getByText('Failed')).toHaveClass('bg-red-600');
  });

  it('applies size classes (large)', () => {
    render(Badge, { props: { text: 'Big', color: 'bg-gray-600', size: 'large' } });
    expect(screen.getByText('Big')).toHaveClass('text-sm');
  });
});
