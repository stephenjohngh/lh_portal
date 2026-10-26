// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ days: [{ day: '2026-12-25', name: 'Christmas Day' }], added: [], removed: [], feed: [], feedFails: false, bulk: [] }));
vi.mock('#lib/workflow/nonWorkingDays.js', () => ({
  ensureNonWorkingDays: async () => 0,
  fetchBankHolidayFeed: async () => { if (h.feedFails) throw new Error('no'); return h.feed; },
  missingFromFeed: (feed, existing) => feed.filter((e) => !existing.some((d) => d.day === e.date)).map((e) => ({ day: e.date, name: e.title })),
  addNonWorkingDays: async (list) => { h.bulk.push(list); h.days.push(...list); return list.length; },
  listNonWorkingDays: async () => [...h.days],
  addNonWorkingDay: async (day, name) => { h.added.push([day, name]); h.days.push({ day, name }); },
  removeNonWorkingDay: async (day) => { h.removed.push(day); h.days = h.days.filter((d) => d.day !== day); },
}));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: vi.fn() }));

const Panel = (await import('./NonWorkingDaysPanel.svelte')).default;
beforeEach(() => { cleanup(); h.days = [{ day: '2026-12-25', name: 'Christmas Day' }]; h.added = []; h.removed = []; h.feed = []; h.feedFails = false; h.bulk = []; });

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

  it('offers the days GOV.UK has that the list lacks, and adds them only when asked', async () => {
    h.feed = [{ date: '2026-12-25', title: 'Christmas Day' }, { date: '2029-01-01', title: 'New Year’s Day' }];
    render(Panel);
    const offer = await screen.findByTestId('gov-offer');
    expect(offer.textContent).toMatch(/GOV\.UK has 1 England and Wales bank holiday/);
    expect(offer.textContent).toMatch(/New Year/);
    expect(h.bulk).toEqual([]);                           // nothing is added behind anyone's back
    await fireEvent.click(screen.getByRole('button', { name: 'Add them' }));
    await waitFor(() => expect(h.bulk[0]).toEqual([{ day: '2029-01-01', name: 'New Year’s Day' }]));
    await waitFor(() => expect(screen.queryByTestId('gov-offer')).toBeNull());
  });

  it('says nothing when the list is up to date, and says so quietly when GOV.UK cannot be reached', async () => {
    h.feed = [{ date: '2026-12-25', title: 'Christmas Day' }];
    render(Panel);
    await screen.findByText(/Christmas Day/);
    expect(screen.queryByTestId('gov-offer')).toBeNull();
    cleanup(); h.feedFails = true;
    render(Panel);
    expect((await screen.findByTestId('gov-note')).textContent).toMatch(/could not be checked/);
    expect(screen.queryByTestId('gov-offer')).toBeNull();
  });
});
