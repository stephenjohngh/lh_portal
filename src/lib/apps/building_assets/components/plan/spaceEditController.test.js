// Typing a corner's position (2026-10-12): setVertex moves one corner, keeps it
// on the schematic, rounds it as a drag would be, and saves.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get, writable } from 'svelte/store';

const h = vi.hoisted(() => ({ saved: [] }));
vi.mock('../../stores/buildingAssetsStore.js', async () => {
  const { writable: w } = await import('svelte/store');
  const s = w({ spaces: [] });
  return {
    buildingAssetsStore: {
      subscribe: s.subscribe,
      updateSpacePolygon: vi.fn(async (id, polygon) => {
        h.saved.push({ id, polygon });
        s.update(st => ({ ...st, spaces: [{ id, polygon }] }));
      }),
    },
  };
});

const { createSpaceEditController } = await import('./spaceEditController.js');

const square = [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }, { x: 0.1, y: 0.3 }];
let selected, ctrl;

beforeEach(() => {
  h.saved = [];
  selected = { id: 's1', polygon: square };
  ctrl = createSpaceEditController({
    getCanvas: () => null,
    getSelectedSpace: () => selected,
    getPlanSpaces: () => [{ id: 's1', polygon: square }],
    getDrawingMode: () => 'space',
    setSelectedSpace: v => { selected = v; },
    setError: msg => { throw new Error(msg); },
  });
});

describe('setVertex — a corner typed exactly', () => {
  it('moves only that corner, and saves the shape', async () => {
    ctrl.onEditShape();
    await ctrl.setVertex(2, '0.4567', '0.35');
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0].polygon).toEqual([square[0], square[1], { x: 0.457, y: 0.35 }, square[3]]);
    expect(get(ctrl.editingPolygon).vertices[2]).toEqual({ x: 0.457, y: 0.35 });
    expect(selected.polygon[2]).toEqual({ x: 0.457, y: 0.35 });
  });

  it('keeps a corner on the schematic, and ignores a box left blank', async () => {
    ctrl.onEditShape();
    await ctrl.setVertex(0, '1.7', '-0.2');
    expect(h.saved[0].polygon[0]).toEqual({ x: 1, y: 0 });
    await ctrl.setVertex(1, '', '0.2');
    expect(h.saved[1].polygon[1]).toEqual({ x: 0.3, y: 0.2 });
  });

  it('does nothing unless Edit shape is on', async () => {
    await ctrl.setVertex(0, '0.5', '0.5');
    expect(h.saved).toHaveLength(0);
  });
});
