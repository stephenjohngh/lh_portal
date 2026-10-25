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

const { createSpaceEditController, rectangleCorners, isUsableRectangle } = await import('./spaceEditController.js');

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

describe('Rectangle drawing (2026-10-23): press on one corner, pull to the opposite, release', () => {
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 500 }) };
  let drawn;
  beforeEach(() => {
    drawn = 0;
    ctrl = createSpaceEditController({
      getCanvas: () => canvas, getSelectedSpace: () => null, getPlanSpaces: () => [],
      getDrawingMode: () => 'space', setSelectedSpace: () => {}, setError: () => {},
      onRectangleDrawn: () => { drawn++; },
    });
  });
  const move = (x, y) => ctrl.onMousemove({ clientX: x, clientY: y });

  it('rectangleCorners is the same whichever way it is pulled', () => {
    const want = [{ x: 0.2, y: 0.1 }, { x: 0.6, y: 0.1 }, { x: 0.6, y: 0.4 }, { x: 0.2, y: 0.4 }];
    expect(rectangleCorners({ x: 0.2, y: 0.1 }, { x: 0.6, y: 0.4 })).toEqual(want);
    expect(rectangleCorners({ x: 0.6, y: 0.4 }, { x: 0.2, y: 0.1 })).toEqual(want);
    expect(rectangleCorners({ x: 0.6, y: 0.1 }, { x: 0.2, y: 0.4 })).toEqual(want);
  });

  it('the four corners follow the pointer while pulling, and drawing finishes on release', async () => {
    ctrl.startRectangle({ x: 0.1, y: 0.2 });
    move(500, 250);                                  // 0.5, 0.5
    expect(get(ctrl.drawingVertices)).toEqual([{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }]);
    await ctrl.onMouseup();
    expect(drawn).toBe(1);
    expect(get(ctrl.drawingVertices)).toHaveLength(4);
  });

  it('keeps the pointer on the schematic', () => {
    ctrl.startRectangle({ x: 0.5, y: 0.5 });
    move(5000, -300);
    expect(get(ctrl.drawingVertices)).toEqual([{ x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 0.5 }]);
  });

  it('a stray click, with no pull, draws nothing', async () => {
    ctrl.startRectangle({ x: 0.3, y: 0.3 });
    move(300, 150);
    await ctrl.onMouseup();
    expect(drawn).toBe(0);
    expect(get(ctrl.drawingVertices)).toEqual([]);
    expect(isUsableRectangle(rectangleCorners({ x: 0.3, y: 0.3 }, { x: 0.3, y: 0.5 }))).toBe(false);
  });

  it('a mouse move with no button down changes nothing', () => {
    move(400, 200);
    expect(get(ctrl.drawingVertices)).toEqual([]);
  });

  it('cancelling drops a pull in progress', () => {
    ctrl.startRectangle({ x: 0.1, y: 0.1 });
    ctrl.cancelDrawing();
    move(600, 300);
    expect(get(ctrl.drawingVertices)).toEqual([]);
  });

  it('pulling again replaces the rectangle', async () => {
    ctrl.startRectangle({ x: 0.1, y: 0.1 }); move(300, 200); await ctrl.onMouseup();
    ctrl.startRectangle({ x: 0.5, y: 0.5 }); move(800, 450); await ctrl.onMouseup();
    expect(get(ctrl.drawingVertices)[0]).toEqual({ x: 0.5, y: 0.5 });
    expect(drawn).toBe(2);
  });
});
