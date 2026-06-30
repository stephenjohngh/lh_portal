// src/lib/utils/componentSorting.test.js
import { describe, it, expect } from 'vitest';
import {
  resultRankSort, sortByFloorAsset, sortByResultFloorAsset,
  sortBySystemTypeAsset, sortBySystemInspectionAsset,
} from './componentSorting.js';

describe('resultRankSort', () => {
  it('orders failed → problem → ok → inactive', () => {
    const results = ['inactive', 'ok', 'failed', 'problem'];
    results.sort(resultRankSort);
    expect(results).toEqual(['failed', 'problem', 'ok', 'inactive']);
  });
  it('puts unknown results last', () => {
    const results = ['mystery', 'ok', 'failed'];
    results.sort(resultRankSort);
    expect(results).toEqual(['failed', 'ok', 'mystery']);
  });
});

describe('sortByFloorAsset', () => {
  it('sorts by floor_order first', () => {
    const rows = [
      { floor_order: 2, asset_id: 'A1' },
      { floor_order: 1, asset_id: 'Z9' },
    ];
    rows.sort(sortByFloorAsset);
    expect(rows.map(r => r.asset_id)).toEqual(['Z9', 'A1']);
  });
  it('uses numeric-aware asset_id comparison within a floor (D2 < D10)', () => {
    const rows = [
      { floor_order: 1, asset_id: 'D10' },
      { floor_order: 1, asset_id: 'D2' },
    ];
    rows.sort(sortByFloorAsset);
    expect(rows.map(r => r.asset_id)).toEqual(['D2', 'D10']);
  });
  it('sorts missing floor_order to the end and tolerates null asset_id', () => {
    const rows = [
      { floor_order: null, asset_id: null },
      { floor_order: 3,    asset_id: 'B1' },
    ];
    rows.sort(sortByFloorAsset);
    expect(rows[0].asset_id).toBe('B1');
  });
});

describe('sortByResultFloorAsset', () => {
  it('puts worst results first, then floor/asset order', () => {
    const rows = [
      { result: 'ok',     floor_order: 1, asset_id: 'A1' },
      { result: 'failed', floor_order: 9, asset_id: 'Z9' },
      { result: 'ok',     floor_order: 1, asset_id: 'A0' },
    ];
    rows.sort(sortByResultFloorAsset);
    expect(rows.map(r => r.asset_id)).toEqual(['Z9', 'A0', 'A1']);
  });
  it('falls back to the status field when result is absent', () => {
    const rows = [
      { status: 'ok',     floor_order: 1, asset_id: 'A1' },
      { status: 'problem', floor_order: 1, asset_id: 'B1' },
    ];
    rows.sort(sortByResultFloorAsset);
    expect(rows.map(r => r.asset_id)).toEqual(['B1', 'A1']);
  });
});

describe('sortBySystemTypeAsset', () => {
  it('sorts by system, then type, then numeric-aware asset id', () => {
    const rows = [
      { system_name: 'Fire', type_name: 'Door',  asset_id: 'FD10' },
      { system_name: 'Fire', type_name: 'Door',  asset_id: 'FD2' },
      { system_name: 'Fire', type_name: 'Alarm', asset_id: 'A1' },
      { system_name: 'Electrical', type_name: 'Lamp', asset_id: 'L1' },
    ];
    rows.sort(sortBySystemTypeAsset);
    expect(rows.map(r => r.asset_id)).toEqual(['L1', 'A1', 'FD2', 'FD10']);
  });
  it('tolerates missing fields', () => {
    const rows = [
      { system_name: null, type_name: null, asset_id: null },
      { system_name: 'Fire', type_name: 'Door', asset_id: 'FD1' },
    ];
    expect(() => rows.sort(sortBySystemTypeAsset)).not.toThrow();
  });
});

describe('sortBySystemInspectionAsset', () => {
  it('sorts by system_order → inspection_sort_order (nulls last) → numeric asset id', () => {
    const rows = [
      { system_order: 2, inspection_sort_order: 1,    asset_id: 'X'  }, // other system, last
      { system_order: 1, inspection_sort_order: null, asset_id: 'A2' }, // null order → after non-null
      { system_order: 1, inspection_sort_order: 5,    asset_id: 'B'  },
      { system_order: 1, inspection_sort_order: 3,    asset_id: 'C'  },
      { system_order: 1, inspection_sort_order: null, asset_id: 'A1' }, // null → ordered by asset_id
    ];
    rows.sort(sortBySystemInspectionAsset);
    expect(rows.map(r => r.asset_id)).toEqual(['C', 'B', 'A1', 'A2', 'X']);
  });
  it('tolerates missing fields', () => {
    const rows = [{ asset_id: null }, { system_order: 1, inspection_sort_order: 1, asset_id: 'a' }];
    expect(() => rows.sort(sortBySystemInspectionAsset)).not.toThrow();
  });
});
