// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ days: [{ day: '2026-12-25', name: 'Christmas Day' }], added: [], removed: [] }));
vi.mock('#lib/workflow/nonWorkingDays.js', () => ({
  ensureNonWorkingDays: async () => 0,
  listNonWorkingDays: async () => [...h.days],
  addNonWorkingDay: async (day, name) => { h.added.push([day, name]); h.days.push({ day, name }); },
  removeNonWorkingDay: async (day) => { h.removed.push(day); h.days = h.days.filter((d) => d.day !== day); },
}));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: vi.fn() }));

const Panel = (await import('./NonWorkingDaysPanel.svelte')).default;
beforeEach(() => { cleanup(); h.days = [{ day: '2026-12-25', name: 'Christmas Day' }]; h.added = []; h.removed = []; });

describe('Admin → Non-working days', () => {
  it('lists each day with its weekday and name, grouped by year', async () => {
    render(Panel);
    const box = await screen.findByTestId('non-working-days');
    await waitFor(() => expect(box.textContent).toMatch(/Friday .*Dec 2026.*Christmas Day/));
    expect(box.textContent).toMatch(/2026/);
  });

  it('adds a day only with both a date and a name, and removes one', async () => {
    render(Panel);
    await screen.findByText(/Christmas Day/);
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a day' }));
    expect(await screen.findByText(/Give the date and what it is/)).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('Date'), { target: { value: '2027-01-01' } });
    await fireEvent.input(screen.getByLabelText('What it is'), { target: { value: 'New Year' } });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add a day' }));
    await waitFor(() => expect(h.added).toEqual([['2027-01-01', 'New Year']]));
    await screen.findByText(/New Year/);
    await fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    await waitFor(() => expect(h.removed).toEqual(['2026-12-25']));
  });
});
