// @vitest-environment jsdom
//
// src/lib/components/common/Button.test.js
// TYPE-2 component test — see ProtectedButton.test.js for the harness rationale.
// Assertions are behaviour-based: queried by role/text, never by CSS class.
// Slot content is supplied via Button.harness.svelte (testing-library v5 has no
// `slots` render option); props pass through it via $$restProps.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import Button from './Button.harness.svelte';

beforeEach(() => cleanup());

describe('Button', () => {
  it('renders its slot text as a button', () => {
    render(Button, { props: { text: 'Save' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('forwards the click event', async () => {
    const onClick = vi.fn();
    render(Button, { props: { text: 'Go' }, events: { click: onClick } });
    await fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when the disabled prop is set', () => {
    // (jsdom doesn't suppress clicks on disabled buttons the way a browser
    // does, so we assert the disabled attribute — the meaningful contract.)
    render(Button, { props: { text: 'Go', disabled: true } });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('honours the type prop (e.g. submit)', () => {
    render(Button, { props: { text: 'Submit', type: 'submit' } });
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('sets the native title attribute for hover tooltips', () => {
    render(Button, { props: { text: 'Save', title: 'Save changes' } });
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Save changes');
  });
});
