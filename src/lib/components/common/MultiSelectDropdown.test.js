// @vitest-environment jsdom
//
// src/lib/components/common/MultiSelectDropdown.test.js
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

describe('MultiSelectDropdown grouped mode', () => {
  const groups = [
    { label: 'Fire',       options: [{ value: 'door', label: 'Door' }, { value: 'alarm', label: 'Alarm' }] },
    { label: 'Electrical', options: [{ value: 'lamp', label: 'Lamp' }] },
  ];
  const flat = [{ value: 'door', label: 'Door' }, { value: 'alarm', label: 'Alarm' }, { value: 'lamp', label: 'Lamp' }];

  it('renders group headers + each group’s options when groups are provided', () => {
    render(MultiSelectDropdown, { props: { options: flat, groups, open: true } });
    expect(screen.getByText('Fire')).toBeInTheDocument();
    expect(screen.getByText('Electrical')).toBeInTheDocument();
    for (const name of ['Door', 'Alarm', 'Lamp']) {
      expect(screen.getByRole('checkbox', { name })).toBeInTheDocument();
    }
  });

  it('still summarises from the flat options (single selection shows its label)', () => {
    render(MultiSelectDropdown, { props: { options: flat, groups, selected: new Set(['lamp']), noun: 'types' } });
    expect(screen.getByRole('button')).toHaveTextContent('Lamp');
  });

  it('falls back to the flat list when groups is empty', () => {
    render(MultiSelectDropdown, { props: { options: flat, groups: [], open: true } });
    expect(screen.queryByText('Fire')).not.toBeInTheDocument();   // no group header
    expect(screen.getByRole('checkbox', { name: 'Door' })).toBeInTheDocument();
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

  it('uses an option’s `short` label in the single-select summary (e.g. floor short_name)', () => {
    render(MultiSelectDropdown, {
      props: {
        options: [{ value: 'fG', label: 'Ground (G)', short: 'G' }],
        selected: new Set(['fG']), placeholder: 'Floors…', noun: 'floors',
      },
    });
    expect(screen.getByRole('button')).toHaveTextContent('G');
    expect(screen.getByRole('button')).not.toHaveTextContent('Ground');
  });

  it('dispatches "change" when a selection is toggled (for side-effects like floorPreset)', async () => {
    const onChange = vi.fn();
    render(MultiSelectDropdown, { props: { options: opts, open: true }, events: { change: onChange } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Fire' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
