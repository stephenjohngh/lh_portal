// @vitest-environment jsdom
// The shared offline-queue status line (2026-10-17).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import OfflineQueueStatus from './OfflineQueueStatus.svelte';

beforeEach(() => cleanup());

describe('OfflineQueueStatus', () => {
  it('says nothing when the queue is empty', () => {
    render(OfflineQueueStatus, { state: { pending: 0, syncing: 0, error: 0, online: true } });
    expect(screen.queryByTestId('offline-queue-status')).toBeNull();
  });
  it('says what is waiting, and whether it is being sent or waiting for a signal', () => {
    render(OfflineQueueStatus, { state: { pending: 2, syncing: 0, error: 0, online: false }, what: ['sighting', 'sightings'] });
    expect(screen.getByTestId('offline-queue-status').textContent).toMatch(/2 sightings waiting — sent when there is a signal/);
  });
  it('says what could not be sent, and Retry puts it back', async () => {
    const onRetry = vi.fn();
    render(OfflineQueueStatus, { state: { pending: 0, syncing: 0, error: 1, online: true }, what: ['sighting', 'sightings'], onRetry });
    expect(screen.getByTestId('offline-queue-status').textContent).toMatch(/1 sighting could not be sent/);
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
