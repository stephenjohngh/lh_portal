// @vitest-environment jsdom
//
// The report form's notes (2026-10-25): known details start BELOW a blank first
// line so the person can type above them, and a blank line left there is not saved.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';

const h = vi.hoisted(() => ({ record: /** @type {any} */ (null) }));

vi.mock('../stores/sightingStore.js', () => ({
  sightingStore: { record: (/** @type {any} */ a) => h.record(a) },
}));
vi.mock('#lib/stores/online.js', async () => {
  const { writable } = await import('svelte/store');
  return { online: writable(true) };
});
vi.mock('#lib/apps/inspection/utils/imageCompression.js', () => ({ compressImage: async (/** @type {any} */ f) => f }));

import RecordSighting from './RecordSighting.svelte';

describe('RecordSighting notes', () => {
  beforeEach(() => {
    cleanup();
    h.record = vi.fn(async () => ({ sighting: { id: 'x', seen_at: new Date().toISOString() }, queued: false, photoError: '' }));
  });

  it('known details start under a blank first line', () => {
    render(RecordSighting, { props: { registration: 'AB12CDE', place: 'road', prefillNotes: 'Plate read: AB12 CDE — No Permit.' } });
    const box = /** @type {HTMLTextAreaElement} */ (screen.getByRole('textbox'));
    expect(box.value).toBe('\nPlate read: AB12 CDE — No Permit.');
  });

  it('with no known details the box starts empty', () => {
    render(RecordSighting, { props: { registration: 'AB12CDE', place: 'road' } });
    expect(/** @type {HTMLTextAreaElement} */ (screen.getByRole('textbox')).value).toBe('');
  });

  it('a blank first line still there is removed before saving', async () => {
    render(RecordSighting, { props: { registration: 'AB12CDE', place: 'road', prefillNotes: 'Plate read: AB12 CDE' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(h.record.mock.calls[0][0].notes).toBe('Plate read: AB12 CDE');
  });

  it('text typed on the first line is kept, with the details under it', async () => {
    render(RecordSighting, { props: { registration: 'AB12CDE', place: 'road', prefillNotes: 'Plate read: AB12 CDE' } });
    const box = screen.getByRole('textbox');
    await fireEvent.input(box, { target: { value: 'Blocking the gate\nPlate read: AB12 CDE' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(h.record.mock.calls[0][0].notes).toBe('Blocking the gate\nPlate read: AB12 CDE');
  });
});
