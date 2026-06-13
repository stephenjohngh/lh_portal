// @vitest-environment jsdom
//
// src/lib/apps/management/components/ActivityLogToolbar.test.js
//
// Type-2 (component DOM) test — Phase-2 example #3, first from
// ActivityLogSection. Covers bindable props + a <select bind:value> + an
// internal toggle. Asserts prop→DOM and interactivity; the bind write-back is
// Svelte's job. Button (a real child) renders fine in jsdom (it only imports Icon).

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import ActivityLogToolbar from './ActivityLogToolbar.svelte';

beforeEach(cleanup);

describe('ActivityLogToolbar', () => {
  it('hides the Historic toggle when there are no historic items', () => {
    render(ActivityLogToolbar, { props: { historicCount: 0 } });
    expect(screen.queryByRole('button', { name: /Historic/ })).not.toBeInTheDocument();
  });

  it('shows "Include Historic" when hidden and "Hide Historic" when shown', async () => {
    const { unmount } = render(ActivityLogToolbar, { props: { historicCount: 3, showHistoric: false } });
    expect(screen.getByRole('button', { name: /Include Historic/ })).toBeInTheDocument();
    unmount();
    render(ActivityLogToolbar, { props: { historicCount: 3, showHistoric: true } });
    expect(screen.getByRole('button', { name: /Hide Historic/ })).toBeInTheDocument();
  });

  it('toggles the Historic label on click (binding keeps the DOM in sync)', async () => {
    render(ActivityLogToolbar, { props: { historicCount: 3, showHistoric: false } });
    const btn = screen.getByRole('button', { name: /Include Historic/ });
    await fireEvent.click(btn);
    expect(screen.getByRole('button', { name: /Hide Historic/ })).toBeInTheDocument();
  });

  it('reflects the sortField prop in the select', () => {
    render(ActivityLogToolbar, { props: { sortField: 'sequence' } });
    expect(screen.getByRole('combobox')).toHaveValue('sequence');
  });

  it('shows ↓ for desc and ↑ for asc, with a matching tooltip', () => {
    const { unmount } = render(ActivityLogToolbar, { props: { sortDir: 'desc' } });
    expect(screen.getByTitle(/Newest first/)).toHaveTextContent('↓');
    unmount();
    render(ActivityLogToolbar, { props: { sortDir: 'asc' } });
    expect(screen.getByTitle(/Oldest first/)).toHaveTextContent('↑');
  });

  it('flips the direction arrow when the sort button is clicked', async () => {
    render(ActivityLogToolbar, { props: { sortDir: 'desc' } });
    await fireEvent.click(screen.getByTitle(/Newest first/));
    expect(screen.getByTitle(/Oldest first/)).toHaveTextContent('↑');
  });
});
