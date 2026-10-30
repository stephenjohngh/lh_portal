// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ result: /** @type {any[]} */ ([]), fail: false }));
vi.mock('../public.js', () => ({ guidesFor: vi.fn(async () => { if (h.fail) throw new Error('x'); return h.result; }) }));
vi.mock('#lib/utils/driveUtils.js', () => ({ normalisePhotoUrl: (u) => u }));
import GuideHelp from './GuideHelp.svelte';

const g = { guideId: 'g1', title: 'Test a luminaire', version: 1, minutes: 5, steps: [{ id: 's', position: 1, kind: 'step', title: 'Press the button', body: 'Hold', photos: [] }] };
beforeEach(() => { h.result = []; h.fail = false; });

describe('GuideHelp', () => {
  it('is silent when no guide applies, unless asked to say so', async () => {
    const { container } = render(GuideHelp, { props: { context: { obligation_id: 'ob' } } });
    await new Promise((r) => setTimeout(r, 10));
    expect(container.querySelector('[data-testid="guidehelp"]')).toBeNull();
  });
  it('says none is offered when it is a preview', async () => {
    render(GuideHelp, { props: { context: { obligation_id: 'ob' }, showWhenEmpty: true } });
    expect(await screen.findByTestId('guidehelp-none')).toBeTruthy();
  });
  it('lists a guide and opens to its steps', async () => {
    h.result = [g];
    render(GuideHelp, { props: { context: { obligation_id: 'ob' } } });
    await fireEvent.click(await screen.findByRole('button', { name: /Test a luminaire/ }));
    expect(screen.getByText('Press the button')).toBeTruthy();
  });
  it('says so when the read fails', async () => {
    h.fail = true;
    render(GuideHelp, { props: { context: { obligation_id: 'ob' } } });
    expect(await screen.findByTestId('guidehelp-failed')).toBeTruthy();
  });
});
