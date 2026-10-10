// @vitest-environment jsdom
//
// The Registration Lookup searches the car park AND the road permits
// (2026-10-06), and the admin's permit template panel opens. Both were
// reported as not working after a crashed session; these pin them.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

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
  return { permits: makeStore({}), lookups: [], online: makeStore(true), sync: makeStore({ pending: 0, error: 0 }),
    parking: makeStore({ vehicles: [{ id: 'v1', registration: 'AB12 CDE' }] }), ocrText: '' };
});

vi.mock('#lib/utils/textScan/ocrReader.js', () => ({
  startReader: async () => ({}),
  readText: async () => ({ text: h.ocrText, confidence: 80 }),
  warmReader: async () => {},
}));

vi.mock('#lib/stores/online.js', () => ({ online: { subscribe: h.online.subscribe } }));
vi.mock('../stores/lookupAudit.js', () => ({ syncState: { subscribe: h.sync.subscribe } }));
vi.mock('../stores/parkingStore.js', () => ({
  parkingStore: { subscribe: h.parking.subscribe, lookupRegistration: (q, n, o) => { h.lookups.push([q, n, o]); return []; } },
}));
vi.mock('../stores/permitStore.js', () => ({
  permitStore: {
    subscribe: h.permits.subscribe,
    ensureLoaded: async () => {
      // As the real store: not loaded until read, then the permits arrive.
      if (!h.permits.get().loaded) h.permits.set({ ...h.permits.get(), permits: PERMITS, loaded: true });
    },
    saveTemplate: vi.fn(), setImage: vi.fn(), clearImage: vi.fn(),
  },
  TEMPLATE_IMAGES: {
    background: { column: 'background_document_id', label: 'Background' },
    footer: { column: 'footer_document_id', label: 'Fixed image' },
  },
}));

const PERMITS = [
  { id: 'p2', permit_number: 101, registration: 'ABC 123', company: 'Acme', valid_from: '2999-01-01', valid_to: '2999-01-02' },
  { id: 'p1', permit_number: 100, registration: 'ABC 123', company: 'Acme', valid_from: '2000-01-01', valid_to: '2000-01-07' },
];

import RegistrationSearch from './RegistrationSearch.svelte';
import PermitTemplatePanel from './PermitTemplatePanel.svelte';

describe('Registration Lookup', () => {
  beforeEach(() => {
    cleanup(); h.lookups.length = 0; h.online.set(true); h.sync.set({ pending: 0, error: 0 });
    h.permits.set({ permits: [], template: null, imageUrls: {} });
  });

  it('finds road permits for a registration typed any way, before the permits tab has been opened', async () => {
    render(RegistrationSearch);
    const box = screen.getByLabelText('Registration Lookup:');
    await fireEvent.input(box, { target: { value: 'abc123' } });
    await fireEvent.keyDown(box, { key: 'Enter' });
    await tick(); await tick();
    const results = await screen.findByTestId('registration-results');
    expect(results.textContent).toMatch(/Permit 101 · Acme/);
    expect(results.textContent).toMatch(/Permit 100 · Acme/);
    expect(results.textContent).not.toMatch(/No road permit/);
    expect(h.lookups).toEqual([['abc123', 2, { offline: false }]]);
  });
});

describe('Registration Lookup with no signal', () => {
  beforeEach(() => {
    cleanup(); h.lookups.length = 0;
    h.permits.set({ permits: PERMITS, template: null, imageUrls: {}, loaded: true });
  });

  it('still answers from what the page loaded, says so, and the lookup is recorded later', async () => {
    h.online.set(false);
    h.sync.set({ pending: 1, error: 0 });
    render(RegistrationSearch, { loadedAt: Date.parse('2026-10-10T08:30:00Z') });
    expect(screen.getByText('No signal')).toBeTruthy();
    expect(screen.getByText(/1 lookup not yet recorded/)).toBeTruthy();
    const box = screen.getByLabelText('Registration Lookup:');
    await fireEvent.input(box, { target: { value: 'ABC 123' } });
    await fireEvent.keyDown(box, { key: 'Enter' });
    const results = await screen.findByTestId('registration-results');
    expect(results.textContent).toMatch(/No signal — checked against the car park as loaded at 09:30/);
    expect(results.textContent).toMatch(/recorded when the signal returns/);
    expect(results.textContent).toMatch(/Permit 101 · Acme/);
    expect(h.lookups).toEqual([['ABC 123', 2, { offline: true }]]);
  });
});

describe('Scanning a number plate', () => {
  beforeEach(() => {
    cleanup(); h.lookups.length = 0; h.online.set(true); h.sync.set({ pending: 0, error: 0 });
    h.permits.set({ permits: PERMITS, template: null, imageUrls: {}, loaded: true });
    const ctx = { drawImage: () => {}, putImageData: () => {},
      getImageData: (_x, _y, w, hh) => ({ data: new Uint8ClampedArray(Math.max(1, w * hh) * 4) }) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => /** @type {any} */ (ctx));
    globalThis.createImageBitmap = /** @type {any} */ (async () => ({ width: 400, height: 300 }));
  });

  it('offers the registrations this page knows — car park and road permits — and searches the one picked', async () => {
    h.ocrText = 'ABC I23';                     // a road permit's plate, misread
    render(RegistrationSearch);
    await fireEvent.click(screen.getByRole('button', { name: /Scan/ }));
    expect(await screen.findByTestId('text-scanner')).toBeTruthy();
    const input = /** @type {HTMLInputElement} */ (screen.getByLabelText(/Take a photo/));
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })], configurable: true });
    await fireEvent.change(input);
    const match = await screen.findByRole('button', { name: /ABC 123/ });
    expect(match.textContent).toMatch(/road permit/);
    await fireEvent.click(match);
    await tick(); await tick();
    expect(screen.queryByTestId('text-scanner')).toBeNull();
    expect(h.lookups).toEqual([['ABC 123', 2, { offline: false }]]);
  });
});

describe('Permit template panel', () => {
  beforeEach(() => cleanup());

  it('opens on a click and shows the template', async () => {
    h.permits.set({ permits: [], imageUrls: {}, loaded: true,
      template: { id: 't1', updated_at: '2026-10-06', title: 'Parking Permit', first_number: 100,
        default_from_time: '07:00:00', default_to_time: '19:00:00' } });
    render(PermitTemplatePanel, { building: { name: 'The building' } });
    await fireEvent.click(screen.getByRole('button', { name: /Permit template/ }));
    await tick();
    expect(/** @type {HTMLInputElement} */ (screen.getByLabelText('Title')).value).toBe('Parking Permit');
  });
});
