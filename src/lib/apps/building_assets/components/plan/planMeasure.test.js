// src/lib/apps/building_assets/components/plan/planMeasure.test.js
// Focused tests for the geometry primitives added for space membership.
// (The measurement helpers are exercised via SpaceDetailSidebar; these cover the
//  two new pure predicates that membership resolution depends on.)

import { describe, it, expect } from 'vitest';
import { pointInPolygon, distanceToPolygon, labelWidthAt, centroid } from './planMeasure.js';

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

describe('labelWidthAt — how wide a centred label may be inside its shape', () => {
  const rect = [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.6, y: 0.4 }, { x: 0.2, y: 0.4 }];

  it('a rectangle allows its full width at the centre', () => {
    expect(labelWidthAt(rect, centroid(rect))).toBeCloseTo(0.4, 6);
  });

  it('off-centre, only as far as the nearer side allows, so the centred label stays inside', () => {
    expect(labelWidthAt(rect, { x: 0.3, y: 0.3 })).toBeCloseTo(0.2, 6);
  });

  it('an L-shape is measured through the point, not by its outer box', () => {
    // 0.0–1.0 wide at the bottom, only 0.0–0.2 wide at the top
    const L = [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.2, y: 0.8 }, { x: 1, y: 0.8 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(labelWidthAt(L, { x: 0.1, y: 0.4 })).toBeCloseTo(0.2, 6);
  });

  it('no cap when the point is outside the shape, or the shape is not a shape', () => {
    const C = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.8 }, { x: 1, y: 0.8 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(labelWidthAt(C, { x: 0.6, y: 0.5 })).toBeNull();
    expect(labelWidthAt([{ x: 0, y: 0 }, { x: 1, y: 1 }], { x: 0.5, y: 0.5 })).toBeNull();
  });
});
