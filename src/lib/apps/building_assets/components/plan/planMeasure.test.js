// src/lib/apps/building_assets/components/plan/planMeasure.test.js
// Focused tests for the geometry primitives added for space membership.
// (The measurement helpers are exercised via SpaceDetailSidebar; these cover the
//  two new pure predicates that membership resolution depends on.)

import { describe, it, expect } from 'vitest';
import { pointInPolygon, distanceToPolygon, labelSlotAt, LABEL_SIDE_MARGIN, centroid } from './planMeasure.js';

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

describe('labelSlotAt — where a label goes across its shape, and how wide', () => {
  const rect = [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.6, y: 0.4 }, { x: 0.2, y: 0.4 }];
  const inner = (span) => span * (1 - 2 * LABEL_SIDE_MARGIN);

  it('a rectangle: centred across it, its width less a margin each side', () => {
    const s = labelSlotAt(rect, centroid(rect));
    expect(s.x).toBeCloseTo(0.4, 6);
    expect(s.width).toBeCloseTo(inner(0.4), 6);
    expect(s.width).toBeLessThan(0.4);
  });

  it('an off-centre point still gets the whole span — the label moves across, not shrinks', () => {
    const s = labelSlotAt(rect, { x: 0.25, y: 0.3 });
    expect(s.x).toBeCloseTo(0.4, 6);
    expect(s.width).toBeCloseTo(inner(0.4), 6);
  });

  it('an L-shape is measured through the point, not by its outer box', () => {
    const L = [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.2, y: 0.8 }, { x: 1, y: 0.8 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const s = labelSlotAt(L, { x: 0.1, y: 0.4 });
    expect(s.x).toBeCloseTo(0.1, 6);
    expect(s.width).toBeCloseTo(inner(0.2), 6);
  });

  it('no slot when the point is outside the shape, or the shape is not a shape', () => {
    const C = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.8 }, { x: 1, y: 0.8 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(labelSlotAt(C, { x: 0.6, y: 0.5 })).toBeNull();
    expect(labelSlotAt([{ x: 0, y: 0 }, { x: 1, y: 1 }], { x: 0.5, y: 0.5 })).toBeNull();
  });
});
