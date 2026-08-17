// src/lib/apps/building_assets/utils/attrDisplay.test.js
//
// The rule for writing an attribute value when it is SHOWN.
//
// Extracted from ComponentInventoryTable, where it was a private function, once
// a second copy appeared in the works schedule. These tests pin the ORIGINAL
// behaviour — the inventory table is long-standing and much-used, and the
// extraction is only safe if it changed nothing.

import { describe, it, expect } from 'vitest';
import {
  attrPair, attrPairsText, componentAttrPairs, SUPPRESSED_ATTR_VALUES,
} from './attrDisplay.js';

const def = (over = {}) => ({ id: 'a1', name: 'Wattage', display_type: 'text', ...over });

describe('attrPair', () => {
  it('keeps a plain value', () => {
    expect(attrPair(def(), '40')).toEqual({
      name: 'Wattage', value: '40', display_type: 'text',
    });
  });

  it('coerces to text, because values are stored as text', () => {
    expect(attrPair(def(), 40).value).toBe('40');
  });

  it('drops nothing-values', () => {
    expect(attrPair(def(), null)).toBeNull();
    expect(attrPair(def(), undefined)).toBeNull();
    expect(attrPair(def(), '')).toBeNull();
  });

  it('drops the values that carry no information', () => {
    // An attribute explicitly set to None says no more than an unset one, and
    // printing it crowds out what does.
    for (const value of SUPPRESSED_ATTR_VALUES) {
      expect(attrPair(def(), value)).toBeNull();
    }
  });

  it('shows a ticked checkbox as Yes and an unticked one not at all', () => {
    // An unticked box is the absence of a property, not a property.
    const box = def({ display_type: 'checkbox', name: 'Emergency' });
    expect(attrPair(box, 'true')).toEqual({
      name: 'Emergency', value: 'Yes', display_type: 'checkbox',
    });
    expect(attrPair(box, 'false')).toBeNull();
    expect(attrPair(box, true).value).toBe('Yes');
  });

  it('defaults an unknown display_type to text', () => {
    expect(attrPair({ id: 'a', name: 'X' }, 'v').display_type).toBe('text');
  });

  it('is null without a definition', () => {
    expect(attrPair(null, 'v')).toBeNull();
  });
});

describe('attrPairsText', () => {
  it('names a number, because the figure alone means nothing', () => {
    expect(attrPairsText([{ name: 'Wattage', value: '40', display_type: 'number' }]))
      .toBe('Wattage: 40');
  });

  it('shows a dropdown value bare, because it already says what it is', () => {
    expect(attrPairsText([{ name: 'Fire rating', value: 'FD30', display_type: 'dropdown' }]))
      .toBe('FD30');
  });

  it('shows anything else as its NAME — these are flags', () => {
    // An asset that has "Emergency" is emergency-rated; "Emergency: Yes" says
    // the same thing twice.
    expect(attrPairsText([{ name: 'Emergency', value: 'Yes', display_type: 'checkbox' }]))
      .toBe('Emergency');
  });

  it('joins with commas, in order', () => {
    expect(attrPairsText([
      { name: 'Wattage', value: '40', display_type: 'number' },
      { name: 'Fire rating', value: 'FD30', display_type: 'dropdown' },
      { name: 'Emergency', value: 'Yes', display_type: 'checkbox' },
    ])).toBe('Wattage: 40, FD30, Emergency');
  });

  it('is empty for nothing', () => {
    expect(attrPairsText([])).toBe('');
    expect(attrPairsText()).toBe('');
  });
});

describe('componentAttrPairs', () => {
  const defs = [
    def({ id: 'a1', name: 'Wattage', display_type: 'number' }),
    def({ id: 'a2', name: 'Fire rating', display_type: 'dropdown' }),
    def({ id: 'a3', name: 'Gap', checkable: true }),
    def({ id: 'a4', name: 'Hidden', visible: false }),
  ];

  it('takes only the visible, non-condition attributes', () => {
    // Condition attributes are re-assessed at each inspection and live in the
    // inspection record, not in what the asset IS.
    const pairs = componentAttrPairs(defs, { a1: '40', a2: 'FD30', a3: '3', a4: 'x' });
    expect(pairs.map(p => p.name)).toEqual(['Wattage', 'Fire rating']);
  });

  it('falls back to the definition-s default when a value is absent', () => {
    const withDefault = [def({ id: 'a1', name: 'Wattage', default_value: '40' })];
    expect(componentAttrPairs(withDefault, {})[0].value).toBe('40');
  });

  it('prefers a stored empty string over the default — it was set to nothing', () => {
    const withDefault = [def({ id: 'a1', name: 'Wattage', default_value: '40' })];
    expect(componentAttrPairs(withDefault, { a1: '' })).toEqual([]);
  });

  it('is empty for an asset with nothing recorded', () => {
    expect(componentAttrPairs(defs, {})).toEqual([]);
    expect(componentAttrPairs()).toEqual([]);
  });
});
