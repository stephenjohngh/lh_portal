// @vitest-environment jsdom
//
// A row has three things to press and they do three different jobs: the tick
// records it, the pencil edits (and offers move / skip inside the dialog), and
// the text opens everything about it, read-only (2026-10-27).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import OccurrenceRow from './OccurrenceRow.svelte';
import EventDetailsModal from './EventDetailsModal.svelte';

const occurrence = {
  event_id: 'e1', scheduled_for: '2026-03-14', date: '2026-03-14', status: 'due',
  series: { id: 'e1', title: 'Annual general meeting', description: 'Bring the accounts.\nAnd the minutes.',
            category: null, all_day: true, location: "Residents' lounge", recurrence: { freq: 'yearly' } },
};

function rowWith(props = {}) {
  const handlers = { toggle: vi.fn(), edit: vi.fn(), open: vi.fn() };
  const events = Object.fromEntries(Object.entries(handlers).map(([k, fn]) => [k, (e) => fn(e.detail)]));
  render(OccurrenceRow, { props: { occurrence, canEdit: true, ...props }, events });
  return handlers;
}

describe('OccurrenceRow', () => {
  it('shows one pencil, not a row of small controls', () => {
    rowWith();
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('title'))).not.toContain('Skip this one');
    expect(screen.getByTitle(/Edit/)).toBeTruthy();
    expect(screen.queryByTitle(/Move/)).toBeNull();
  });

  it('the pencil edits, the tick records, and neither opens the details', async () => {
    const h = rowWith();
    await fireEvent.click(screen.getByTitle(/Edit/));
    expect(h.edit).toHaveBeenCalledTimes(1);
    await fireEvent.click(screen.getByTitle('Mark as done'));
    expect(h.toggle).toHaveBeenCalledTimes(1);
    expect(h.open).not.toHaveBeenCalled();
  });

  it('clicking the text opens the details, for a viewer too', async () => {
    const h = rowWith({ canEdit: false });
    await fireEvent.click(screen.getByText('Annual general meeting'));
    expect(h.open).toHaveBeenCalledTimes(1);
  });
});

describe('EventDetailsModal', () => {
  it('shows everything about the event, read-only, with the full notes', () => {
    render(EventDetailsModal, { props: { show: true, occurrence, canEdit: true, categories: [], owners: [] } });
    const d = screen.getByTestId('event-details');
    expect(d.textContent).toContain("Residents' lounge");
    expect(d.textContent).toContain('Bring the accounts.');
    expect(d.textContent).toContain('And the minutes.');          // the whole note, not its first line
    expect(d.querySelector('input, textarea, select')).toBeNull();
  });

  it('offers Edit to an editor, and not for something another app owns', () => {
    const { unmount } = render(EventDetailsModal, { props: { show: true, occurrence, canEdit: true } });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    unmount();
    render(EventDetailsModal, { props: { show: true, occurrence: { ...occurrence, linked: true, ownerApp: 'Maintenance', sourceLabel: 'Job' }, canEdit: true } });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
