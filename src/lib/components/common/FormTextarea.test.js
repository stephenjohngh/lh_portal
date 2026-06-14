// @vitest-environment jsdom
//
// src/lib/components/common/FormTextarea.test.js
// Behaviour: label association, error vs help text, and the char counter that
// appears only when maxlength is set.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import FormTextarea from './FormTextarea.svelte';

beforeEach(() => cleanup());

describe('FormTextarea', () => {
  it('associates the label with the textarea', () => {
    render(FormTextarea, { props: { label: 'Notes' } });
    expect(screen.getByLabelText('Notes')).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('shows the error and suppresses help text', () => {
    render(FormTextarea, { props: { label: 'X', helpText: 'optional', error: 'Too short' } });
    expect(screen.getByText('Too short')).toBeInTheDocument();
    expect(screen.queryByText('optional')).not.toBeInTheDocument();
  });

  it('renders a character counter when maxlength is set', () => {
    render(FormTextarea, { props: { label: 'X', value: 'abc', maxlength: 100 } });
    expect(screen.getByText('3/100')).toBeInTheDocument();
  });

  it('omits the counter when maxlength is not set', () => {
    render(FormTextarea, { props: { label: 'X', value: 'abc' } });
    expect(screen.queryByText(/\/\d+$/)).not.toBeInTheDocument();
  });

  it('forwards the input event', async () => {
    const onInput = vi.fn();
    render(FormTextarea, { props: { label: 'X' }, events: { input: onInput } });
    await fireEvent.input(screen.getByLabelText('X'), { target: { value: 'hello' } });
    expect(onInput).toHaveBeenCalled();
  });
});
