// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ guides: /** @type {any[]} */ ([]), contact: /** @type {any} */ (null), fail: false, calls: /** @type {any[]} */ ([]) }));
vi.mock('#lib/apps/guides/public.js', () => ({
  failHelpForWalk: vi.fn(async (ctx) => { h.calls.push(ctx); if (h.fail) throw new Error('x'); return { guides: h.guides, contact: h.contact, fromCache: false }; }),
}));
vi.mock('#lib/utils/driveUtils.js', () => ({ normalisePhotoUrl: (u) => u }));
import FailNextStep from './FailNextStep.svelte';

const guide = { guideId: 'g', title: 'Light failed', version: 1, steps: [{ id: 's', position: 1, kind: 'stop', title: 'Do not use the stair', body: 'Tape it off', photos: [] }] };
const props = (o = {}) => ({ props: { context: { obligation_id: 'ob', component_type_id: 'ty', component_id: 'c' }, ...o } });
beforeEach(() => { h.guides = []; h.contact = null; h.fail = false; h.calls = []; });

describe('FailNextStep', () => {
  it('is quiet on an ordinary walk when nothing has been set up', async () => {
    const { container } = render(FailNextStep, props());
    await waitFor(() => expect(h.calls.length).toBe(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(container.querySelector('[data-testid="fail-next-step"]')).toBeNull();
  });

  it('shows the number as a tappable call link, and the "if this fails" guide', async () => {
    h.guides = [guide]; h.contact = { name: 'The office', phone: '020 7946 0000', hours: '8-6', notes: 'Say which floor' };
    render(FailNextStep, props());
    expect(await screen.findByText('IF THIS FAILS')).toBeTruthy();
    expect(screen.getByRole('link', { name: '020 7946 0000' }).getAttribute('href')).toBe('tel:02079460000');
    expect(screen.getByText('Do not use the stair')).toBeTruthy();
    expect(screen.getByText(/STOP — CALL SOMEONE/)).toBeTruthy();
  });

  it('on an immediate-response walk it is a loud alert even with nothing set up', async () => {
    render(FailNextStep, props({ response: 'immediate' }));
    expect(await screen.findByText('THIS NEEDS AN IMMEDIATE RESPONSE')).toBeTruthy();
    expect(screen.getByTestId('fail-no-contact')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('a failed read says so — never "nothing to do"', async () => {
    h.fail = true;
    render(FailNextStep, props({ response: 'immediate' }));
    expect(await screen.findByTestId('fail-unavailable')).toHaveTextContent(/Tell the office/);
  });

  it('asks again for each failed check, so a check-specific guide is found', async () => {
    h.guides = [guide];
    render(FailNextStep, props({ failedChecks: ['a1'] }));
    await waitFor(() => expect(h.calls.length).toBe(2));
    expect(h.calls.some((c) => c.type_attribute_id === 'a1')).toBe(true);
  });
});
