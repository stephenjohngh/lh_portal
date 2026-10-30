// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ version: /** @type {any} */ (null) }));
vi.mock('../stores/guidesStore.js', () => ({ guidesStore: { readVersion: vi.fn(async () => h.version) } }));
vi.mock('#lib/utils/driveUtils.js', () => ({ normalisePhotoUrl: (u) => u }));

import GuideReader from './GuideReader.svelte';

const guide = { id: 'g1', title: 'Moving the bins', version: 2, summary: 'Bins to the collection point', reviewed_at: null };
beforeEach(() => {
  h.version = { snapshot: { you_need: 'gloves', minutes: 10, steps: [
    { id: 's1', position: 1, kind: 'step', title: 'Open the store', body: 'Use the key', photos: [{ id: 'p', url: 'u.jpg' }] },
    { id: 's2', position: 2, kind: 'stop', title: 'Door jammed', body: 'Call the office', photos: [] },
  ] } };
});

describe('GuideReader', () => {
  it('opens on what you will need, then one step per screen, then a closing screen', async () => {
    render(GuideReader, { props: { guide } });
    expect(await screen.findByTestId('reader-intro')).toBeTruthy();
    expect(screen.getByText('gloves')).toBeTruthy();
    await fireEvent.click(screen.getByTestId('reader-next'));
    expect(screen.getByText('Open the store')).toBeTruthy();
    expect(screen.getByText(/Step 1 of 2/)).toBeTruthy();
    expect(screen.queryByText('Door jammed')).toBeNull();
    await fireEvent.click(screen.getByTestId('reader-next'));
    expect(screen.getByText(/STOP — CALL SOMEONE/)).toBeTruthy();
    await fireEvent.click(screen.getByTestId('reader-next'));
    expect(screen.getByTestId('reader-done')).toBeTruthy();
  });

  it('steps with the arrow keys', async () => {
    render(GuideReader, { props: { guide } });
    await screen.findByTestId('reader-intro');
    await fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('Open the store')).toBeTruthy();
    await fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('reader-intro')).toBeTruthy();
  });

  it('offers Edit this guide to an administrator only', async () => {
    const { unmount } = render(GuideReader, { props: { guide, isAdmin: false } });
    await screen.findByTestId('reader-intro');
    expect(screen.queryByText('Edit this guide')).toBeNull();
    unmount();
    render(GuideReader, { props: { guide, isAdmin: true } });
    expect(await screen.findByText('Edit this guide')).toBeTruthy();
  });

  it('says so when there is no published copy, rather than showing an empty guide', async () => {
    h.version = null;
    render(GuideReader, { props: { guide } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/no published copy/i);
  });
});
