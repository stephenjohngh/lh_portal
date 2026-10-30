// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ result: /** @type {any} */ ([]), fail: false, calls: /** @type {any[]} */ ([]) }));

vi.mock('#lib/apps/guides/public.js', () => ({
  guidesFor: vi.fn(async (ctx) => { h.calls.push(ctx); if (h.fail) throw new Error('read failed'); return h.result; }),
}));
vi.mock('#lib/utils/driveUtils.js', () => ({ normalisePhotoUrl: (u) => u }));

import GuideHowTo from './GuideHowTo.svelte';

const guide = (o = {}) => ({
  guideId: 'g1', title: 'Test a luminaire', version: 3, specificity: 2, summary: null, youNeed: 'a key', minutes: 5,
  steps: [
    { id: 's1', position: 1, kind: 'step', title: 'Press the button', body: 'Hold it', photos: [] },
    { id: 's2', position: 2, kind: 'stop', title: 'It will not light', body: 'Call the office', photos: [] },
  ], ...o,
});

beforeEach(() => { h.result = []; h.fail = false; h.calls = []; });

describe('GuideHowTo (the walk skin)', () => {
  it('shows nothing when no guide applies', async () => {
    const { container } = render(GuideHowTo, { props: { context: { obligation_id: 'ob' } } });
    await waitFor(() => expect(h.calls.length).toBe(1));
    expect(container.querySelector('[data-testid="guide-howto"]')).toBeNull();
    expect(screen.queryByTestId('guides-unavailable')).toBeNull();
  });

  it('says guides are not available when the read fails — never silence', async () => {
    h.fail = true;
    render(GuideHowTo, { props: { context: { obligation_id: 'ob' } } });
    expect(await screen.findByTestId('guides-unavailable')).toBeTruthy();
  });

  it('asks with exactly the context it is given', async () => {
    render(GuideHowTo, { props: { context: { obligation_id: 'ob', component_type_id: 'ty', component_id: undefined } } });
    await waitFor(() => expect(h.calls.length).toBe(1));
    expect(h.calls[0]).toMatchObject({ obligation_id: 'ob', component_type_id: 'ty' });
  });

  it('opens to the steps, labels a stop step in words, and reports the version shown', async () => {
    h.result = [guide()];
    const onShown = vi.fn();
    render(GuideHowTo, { props: { context: { obligation_id: 'ob' } }, events: { shown: (e) => onShown(e.detail) } });
    const bar = await screen.findByRole('button', { name: /how to/i });
    expect(screen.queryByText('Press the button')).toBeNull();           // collapsed to begin with
    await fireEvent.click(bar);
    expect(screen.getByText('Press the button')).toBeTruthy();
    expect(screen.getByText(/STOP — CALL SOMEONE/)).toBeTruthy();
    expect(onShown).toHaveBeenCalledWith({ g1: 3 });
  });

  it('does not re-fetch when the parent re-passes an equal context', async () => {
    h.result = [guide()];
    const { rerender } = render(GuideHowTo, { props: { context: { obligation_id: 'ob' } } });
    await screen.findByRole('button', { name: /how to/i });
    await rerender({ context: { obligation_id: 'ob' } });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.calls.length).toBe(1);
  });
});
