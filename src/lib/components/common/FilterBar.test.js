// @vitest-environment jsdom
//
// src/lib/components/common/FilterBar.test.js
//
// TYPE-2 test for the shared filter bar. It is data-driven — a caller adds a
// facet by adding a field, not by adding markup — so what has to hold is that
// the declared fields become real controls, that a selection reaches the bound
// object, and that Clear empties everything including the search.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';

const FilterBar = (await import('./FilterBar.svelte')).default;

const FIELDS = [
  { key: 'status', label: 'Status', placeholder: 'All statuses', noun: 'statuses',
    options: [
      { value: 'not_covered', label: 'Not covered (79)', short: 'Not covered' },
      { value: 'scheduled',   label: 'Scheduled here (0)', short: 'Scheduled here' },
    ] },
  { key: 'basis', label: 'Source', placeholder: 'Any source', noun: 'sources',
    options: [{ value: 'statute', label: 'Legislation' }] },
];

beforeEach(() => { cleanup(); vi.clearAllMocks(); });

describe('FilterBar', () => {
  it('renders a control per declared field, with its placeholder', () => {
    render(FilterBar, { fields: FIELDS, values: {}, query: '' });
    expect(screen.getByText('All statuses')).toBeInTheDocument();
    expect(screen.getByText('Any source')).toBeInTheDocument();
  });

  it('works from an empty values object — the caller need not seed each key', async () => {
    // Asserted through behaviour: if the bar did not give each field its own
    // Set, selecting an option would throw rather than register.
    render(FilterBar, { fields: FIELDS, values: {}, query: '' });
    await fireEvent.click(screen.getByText('All statuses'));
    await fireEvent.click(screen.getByText('Not covered (79)'));

    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('recomputes what is active when a selection changes', async () => {
    // The regression this pins: reading `values` through a helper function
    // hides it from Svelte's dependency tracking, so the pills and the Clear
    // button never updated. Nothing about the markup looks wrong.
    render(FilterBar, { fields: FIELDS, values: {}, query: '' });
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByText('All statuses'));
    await fireEvent.click(screen.getByText('Not covered (79)'));

    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(screen.getByText('Status: Not covered')).toBeInTheDocument();
  });

  it('summarises what is active as a pill, so the filter is visible when collapsed', async () => {
    render(FilterBar, { fields: FIELDS, values: {}, query: '' });
    await fireEvent.click(screen.getByText('All statuses'));
    await fireEvent.click(screen.getByText('Not covered (79)'));

    expect(screen.getByText('Status: Not covered')).toBeInTheDocument();
  });

  it('shows a search pill for a typed query', async () => {
    render(FilterBar, { fields: FIELDS, values: {}, query: '' });
    await fireEvent.input(screen.getByPlaceholderText(/name, reference/i),
      { target: { value: 'alarm' } });

    expect(screen.getByText('"alarm"')).toBeInTheDocument();
  });

  it('offers Clear only when something is active, and it empties the search too', async () => {
    render(FilterBar, { fields: FIELDS, values: {}, query: '' });
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();

    const box = screen.getByPlaceholderText(/name, reference/i);
    await fireEvent.input(box, { target: { value: 'alarm' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(box.value).toBe('');
    expect(screen.queryByText('"alarm"')).not.toBeInTheDocument();
  });

  it('shows the caller-computed result count', () => {
    render(FilterBar, { fields: FIELDS, values: {}, query: '', resultLabel: '34 of 116' });
    expect(screen.getByText('34 of 116')).toBeInTheDocument();
  });

  it('opens one dropdown at a time', async () => {
    render(FilterBar, { fields: FIELDS, values: {}, query: '' });
    await fireEvent.click(screen.getByText('All statuses'));
    expect(screen.getByText('Not covered (79)')).toBeInTheDocument();

    await fireEvent.click(screen.getByText('Any source'));
    // The first dropdown's options are gone; only the second is open.
    expect(screen.queryByText('Not covered (79)')).not.toBeInTheDocument();
    expect(screen.getByText('Legislation')).toBeInTheDocument();
  });
});
