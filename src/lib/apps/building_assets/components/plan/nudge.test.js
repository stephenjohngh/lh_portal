// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { arrowDelta, nudgePoint, nudgePolygon, keyBelongsToFocus } from './nudge.js';

const size = { width: 1000, height: 500 };

describe('arrowDelta', () => {
  it('moves one pixel of the drawn canvas per press', () => {
    expect(arrowDelta('ArrowRight', false, size)).toEqual({ dx: 0.001, dy: 0 });
    expect(arrowDelta('ArrowLeft', false, size)).toEqual({ dx: -0.001, dy: 0 });
    expect(arrowDelta('ArrowDown', false, size)).toEqual({ dx: 0, dy: 0.002 });
    expect(arrowDelta('ArrowUp', false, size)).toEqual({ dx: 0, dy: -0.002 });
  });
  it('moves ten pixels with Shift', () => {
    expect(arrowDelta('ArrowRight', true, size)).toEqual({ dx: 0.01, dy: 0 });
  });
  it('ignores other keys, and a canvas with no size', () => {
    expect(arrowDelta('a', false, size)).toBeNull();
    expect(arrowDelta('ArrowRight', false, { width: 0, height: 0 })).toBeNull();
  });
});

describe('nudgePoint', () => {
  it('moves and stays on the drawing', () => {
    expect(nudgePoint({ x: 0.5, y: 0.5 }, { dx: 0.001, dy: 0 })).toEqual({ x: 0.501, y: 0.5 });
    expect(nudgePoint({ x: 0, y: 1 }, { dx: -0.01, dy: 0.01 })).toEqual({ x: 0, y: 1 });
  });
});

describe('nudgePolygon', () => {
  const sq = [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.2 }, { x: 0.3, y: 0.3 }, { x: 0.2, y: 0.3 }];
  it('moves every corner by the same amount', () => {
    const out = nudgePolygon(sq, { dx: 0.01, dy: 0 });
    out.forEach((p, i) => { expect(p.x).toBeCloseTo(sq[i].x + 0.01); expect(p.y).toBeCloseTo(sq[i].y); });
  });
  it('stops at the edge without changing the shape', () => {
    const atEdge = sq.map(p => ({ x: p.x + 0.7, y: p.y }));   // right edge at 1
    const out = nudgePolygon(atEdge, { dx: 0.01, dy: 0 });
    out.forEach((p, i) => expect(p.x).toBeCloseTo(atEdge[i].x));
    const w = Math.max(...out.map(p => p.x)) - Math.min(...out.map(p => p.x));
    expect(w).toBeCloseTo(0.1);
  });
});

describe('keyBelongsToFocus', () => {
  it('leaves arrows to boxes and arrow-driven controls', () => {
    const input = document.createElement('input');
    const group = document.createElement('div'); group.setAttribute('role', 'radiogroup');
    const radio = document.createElement('button'); group.appendChild(radio);
    expect(keyBelongsToFocus(input)).toBe(true);
    expect(keyBelongsToFocus(radio)).toBe(true);
    expect(keyBelongsToFocus(document.body)).toBe(false);
    expect(keyBelongsToFocus(document.createElement('button'))).toBe(false);
  });
});
