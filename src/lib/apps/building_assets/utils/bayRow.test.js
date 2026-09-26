// src/lib/apps/building_assets/utils/bayRow.test.js
import { describe, it, expect } from 'vitest';
import { splitQuad, longSide, bayNumbers, numberClashes, validateRow } from './bayRow.js';
import { measureArea } from '../components/plan/planMeasure.js';

// A 0.4 × 0.1 row on a square plan: long along x.
const row = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.2 }, { x: 0.1, y: 0.2 }];

describe('splitQuad', () => {
  it('cuts a row into equal bays along the chosen side, in order', () => {
    const bays = splitQuad(row, 4, 0);
    expect(bays).toHaveLength(4);
    expect(bays[0][0]).toEqual({ x: 0.1, y: 0.1 });
    expect(bays[0][1].x).toBeCloseTo(0.2);
    expect(bays[3][1]).toEqual({ x: 0.5, y: 0.1 });
    for (const b of bays) expect(measureArea(b, 1, 1)).toBeCloseTo(0.01);
  });

  // The whole point: the bays tile the outline, no gaps and no overlaps.
  it('the bays together cover exactly the outline', () => {
    for (const side of [0, 1]) {
      const total = splitQuad(row, 7, side).reduce((t, b) => t + measureArea(b, 1, 1), 0);
      expect(total).toBeCloseTo(measureArea(row, 1, 1), 10);
    }
  });

  it('follows a row drawn at an angle', () => {
    const slanted = [{ x: 0, y: 0 }, { x: 0.4, y: 0.4 }, { x: 0.35, y: 0.45 }, { x: -0.05, y: 0.05 }];
    const bays = splitQuad(slanted, 2, 0);
    expect(bays[0][1].x).toBeCloseTo(0.2);
    expect(bays[0][1].y).toBeCloseTo(0.2);
  });

  it('refuses anything that is not four corners', () => {
    expect(() => splitQuad(row.slice(0, 3), 2)).toThrow(/four corners/);
    expect(() => splitQuad(row, 0)).toThrow(/how many/);
  });
});

describe('longSide', () => {
  it('finds the long pair of sides, allowing for the plan aspect ratio', () => {
    expect(longSide(row, 1)).toBe(0);
    const tall = [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.5 }, { x: 0.1, y: 0.5 }];
    expect(longSide(tall, 1)).toBe(1);
    // On a very wide image, x distances count for more.
    expect(longSide(tall, 10)).toBe(0);
  });
});

describe('numbering', () => {
  it('numbers from a start in steps, with an optional prefix', () => {
    expect(bayNumbers(3, 22, 1)).toEqual(['22', '23', '24']);
    expect(bayNumbers(3, 2, 2)).toEqual(['2', '4', '6']);
    expect(bayNumbers(2, 1, 1, 'B')).toEqual(['B1', 'B2']);
  });

  // A reference is floor/PK/number: two bays with one number on one floor would share it.
  it('finds numbers already used by a bay on the same floor, ignoring case and other floors', () => {
    const spaces = [
      { id: 's1', kind: 'slot', floor_id: 'L', assigned_id: '22' },
      { id: 's2', kind: 'slot', floor_id: 'U', assigned_id: '23' },
      { id: 's3', kind: 'space', floor_id: 'L', assigned_id: '24' },
      { id: 's4', kind: 'slot', floor_id: 'L', assigned_id: 'b1' },
    ];
    expect(numberClashes(['22', '23', '24', 'B1'], spaces, 'L')).toEqual(['22', 'B1']);
    expect(numberClashes(['22'], spaces, 'L', 's1')).toEqual([]);   // the outline itself
  });
});

describe('validateRow', () => {
  it('accepts a sensible row and refuses a bad one', () => {
    expect(validateRow(row, { count: '10', start: '1', step: '1' })).toBeNull();
    expect(validateRow(row, { count: '0', start: '1', step: '1' })).toMatch(/how many/);
    expect(validateRow(row, { count: '2.5', start: '1', step: '1' })).toMatch(/whole number/);
    expect(validateRow(row, { count: '101', start: '1', step: '1' })).toMatch(/100/);
    expect(validateRow(row, { count: '3', start: '1', step: '0' })).toMatch(/steps/);
    expect(validateRow(row.slice(0, 3), { count: '3', start: '1', step: '1' })).toMatch(/four corners/);
  });
});
