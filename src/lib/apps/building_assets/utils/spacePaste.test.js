import { describe, it, expect } from 'vitest';
import { besidePolygon, pastePolygon, nextFreeId, buildPasteRow, polygonBounds } from './spacePaste.js';

const sq = (x, y, w = 0.1, h = 0.05) => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];

describe('besidePolygon', () => {
  it('puts the copy directly to the right, touching', () => {
    const b = polygonBounds(besidePolygon(sq(0.2, 0.3)));
    expect(b.minX).toBeCloseTo(0.3); expect(b.maxX).toBeCloseTo(0.4);
    expect(b.minY).toBeCloseTo(0.3);
  });
  it('goes below when the right would leave the schematic', () => {
    const b = polygonBounds(besidePolygon(sq(0.85, 0.3)));
    expect(b.minX).toBeCloseTo(0.85); expect(b.minY).toBeCloseTo(0.35);
  });
  it('stays on the schematic in the bottom right corner', () => {
    const b = polygonBounds(besidePolygon(sq(0.9, 0.95)));
    expect(b.maxX).toBeLessThanOrEqual(1); expect(b.maxY).toBeLessThanOrEqual(1);
    expect(b.minX).toBeGreaterThanOrEqual(0); expect(b.minY).toBeGreaterThanOrEqual(0);
  });
});

describe('pastePolygon', () => {
  it('pastes in the same place on a schematic where that place is free', () => {
    expect(pastePolygon(sq(0.2, 0.3), [])).toEqual(sq(0.2, 0.3).map(p => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) })));
  });
  it('steps past the original and earlier copies, building a row', () => {
    const spaces = [{ polygon: sq(0.2, 0.3) }, { polygon: besidePolygon(sq(0.2, 0.3)) }];
    const b = polygonBounds(pastePolygon(sq(0.2, 0.3), spaces));
    expect(b.minX).toBeCloseTo(0.4);
  });
});

describe('nextFreeId', () => {
  it('counts up from a number', () => { expect(nextFreeId('12', new Set(['12']))).toBe('13'); });
  it('keeps a prefix and leading zeros', () => { expect(nextFreeId('B07', new Set())).toBe('B08'); });
  it('grows past 9', () => { expect(nextFreeId('9')).toBe('10'); });
  it('skips IDs already used', () => { expect(nextFreeId('12', new Set(['12', '13', '14']))).toBe('15'); });
  it('gives none for an ID with no number, or none at all', () => {
    expect(nextFreeId('Store')).toBeNull(); expect(nextFreeId('')).toBeNull(); expect(nextFreeId(null)).toBeNull();
  });
});

describe('buildPasteRow', () => {
  const bay = {
    id: 'x', schematic_id: 'p1', floor_id: 'f1', label: '12', name: '12', type: 'Car', kind: 'slot',
    colour: '3c9683', height_m: 2.1, show_label: false, label_size: 'small', notes: 'Near the ramp',
    assigned_id: '12', polygon: sq(0.2, 0.3),
  };
  const opts = { schematicId: 'p1', floorId: 'f1', polygon: sq(0.3, 0.3), takenIds: new Set(['12']) };

  it('copies every detail and moves the ID, label and name on together', () => {
    expect(buildPasteRow(bay, opts)).toEqual({
      schematic_id: 'p1', floor_id: 'f1', label: '13', name: '13', type: 'Car', kind: 'slot',
      colour: '3c9683', height_m: 2.1, show_label: false, label_size: 'small', notes: 'Near the ramp',
      polygon: sq(0.3, 0.3), assigned_id: '13',
    });
  });
  it('keeps a label that is not the ID', () => {
    const row = buildPasteRow({ ...bay, label: 'Visitor bay', name: 'Visitor bay' }, opts);
    expect(row.label).toBe('Visitor bay'); expect(row.assigned_id).toBe('13');
  });
  it('leaves the ID blank when it has no number', () => {
    const row = buildPasteRow({ ...bay, assigned_id: 'Store', label: 'Store', name: 'Store' }, opts);
    expect(row.assigned_id).toBeNull(); expect(row.label).toBe('Store');
  });
  it('never carries the original id or audit stamps', () => {
    const row = buildPasteRow(bay, opts);
    expect(row).not.toHaveProperty('id'); expect(row).not.toHaveProperty('created_by');
  });
});
