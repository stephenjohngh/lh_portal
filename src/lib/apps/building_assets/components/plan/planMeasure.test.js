// src/lib/apps/building_assets/components/plan/planMeasure.test.js
// Focused tests for the geometry primitives added for space membership.
// (The measurement helpers are exercised via SpaceDetailSidebar; these cover the
//  two new pure predicates that membership resolution depends on.)

import { describe, it, expect } from 'vitest';
import { pointInPolygon, distanceToPolygon } from './planMeasure.js';

const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

describe('pointInPolygon', () => {
  it('is true inside and false outside', () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 1.5, y: 0.5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -0.1, y: 0.5 }, square)).toBe(false);
  });

  it('returns false for degenerate / missing inputs', () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
    expect(pointInPolygon(null, square)).toBe(false);
  });

  it('handles a concave (L-shaped) polygon', () => {
    const L = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.4 },
      { x: 0.4, y: 0.4 }, { x: 0.4, y: 1 }, { x: 0, y: 1 },
    ];
    expect(pointInPolygon({ x: 0.2, y: 0.8 }, L)).toBe(true);   // inside the leg
    expect(pointInPolygon({ x: 0.8, y: 0.8 }, L)).toBe(false);  // inside the notch
  });
});

describe('distanceToPolygon', () => {
  it('measures distance to the nearest edge (AR = 1)', () => {
    expect(distanceToPolygon({ x: 1.1, y: 0.5 }, square, 1)).toBeCloseTo(0.1, 6);
  });

  it('applies AR correction to the x axis', () => {
    // same 0.1 x-gap, AR = 2 → 0.2 in normalised-height space
    expect(distanceToPolygon({ x: 1.1, y: 0.5 }, square, 2)).toBeCloseTo(0.2, 6);
  });

  it('returns ~0 for a point on an edge', () => {
    expect(distanceToPolygon({ x: 1, y: 0.5 }, square, 1)).toBeCloseTo(0, 6);
  });

  it('returns Infinity for a degenerate polygon', () => {
    expect(distanceToPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }], 1)).toBe(Infinity);
  });
});
