// @vitest-environment jsdom
//
// src/lib/components/common/FormInput.test.js
// Behaviour: label/control association, required marker, error vs help text,
// disabled state, and event forwarding.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import FormInput from './FormInput.svelte';

beforeEach(() => cleanup());

describe('FormInput', () => {
  it('associates the label with the input (clickable focus target)', () => {
    render(FormInput, { props: { label: 'Email', value: '' } });
    expect(screen.getByLabelText('Email')).toBeInstanceOf(HTMLInputElement);
  });

  it('shows a required marker when required', () => {
    render(FormInput, { props: { label: 'Name', required: true } });
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders help text when there is no error', () => {
    render(FormInput, { props: { label: 'X', helpText: 'Be concise' } });
    expect(screen.getByText('Be concise')).toBeInTheDocument();
  });

  it('shows the error and suppresses help text when error is set', () => {
    render(FormInput, { props: { label: 'X', helpText: 'Be concise', error: 'Required' } });
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.queryByText('Be concise')).not.toBeInTheDocument();
  });

  it('forwards the input event', async () => {
    const onInput = vi.fn();
    render(FormInput, { props: { label: 'X' }, events: { input: onInput } });
    await fireEvent.input(screen.getByLabelText('X'), { target: { value: 'hi' } });
    expect(onInput).toHaveBeenCalled();
  });

  it('reflects the disabled state', () => {
    render(FormInput, { props: { label: 'X', disabled: true } });
    expect(screen.getByLabelText('X')).toBeDisabled();
  });
});
