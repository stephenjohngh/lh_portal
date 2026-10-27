// @vitest-environment jsdom
//
// Shading a day (2026-10-27). "Shade this day" used to do nothing at all when
// Save was pressed with no name typed; it now shades the day as "Shaded". And
// removing the shading is inside the Change shading form, not a loose button
// beside it. The note under a non-working day is gone.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DayMarkControl from './DayMarkControl.svelte';
import OccurrenceRow from './OccurrenceRow.svelte';

function control(props) {
  const sent = [];
  const events = { set: (e) => sent.push(['set', e.detail]), clear: (e) => sent.push(['clear', e.detail]) };
  render(DayMarkControl, { props: { date: '2026-03-14', canEdit: true, ...props }, events });
  return sent;
}

describe('DayMarkControl', () => {
  it('shades a day even when no name was typed', async () => {
    const sent = control({});
    await fireEvent.click(screen.getByText('Shade this day'));
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(sent).toEqual([['set', { date: '2026-03-14', label: 'Shaded', colour: 'rose' }]]);
  });

  it('keeps a typed name', async () => {
    const sent = control({});
    await fireEvent.click(screen.getByText('Shade this day'));
    await fireEvent.input(screen.getByPlaceholderText('e.g. Bank holiday'), { target: { value: 'AGM' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(sent[0][1].label).toBe('AGM');
  });

  it('has no Remove beside the label; Remove shading is inside Change shading', async () => {
    const sent = control({ mark: { label: 'Bank holiday', colour: 'rose' } });
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    await fireEvent.click(screen.getByText('Change shading'));
    await fireEvent.click(screen.getByRole('button', { name: 'Remove shading' }));
    expect(sent).toEqual([['clear', { date: '2026-03-14' }]]);
  });

  it('offers no Remove for a day that is not shaded', async () => {
    control({});
    await fireEvent.click(screen.getByText('Shade this day'));
    expect(screen.queryByRole('button', { name: 'Remove shading' })).toBeNull();
  });

  it('says nothing about a non-working day', () => {
    control({ mark: { label: 'Christmas Day', colour: 'rose', source: 'non_working' } });
    expect(screen.queryByText(/Not a working day/)).toBeNull();
    expect(screen.getByText('Christmas Day')).toBeTruthy();
  });
});

describe('OccurrenceRow — a cancelled or skipped date', () => {
  const occ = (status) => ({
    event_id: 'e', scheduled_for: '2026-03-14', date: '2026-03-14', status,
    series: { id: 'e', title: 'AGM', category: null, all_day: true, recurrence: { freq: 'once' } },
  });

  it('looks like a done one, with a cross in the box instead of a tick', () => {
    const { unmount } = render(OccurrenceRow, { props: { occurrence: occ('done'), canEdit: true } });
    expect(screen.getByTitle('Mark as not done').textContent).toBe('✓');
    unmount();
    render(OccurrenceRow, { props: { occurrence: occ('skipped'), canEdit: true } });
    const box = screen.getByTitle(/cancelled/);
    expect(box.textContent).toBe('✕');
    expect(box.className).toContain('bg-');                       // filled, as done is
    expect(screen.getByText('AGM').className).toContain('line-through');
  });
});
