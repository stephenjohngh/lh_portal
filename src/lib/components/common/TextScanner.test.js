// @vitest-environment jsdom
//
// The shared camera reader (2026-10-10). jsdom has no camera, which is also
// the case it must handle on a phone that refuses one: it says so and offers
// a photo instead. The reader is mocked; what is tested is what the person
// sees and what is handed back.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

const h = vi.hoisted(() => ({ text: '', reads: /** @type {any[]} */ ([]) }));

vi.mock('#lib/utils/textScan/ocrReader.js', () => ({
  startReader: async () => ({}),
  readText: async (_img, profile, opts) => { h.reads.push({ profile, opts }); return { text: h.text, confidence: 80 }; },
  warmReader: async () => {},
}));

import TextScanner from './TextScanner.svelte';

const CANDIDATES = [
  { value: 'AB12 CDE', label: 'car park' },
  { value: 'XY70 ZZZ', label: 'road permit' },
];

function fakeCanvas() {
  const ctx = {
    drawImage: () => {},
    getImageData: (_x, _y, w, hgt) => ({ data: new Uint8ClampedArray(Math.max(1, w * hgt) * 4) }),
    putImageData: () => {},
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => /** @type {any} */ (ctx));
  globalThis.createImageBitmap = /** @type {any} */ (async () => ({ width: 400, height: 300 }));
}

async function takePhoto() {
  const input = /** @type {HTMLInputElement} */ (screen.getByLabelText(/Take a photo/));
  const file = new File(['x'], 'plate.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await fireEvent.change(input);
  for (let i = 0; i < 6; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  await tick();
}

describe('TextScanner', () => {
  beforeEach(() => { cleanup(); h.reads.length = 0; h.text = ''; fakeCanvas(); });

  it('with no camera, says so and offers a photo; says nothing leaves the phone', async () => {
    render(TextScanner, { profile: 'registration', candidates: CANDIDATES });
    await tick(); await tick();
    expect(screen.getByRole('alert').textContent).toMatch(/Take a photo below/);
    expect(screen.getByLabelText(/Take a photo/)).toBeTruthy();
    expect(screen.getByText(/the picture is not sent or kept/)).toBeTruthy();
  });

  it('offers the known value a misread plate could be, and hands back the one picked', async () => {
    h.text = 'A812 CDE';
    const picked = vi.fn();
    render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES }, events: { pick: (e) => picked(e.detail) } });
    await takePhoto();
    expect(h.reads[0].opts).toEqual({ wholePicture: true });
    const match = await screen.findByRole('button', { name: /AB12 CDE/ });
    expect(match.textContent).toMatch(/close match/);
    expect(screen.queryByRole('button', { name: /XY70 ZZZ/ })).toBeNull();
    await fireEvent.click(match);
    expect(picked).toHaveBeenCalledWith(expect.objectContaining({ value: 'AB12 CDE' }));
  });

  it('a value on no list can still be used as read', async () => {
    h.text = 'KL55 MNP';
    const picked = vi.fn();
    render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES }, events: { pick: (e) => picked(e.detail) } });
    await takePhoto();
    await fireEvent.click(await screen.findByRole('button', { name: 'Use “KL55MNP”' }));
    expect(picked).toHaveBeenCalledWith({ value: 'KL55MNP', candidate: null });
  });

  it('a new read replaces the old answer; an unreadable one keeps it', async () => {
    h.text = 'AB12 CDE';
    render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES } });
    await takePhoto();
    expect(await screen.findByRole('button', { name: /AB12 CDE/ })).toBeTruthy();
    h.text = '~ ~';                              // nothing readable: keep it
    await takePhoto();
    expect(screen.getByRole('button', { name: /AB12 CDE/ })).toBeTruthy();
    h.text = 'KL55 MNP';                         // another plate, on no list: the old one goes
    await takePhoto();
    expect(screen.queryByRole('button', { name: /AB12 CDE/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Use “KL55MNP”' })).toBeTruthy();
  });

  it('camera refused on an iPhone: says which settings, and Try again opens it once allowed', async () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    let allowed = false;
    const fakeStream = { getVideoTracks: () => [{ getCapabilities: () => ({}) }], getTracks: () => [{ stop: () => {} }] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => {
        if (!allowed) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
        return fakeStream;
      },
    } });
    try {
      render(TextScanner, { props: { profile: 'registration' } });
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/not allowed for this site/);
      expect(alert.textContent).toMatch(/Website Settings/);
      allowed = true;
      await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      for (let i = 0; i < 4; i++) await tick();
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      ua.mockRestore();
      delete (/** @type {any} */ (navigator)).mediaDevices;
    }
  });

  it('Close says so', async () => {
    const closed = vi.fn();
    render(TextScanner, { props: { profile: 'number' }, events: { close: closed } });
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toHaveBeenCalled();
  });
});
