// @vitest-environment jsdom
//
// src/lib/apps/building_assets/components/MultiSelectDropdown.test.js
//
// Type-2 DOM test for the reusable filter dropdown — Phase-2 example #4
// (a reusable primitive). Covers the summary logic (0/1/many), controlled
// open state, option rendering, the bindable-Set toggle, and the toggle event.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import MultiSelectDropdown from './MultiSelectDropdown.svelte';

const opts = [
  { value: 'fire', label: 'Fire' },
  { value: 'elec', label: 'Electrical' },
];

beforeEach(cleanup);

describe('MultiSelectDropdown summary', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(MultiSelectDropdown, { props: { options: opts, placeholder: 'All systems', noun: 'systems' } });
    expect(screen.getByRole('button')).toHaveTextContent('All systems');
  });
  it('shows the single option label when one is selected', () => {
    render(MultiSelectDropdown, { props: { options: opts, selected: new Set(['elec']), placeholder: 'All systems', noun: 'systems' } });
    expect(screen.getByRole('button')).toHaveTextContent('Electrical');
  });
  it('shows "{n} {noun}" when several are selected', () => {
    render(MultiSelectDropdown, { props: { options: opts, selected: new Set(['fire', 'elec']), noun: 'systems' } });
    expect(screen.getByRole('button')).toHaveTextContent('2 systems');
  });
});

describe('MultiSelectDropdown open/options', () => {
  it('renders no option checkboxes when closed', () => {
    render(MultiSelectDropdown, { props: { options: opts, open: false } });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
  it('renders one checkbox per option when open, reflecting selection', () => {
    render(MultiSelectDropdown, { props: { options: opts, open: true, selected: new Set(['fire']) } });
    expect(screen.getByRole('checkbox', { name: 'Fire' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Electrical' })).not.toBeChecked();
  });
});

describe('MultiSelectDropdown interaction', () => {
  it('dispatches "toggle" when the summary button is clicked', async () => {
    const onToggle = vi.fn();
    render(MultiSelectDropdown, { props: { options: opts }, events: { toggle: onToggle } });
    await fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('ticking an option adds it to the selection (checkbox becomes checked)', async () => {
    render(MultiSelectDropdown, { props: { options: opts, open: true, selected: new Set() } });
    const cb = screen.getByRole('checkbox', { name: 'Electrical' });
    expect(cb).not.toBeChecked();
    await fireEvent.click(cb);
    expect(cb).toBeChecked();
  });
});
