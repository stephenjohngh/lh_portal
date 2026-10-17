// @vitest-environment jsdom
//
// Car check (/parking/check, 2026-10-17): the caretaker's bookmark. It opens
// on a big Scan button — the camera only when pressed — and a picked plate
// gives one plain answer.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';

const h = vi.hoisted(() => {
  function makeStore(initial) {
    let val = initial;
    const subs = new Set();
    return {
      subscribe: (run) => { run(val); subs.add(run); return () => subs.delete(run); },
      set: (v) => { val = v; subs.forEach((r) => r(val)); },
      get: () => val,
    };
  }
  return { online: makeStore(true), sync: makeStore({ pending: 0, error: 0 }),
    parking: makeStore({ vehicles: [{ id: 'v1', registration: 'AB12CDE' }], error: null }),
    permits: makeStore({ permits: [] }), result: null, checked: [],
    sightings: makeStore({ sightings: [], error: null }), recorded: [] };
});

// The real gate, with an admin who has been checked.
vi.mock('#lib/stores/permissions.js', () => ({
  permissions: { subscribe: (run) => { run({ loading: false, isAdmin: true, appPermissions: {} }); return () => {}; }, init: async () => {} },
}));
vi.mock('#lib/stores/auth.js', () => ({ auth: { subscribe: (run) => { run({ user: { id: 'u1' } }); return () => {}; } } }));
vi.mock('#lib/utils/textScan/ocrReader.js', () => ({ startReader: async () => ({}), readText: async () => ({ text: '', confidence: 0 }), warmReader: async () => {} }));
vi.mock('#lib/stores/online.js', () => ({ online: { subscribe: h.online.subscribe } }));
vi.mock('../stores/parkingQueue.js', () => ({ syncState: { subscribe: h.sync.subscribe }, startSync: () => {}, stopSync: () => {}, retryErrors: () => {} }));
vi.mock('../stores/parkingStore.js', () => ({ parkingStore: { subscribe: h.parking.subscribe, load: async () => {} } }));
vi.mock('../stores/permitStore.js', () => ({ permitStore: { subscribe: h.permits.subscribe, ensureLoaded: async () => {} } }));
vi.mock('../stores/sightingStore.js', () => ({ sightingStore: {
  subscribe: h.sightings.subscribe, ensureLoaded: async () => {},
  record: async (input) => { h.recorded.push(input); return { sighting: { id: 'n1', seen_at: '2026-10-17T09:15:00Z' }, photoError: '' }; },
} }));
vi.mock('#lib/apps/inspection/utils/imageCompression.js', () => ({ compressImage: async (b) => b }));
vi.mock('../stores/registrationCheck.js', () => ({
  checkRegistration: async (q, o) => { h.checked.push([q, o]); return h.result; },
}));

import PlateCheck from './PlateCheck.svelte';

beforeEach(() => { cleanup(); h.checked.length = 0; h.recorded.length = 0; h.online.set(true); h.sightings.set({ sightings: [], error: null }); });

async function checkTyped(value) {
  await fireEvent.input(await screen.findByPlaceholderText('Or type it'), { target: { value } });
  await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  return screen.findByTestId('car-check-result');
}

describe('Car check', () => {
  it('opens on the Scan button, not the camera; the camera opens when it is pressed', async () => {
    render(PlateCheck);
    const scan = await screen.findByRole('button', { name: /Scan a number plate/ });
    expect(screen.queryByTestId('text-scanner')).toBeNull();
    await fireEvent.click(scan);
    expect(await screen.findByTestId('text-scanner')).toBeTruthy();
  });

  it('a typed registration that is nowhere reads "Not found"', async () => {
    h.result = { hits: [], permitHits: [], permitError: '' };
    render(PlateCheck);
    await screen.findByPlaceholderText('Or type it');
    await fireEvent.input(screen.getByPlaceholderText('Or type it'), { target: { value: 'zz99zzz' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    const card = await screen.findByTestId('car-check-result');
    expect(card.dataset.tone).toBe('none');
    expect(card.textContent).toMatch(/Not found/);
    expect(h.checked).toEqual([['zz99zzz', { offline: false }]]);
  });

  it('a car with a licence today reads allowed, with its bay and holder', async () => {
    h.result = { permitHits: [], permitError: '', hits: [{ vehicle: { id: 'v1', registration: 'AB12CDE' }, standing: 'authorised',
      bay: { ref: 'L/PK/22' }, agreement: { reference: 'PA-0001', status: 'active' }, holder: { display_name: 'J Smith', phone: '0123' } }] };
    render(PlateCheck);
    await screen.findByPlaceholderText('Or type it');
    await fireEvent.input(screen.getByPlaceholderText('Or type it'), { target: { value: 'AB12 CDE' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    const card = await screen.findByTestId('car-check-result');
    expect(card.dataset.tone).toBe('ok');
    expect(card.textContent).toMatch(/L\/PK\/22/);
    expect(card.textContent).toMatch(/J Smith/);
  });

  it('⛔ part of a registration is not that car: "XC" is Not found, and XCVB 675 is listed as another car', async () => {
    h.result = { hits: [], permitError: '', permitHits: [{ permit: { id: 'p1', registration: 'XCVB 675', permit_number: 101, company: 'Acme',
      valid_from: '2000-01-01', valid_to: '2999-01-01' }, status: 'current' }] };
    render(PlateCheck);
    await fireEvent.input(await screen.findByPlaceholderText('Or type it'), { target: { value: 'xc' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    const card = await screen.findByTestId('car-check-result');
    expect(card.dataset.tone).toBe('none');
    expect(card.textContent).toMatch(/Not found/);
    expect(card.textContent).not.toMatch(/Allowed/);
    expect(screen.getByTestId('car-check-others').textContent).toMatch(/XCVB 675/);
  });

  it('with no signal it says what it checked against, and still checks', async () => {
    h.online.set(false);
    h.result = { hits: [], permitHits: [], permitError: '' };
    render(PlateCheck);
    await screen.findByPlaceholderText('Or type it');
    await fireEvent.input(screen.getByPlaceholderText('Or type it'), { target: { value: 'AB12CDE' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => expect(h.checked).toEqual([['AB12CDE', { offline: true }]]));
    expect((await screen.findByTestId('car-check-result')).textContent).toMatch(/no signal/i);
  });

  it('Not found offers Record this car; it saves where, the note and nothing else typed', async () => {
    h.result = { hits: [], permitHits: [], permitError: '' };
    render(PlateCheck);
    await checkTyped('zz99 zzz');
    await fireEvent.click(screen.getByRole('button', { name: 'Record this car' }));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(true);                  // where, first
    await fireEvent.click(screen.getByLabelText('Side road'));
    await fireEvent.input(screen.getByRole('textbox', { name: 'Notes' }), { target: { value: 'on the corner' } });
    await fireEvent.click(save);
    await waitFor(() => expect(h.recorded).toHaveLength(1));
    expect(h.recorded[0]).toMatchObject({ registration: 'zz99 zzz', place: 'road', notes: 'on the corner', photo: null });
    expect((await screen.findByRole('status')).textContent).toMatch(/Recorded at/);
  });

  it('an allowed car is not offered for recording', async () => {
    h.result = { hits: [], permitError: '', permitHits: [{ permit: { id: 'p1', registration: 'AB12CDE', permit_number: 7, company: 'Acme',
      valid_from: '2000-01-01', valid_to: '2999-01-01' }, status: 'current' }] };
    render(PlateCheck);
    expect((await checkTyped('AB12CDE')).dataset.tone).toBe('ok');
    expect(screen.queryByRole('button', { name: 'Record this car' })).toBeNull();
  });

  it('shows the car’s earlier sightings — of the whole registration only', async () => {
    h.sightings.set({ error: null, sightings: [
      { id: 's1', registration: 'ZZ99ZZZ', place: 'car_park', seen_at: '2026-10-10T08:00:00Z', notes: 'bay 12', photos: [] },
      { id: 's2', registration: 'ZZ99ZZZA', place: 'road', seen_at: '2026-10-11T08:00:00Z', notes: 'other car', photos: [] },
    ] });
    h.result = { hits: [], permitHits: [], permitError: '' };
    render(PlateCheck);
    await checkTyped('ZZ99 ZZZ');
    const hist = screen.getByTestId('sighting-history');
    expect(hist.textContent).toMatch(/Seen here before — 1 time/);
    expect(hist.textContent).toMatch(/bay 12/);
    expect(hist.textContent).not.toMatch(/other car/);
  });

  it('a sighting still on the phone shows at once, marked not sent yet', async () => {
    h.sync.set({ pending: 1, error: 0, online: false, items: [
      { seq: 1, type: 'sighting', status: 'pending', hasPhoto: true,
        sighting: { id: 'w1', registration: 'ZZ99ZZZ', place: 'road', seen_at: '2026-10-17T22:00:00Z', notes: 'waiting one' } },
    ] });
    h.result = { hits: [], permitHits: [], permitError: '' };
    render(PlateCheck);
    await checkTyped('ZZ99ZZZ');
    expect(screen.getByTestId('sighting-history').textContent).toMatch(/waiting one/);
    expect(screen.getByTestId('sighting-waiting').textContent).toMatch(/not sent yet · with photo/);
    expect(screen.getByTestId('offline-queue-status').textContent).toMatch(/1 record waiting/);
    h.sync.set({ pending: 0, error: 0 });
  });
});
