// @vitest-environment jsdom
//
// src/lib/apps/inspection/components/InspectionJumpList.test.js
//
// TYPE-2 test. Written to answer one question: do the walk counters update as
// components are inspected?
//
// ⚠ The shape under test is Svelte's reactive dependency analysis, which is
// SYNTACTIC on the statement. `$: passCount = components.filter(c =>
// getResult(c) === 'ok').length` mentions `components` and `getResult` — it
// never mentions `inspections`, which `getResult` reads through a closure. So
// the statement does not depend on `inspections`, and during a walk it is
// precisely `inspections` that changes while `components` stays put.
//
// Assertions are on rendered TEXT, not internals.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';

vi.mock('$app/env', () => ({ browser: true, dev: true, building: false }));

// The camera reader: what it "reads" is set by the test.
const readerText = vi.hoisted(() => ({ value: '' }));
vi.mock('#lib/utils/textScan/ocrReader.js', () => ({
  startReader: async () => ({}),
  readText: async () => ({ text: readerText.value, confidence: 80 }),
  warmReader: async () => {},
}));

const JumpList = (await import('./InspectionJumpList.svelte')).default;

const COMPONENTS = [
  { id: 'c1', type_code: 'door_fire_door', label: 'Door 1', schematic_id: null, floor_id: 'f1' },
  { id: 'c2', type_code: 'door_fire_door', label: 'Door 2', schematic_id: null, floor_id: 'f1' },
  { id: 'c3', type_code: 'door_fire_door', label: 'Door 3', schematic_id: null, floor_id: 'f1' },
];
const TYPES  = [{ code: 'door_fire_door', name: 'Fire door', colour: 'ff0000', initial: 'F', id: 't1' }];
const FLOORS = [{ id: 'f1', name: 'Ground', short_name: 'G' }];

const base = { components: COMPONENTS, types: TYPES, floors: FLOORS, currentIndex: 0 };

beforeEach(() => { cleanup(); vi.clearAllMocks(); });

describe('InspectionJumpList — the counters follow the walk', () => {
  it('starts at nothing inspected', () => {
    render(JumpList, { ...base, inspections: {} });
    expect(screen.getByText('0/3')).toBeInTheDocument();
  });

  it('counts results that are present at first render', () => {
    render(JumpList, {
      ...base,
      inspections: {
        c1: { id: 'i1', inspection_result: 'ok' },
        c2: { id: 'i2', inspection_result: 'failed' },
      },
    });
    expect(screen.getByText('✓ 1')).toBeInTheDocument();
    expect(screen.getByText('✗ 1')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('UPDATES when a component is inspected — the walk list itself never changes', async () => {
    // The regression. During a walk `components` is fixed and `inspections`
    // grows, so a counter that depends only on `components` freezes on screen
    // while the walk carries on underneath it.
    const { rerender } = render(JumpList, { ...base, inspections: {} });
    expect(screen.getByText('0/3')).toBeInTheDocument();

    await rerender({ ...base, inspections: { c1: { id: 'i1', inspection_result: 'ok' } } });

    expect(screen.getByText('✓ 1')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('updates each result bucket independently', async () => {
    const { rerender } = render(JumpList, { ...base, inspections: {} });

    await rerender({ ...base, inspections: {
      c1: { id: 'i1', inspection_result: 'ok' },
      c2: { id: 'i2', inspection_result: 'failed' },
      c3: { id: 'i3', inspection_result: 'problem' },
    } });

    expect(screen.getByText('✓ 1')).toBeInTheDocument();
    expect(screen.getByText('✗ 1')).toBeInTheDocument();
    expect(screen.getByText('⚙ 1')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
  });

  it('shows a result badge on the row once that component is inspected', async () => {
    const { rerender } = render(JumpList, { ...base, inspections: {} });
    await rerender({ ...base, inspections: { c2: { id: 'i2', inspection_result: 'failed' } } });

    // Per-row state is read through the same helpers, so it has the same
    // exposure as the counters.
    expect(screen.getByText(/fail/i)).toBeInTheDocument();
  });

  it('shows the offline sync glyph when sync state arrives after the inspection', async () => {
    // syncByInsp is read through getSync() and changes on its own schedule —
    // the server round-trip — so it moves with neither `components` nor
    // `inspections`.
    const inspections = { c1: { id: 'i1', inspection_result: 'ok' } };
    const { rerender } = render(JumpList, { ...base, inspections, syncByInsp: {} });

    await rerender({ ...base, inspections, syncByInsp: { i1: 'pending' } });

    expect(screen.getByTitle(/not yet synced/i)).toBeInTheDocument();
  });
});

describe('InspectionJumpList — scan a door number to jump to it', () => {
  it('a scanned number on this walk jumps to that component; one on no component says so', async () => {
    const { fireEvent, waitFor } = await import('@testing-library/svelte');
    const ctx = { drawImage: () => {}, putImageData: () => {},
      getImageData: (_x, _y, w, hh) => ({ data: new Uint8ClampedArray(Math.max(1, w * hh) * 4) }) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => /** @type {any} */ (ctx));
    globalThis.createImageBitmap = /** @type {any} */ (async () => ({ width: 400, height: 300 }));
    readerText.value = 'DOOR 2';
    const jumps = [];
    render(JumpList, { props: { ...base, inspections: {} }, events: { jump: (e) => jumps.push(e.detail) } });

    const photo = async () => {
      const input = /** @type {HTMLInputElement} */ (screen.getByLabelText(/Take a photo/));
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'd.jpg', { type: 'image/jpeg' })], configurable: true });
      await fireEvent.change(input);
    };
    await fireEvent.click(screen.getByRole('button', { name: 'Scan a door or tag number' }));
    await photo();
    await fireEvent.click(await screen.findByRole('button', { name: /^Door 2/ }));
    expect(jumps).toEqual([{ index: 1 }]);

    readerText.value = 'DOOR 9';
    await fireEvent.click(screen.getByRole('button', { name: 'Scan a door or tag number' }));
    await photo();
    await fireEvent.click(await screen.findByRole('button', { name: 'Use “DOOR9”' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Nothing on this walk is numbered “DOOR9”/));
    expect(jumps).toHaveLength(1);
  });
});
