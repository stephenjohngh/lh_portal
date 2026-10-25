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
    createImageData: (w, hgt) => ({ data: new Uint8ClampedArray(Math.max(1, w * hgt) * 4) }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => /** @type {any} */ (ctx));
  globalThis.createImageBitmap = /** @type {any} */ (async () => ({ width: 400, height: 300 }));
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==');
}

async function takePhoto() {
  const input = /** @type {HTMLInputElement} */ (screen.getByLabelText(/Take (a|another) photo/));
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

  it('on a live camera it shows it is working: a sweep, what it can see, and a status', async () => {
    const { waitFor } = await import('@testing-library/svelte');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(/** @type {any} */ ({ width: 375, height: 600 }));
    const fakeStream = { getVideoTracks: () => [{ getCapabilities: () => ({}) }], getTracks: () => [{ stop: () => {} }] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => fakeStream } });
    h.text = 'XY7';                          // part of a plate — on no list, and no plate format changes it
    try {
      render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES } });
      expect(await screen.findByTestId('scan-sweep')).toBeTruthy();
      await waitFor(() => expect(screen.getByTestId('scan-seeing').textContent).toMatch(/XY7/), { timeout: 3000 });
      expect(screen.getByTestId('scan-status').textContent).toMatch(/Reading|keep it steady/);
      expect(screen.getByTestId('text-scanner').querySelector('[data-state]')?.getAttribute('data-state')).toBe('seeing');
    } finally {
      delete (/** @type {any} */ (navigator)).mediaDevices;
      vi.restoreAllMocks();
    }
  });

  it('a photo taken while the camera is live keeps its result — live frames do not replace it (2026-10-12)', async () => {
    const { waitFor } = await import('@testing-library/svelte');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(/** @type {any} */ ({ width: 375, height: 600 }));
    let streams = 0;
    const fakeStream = () => ({ getVideoTracks: () => [{ getCapabilities: () => ({}) }], getTracks: () => [{ stop: () => {} }] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { streams++; return fakeStream(); } } });
    h.text = 'ZZ99 ZZZ';                    // what the live camera keeps seeing
    try {
      render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES } });
      await waitFor(() => expect(screen.getByTestId('scan-seeing').textContent).toMatch(/ZZ99ZZZ/), { timeout: 3000 });
      h.text = 'AB12 CDE';                  // the photo
      await takePhoto();
      expect(await screen.findByRole('button', { name: /AB12 CDE/ })).toBeTruthy();
      h.text = 'ZZ99 ZZZ';                  // live frames would read this again…
      const readsAfterPhoto = h.reads.length;
      await new Promise((r) => setTimeout(r, 1200));
      await tick();
      expect(h.reads.length).toBe(readsAfterPhoto);                       // …but none are taken
      expect(screen.getByRole('button', { name: /AB12 CDE/ })).toBeTruthy();
      expect(screen.queryByTestId('scan-sweep')).toBeNull();
      await fireEvent.click(screen.getByRole('button', { name: 'Scan live again' }));
      for (let i = 0; i < 4; i++) await tick();
      expect(streams).toBe(2);                                             // the camera restarted
      expect(screen.queryByRole('button', { name: /AB12 CDE/ })).toBeNull();
    } finally {
      delete (/** @type {any} */ (navigator)).mediaDevices;
      vi.restoreAllMocks();
    }
  });

  it('"What the reader sees" shows the picture it was given and what it read (2026-10-12)', async () => {
    h.text = 'AB12 CDE';
    render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES } });
    await fireEvent.click(screen.getByRole('button', { name: 'What the reader sees' }));
    expect(screen.getByTestId('scan-diagnostics').textContent).toMatch(/Waiting for the next read/);
    await takePhoto();
    const d = screen.getByTestId('scan-diagnostics');
    expect(d.textContent).toMatch(/Camera crop/);
    expect(d.textContent).toMatch(/Given to the reader/);
    expect(d.textContent).toMatch(/Read: AB12 CDE · 80% sure/);
    expect(d.textContent).toMatch(/photo 400×300/);
    expect(d.querySelectorAll('img')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Save pictures' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Hide what the reader sees' }));
    expect(screen.queryByTestId('scan-diagnostics')).toBeNull();
  });

  it('Close says so', async () => {
    const closed = vi.fn();
    render(TextScanner, { props: { profile: 'number' }, events: { close: closed } });
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toHaveBeenCalled();
  });
});

describe('TextScanner verdict mode (2026-10-25, Car check)', () => {
  beforeEach(() => { cleanup(); h.reads.length = 0; h.text = ''; fakeCanvas(); });

  const verdictOf = (headline, tone) => async (value) => ({
    plate: value, tone, headline, title: 'The title', lines: [{ text: 'Bay L/PK/22' }], notes: `Plate read: ${value}` });

  it('the top row is Back, New scan and Debug; the reader pictures only show with Debug on', async () => {
    const closed = vi.fn();
    render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES, checker: verdictOf('No Permit', 'none') }, events: { close: closed } });
    expect(screen.getByTestId('scan-back').textContent).toMatch(/Back/);
    expect(screen.getByTestId('scan-new').textContent).toMatch(/New scan/);
    expect(screen.getByTestId('scan-debug').textContent).toMatch(/Debug: off/);
    expect(screen.queryByTestId('scan-diagnostics')).toBeNull();
    await fireEvent.click(screen.getByTestId('scan-debug'));
    expect(screen.getByTestId('scan-diagnostics')).toBeTruthy();
    expect(screen.getByTestId('scan-debug').textContent).toMatch(/Debug: on/);
    await fireEvent.click(screen.getByTestId('scan-back'));
    expect(closed).toHaveBeenCalled();
  });

  it('shows the best guess with its confidence, then the plate and the answer; tapping opens the details', async () => {
    h.text = 'KL55 MNP';
    render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES, checker: verdictOf('No Permit', 'none') } });
    expect(screen.getByTestId('scan-guess').textContent).toMatch(/Best guess so far/);
    await takePhoto();
    const v = await screen.findByTestId('scan-verdict');
    expect(v.textContent).toMatch(/Read plate: KL55MNP/);
    expect(v.textContent).toMatch(/No Permit/);
    expect(screen.queryByRole('button', { name: /Use “/ })).toBeNull();     // no picking in this mode
    await fireEvent.click(v);
    expect(screen.getByTestId('scan-details').textContent).toMatch(/Bay L\/PK\/22/);
  });

  it('a known plate says Permit Found', async () => {
    h.text = 'AB12 CDE';
    render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES, checker: verdictOf('Permit Found', 'ok') } });
    await takePhoto();
    expect((await screen.findByTestId('scan-verdict')).textContent).toMatch(/Permit Found/);
  });

  it('Create report hands back the plate and the known details, in either case', async () => {
    for (const [headline, tone] of [['Permit Found', 'ok'], ['No Permit', 'none']]) {
      cleanup();
      h.text = 'AB12 CDE';
      const report = vi.fn();
      render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES, canReport: true, checker: verdictOf(headline, tone) }, events: { report: (e) => report(e.detail) } });
      await takePhoto();
      await fireEvent.click(await screen.findByTestId('scan-verdict'));
      await fireEvent.click(screen.getByTestId('scan-create-report'));
      expect(report).toHaveBeenCalledTimes(1);
      expect(report.mock.calls[0][0]).toMatchObject({ value: 'AB12 CDE', notes: 'Plate read: AB12 CDE' });
    }
  });

  it('no Create report for someone who may not make one', async () => {
    h.text = 'AB12 CDE';
    render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES, canReport: false, checker: verdictOf('No Permit', 'none') } });
    await takePhoto();
    await fireEvent.click(await screen.findByTestId('scan-verdict'));
    expect(screen.queryByTestId('scan-create-report')).toBeNull();
  });

  it('New scan clears the answer', async () => {
    h.text = 'AB12 CDE';
    render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES, checker: verdictOf('No Permit', 'none') } });
    await takePhoto();
    await screen.findByTestId('scan-verdict');
    await fireEvent.click(screen.getByTestId('scan-new'));
    await tick();
    expect(screen.queryByTestId('scan-verdict')).toBeNull();
  });

  it('without a checker the old screen is unchanged', () => {
    render(TextScanner, { props: { profile: 'registration', candidates: CANDIDATES } });
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.queryByTestId('scan-back')).toBeNull();
  });
});

describe('TextScanner without the photo button (2026-10-25)', () => {
  beforeEach(() => { cleanup(); fakeCanvas(); });
  it('allowPhoto false: no Take a photo, none in the camera-refused help either', () => {
    render(TextScanner, { props: { profile: 'registration', allowPhoto: false } });
    expect(screen.queryByLabelText(/Take (a|another) photo/)).toBeNull();
  });
  it('by default it is there', () => {
    render(TextScanner, { props: { profile: 'registration' } });
    expect(screen.getByLabelText(/Take a photo/)).toBeTruthy();
  });
});
