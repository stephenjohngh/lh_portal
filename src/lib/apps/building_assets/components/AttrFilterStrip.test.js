// @vitest-environment jsdom
//
// src/lib/apps/building_assets/components/AttrFilterStrip.test.js
//
// Type-2 DOM test for the reusable Fixed/Condition filter strip. Renders the
// real AttrFilterChip + AttrFilterPopover children (both jsdom-safe — they only
// import svelte + the pure attrFilters util). Asserts chip rendering, the
// add-button disabled/title states, controlled popover visibility, and that
// chip/add actions dispatch the right events with the right index.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import AttrFilterStrip from './AttrFilterStrip.svelte';

const def = { id: 'a1', name: 'Fire rating', display_type: 'text' };
const defById = new Map([['a1', def]]);
const filters = [{ defId: 'a1', op: 'in', values: ['FD30'] }];
const base = { label: 'Fixed', filters, defById, availableDefs: [def], attrOptions: {}, systems: [], types: [] };

beforeEach(cleanup);

describe('AttrFilterStrip', () => {
  it('renders the label and a chip per filter', () => {
    render(AttrFilterStrip, { props: base });
    expect(screen.getByText('Fixed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fire rating FD30/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove filter on Fire rating/ })).toBeInTheDocument();
  });

  it('disables Add with an explanatory title when no defs are available', () => {
    render(AttrFilterStrip, { props: { ...base, availableDefs: [] } });
    const add = screen.getByRole('button', { name: '+ Add filter' });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute('title', 'No fixed attributes available');
  });

  it('enables Add (with title) when defs are available', () => {
    render(AttrFilterStrip, { props: base });
    const add = screen.getByRole('button', { name: '+ Add filter' });
    expect(add).toBeEnabled();
    expect(add).toHaveAttribute('title', 'Add a fixed-attribute filter');
  });

  it('dispatches add / edit / remove with the right payload', async () => {
    const onAdd = vi.fn(), onEdit = vi.fn(), onRemove = vi.fn();
    render(AttrFilterStrip, { props: base, events: { add: onAdd, edit: onEdit, remove: onRemove } });

    await fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }));
    expect(onAdd).toHaveBeenCalledTimes(1);

    await fireEvent.click(screen.getByRole('button', { name: /Fire rating FD30/ }));
    expect(onEdit.mock.calls[0][0].detail).toEqual({ index: 0 });

    await fireEvent.click(screen.getByRole('button', { name: /Remove filter on Fire rating/ }));
    expect(onRemove.mock.calls[0][0].detail).toEqual({ index: 0 });
  });

  it('shows the popover only when popoverOpen is true', () => {
    const { unmount } = render(AttrFilterStrip, { props: { ...base, popoverOpen: false } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
    render(AttrFilterStrip, { props: { ...base, popoverOpen: true } });
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // AttrFilterPopover (role="dialog")
  });

  it('uses the label in the Condition variant’s title text', () => {
    render(AttrFilterStrip, { props: { ...base, label: 'Condition', availableDefs: [] } });
    expect(screen.getByRole('button', { name: '+ Add filter' }))
      .toHaveAttribute('title', 'No condition attributes available');
  });
});
