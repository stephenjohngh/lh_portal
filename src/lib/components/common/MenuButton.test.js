// @vitest-environment jsdom
// MenuButton closes its menu on mouseleave of its wrapper. A margin between
// the button and the menu sits outside the wrapper, so a pointer crossing it
// closed the menu before it could be used (Schematic Admin, 2026-11-11).
// The gap must be padding inside the absolutely-placed panel.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MenuButton from './MenuButton.svelte';

const items = [
  { key: 'a', label: 'First' },
  { key: 'b', label: 'Second' }
];

describe('MenuButton', () => {
  it('opens on click and closes when an item is chosen', async () => {
    let picked = null;
    render(MenuButton, { props: { label: 'Menu', items }, events: { select: (e) => (picked = e.detail) } });
    await fireEvent.click(screen.getByRole('button', { name: /Menu/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Second' }));
    expect(picked).toBe('b');
    expect(screen.queryByRole('button', { name: 'First' })).toBeNull();
  });

  it('has no margin between the button and the menu (the pointer would leave the wrapper)', async () => {
    render(MenuButton, { label: 'Menu', items });
    await fireEvent.click(screen.getByRole('button', { name: /Menu/ }));
    const panel = screen.getByTestId('menu-panel');
    const classes = [panel, ...panel.querySelectorAll('*')].map((el) => el.getAttribute('class') ?? '').join(' ');
    expect(classes).not.toMatch(/(^|\s)(mt|my|m)-\S+/);
    expect(panel.getAttribute('class')).toMatch(/(^|\s)top-full(\s|$)/);
  });
});
