// @vitest-environment jsdom
//
// src/lib/components/common/Checkbox.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import Checkbox from './Checkbox.svelte';

beforeEach(() => cleanup());

describe('Checkbox', () => {
  it('renders a checkbox reflecting the checked prop', () => {
    render(Checkbox, { props: { checked: true, label: 'Enable' } });
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('renders unchecked by default', () => {
    render(Checkbox, { props: { label: 'Enable' } });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('renders the label text', () => {
    render(Checkbox, { props: { label: 'Accept terms' } });
    expect(screen.getByText('Accept terms')).toBeInTheDocument();
  });

  it('forwards the change event when toggled', async () => {
    const onChange = vi.fn();
    render(Checkbox, { props: { label: 'X' }, events: { change: onChange } });
    await fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalled();
  });

  it('reflects the disabled state', () => {
    render(Checkbox, { props: { label: 'X', disabled: true } });
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});
