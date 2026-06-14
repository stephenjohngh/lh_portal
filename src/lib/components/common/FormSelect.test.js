// @vitest-environment jsdom
//
// src/lib/components/common/FormSelect.test.js
// Behaviour: option normalisation (strings or {value,label}), placeholder
// option, label association, error display.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import FormSelect from './FormSelect.svelte';

beforeEach(() => cleanup());

describe('FormSelect', () => {
  it('renders {value,label} options under an associated label', () => {
    render(FormSelect, { props: { label: 'Status', options: [{ value: 'a', label: 'Active' }, { value: 'i', label: 'Inactive' }] } });
    expect(screen.getByLabelText('Status')).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Inactive' })).toBeInTheDocument();
  });

  it('normalises plain-string options to value+label', () => {
    render(FormSelect, { props: { label: 'X', options: ['Red', 'Green'] } });
    expect(screen.getByRole('option', { name: 'Red' })).toHaveValue('Red');
  });

  it('renders the placeholder as a disabled first option', () => {
    render(FormSelect, { props: { label: 'X', options: ['A'], placeholder: 'Pick one' } });
    const ph = screen.getByRole('option', { name: 'Pick one' });
    expect(ph).toBeDisabled();
  });

  it('forwards the change event', async () => {
    const onChange = vi.fn();
    render(FormSelect, { props: { label: 'X', options: ['A', 'B'] }, events: { change: onChange } });
    await fireEvent.change(screen.getByLabelText('X'), { target: { value: 'B' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('shows an error message', () => {
    render(FormSelect, { props: { label: 'X', options: ['A'], error: 'Choose one' } });
    expect(screen.getByText('Choose one')).toBeInTheDocument();
  });
});
