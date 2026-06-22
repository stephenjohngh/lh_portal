// src/lib/utils/prefs.test.js
// prefs.js wraps localStorage for per-browser UI preferences. Every accessor is
// try/catch-guarded so it stays safe under SSR (no localStorage), private mode,
// and quota errors. Pins: round-trip get/set, null clears, JSON parse/stringify,
// fallbacks on missing/corrupt data, and that throwing storage never propagates.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPref, setPref, getJSON, setJSON } from './prefs.js';

function makeStorage() {
  const m = new Map();
  return {
    getItem:    vi.fn((k) => (m.has(k) ? m.get(k) : null)),
    setItem:    vi.fn((k, v) => { m.set(k, String(v)); }),
    removeItem: vi.fn((k) => { m.delete(k); }),
    _map: m,
  };
}

let store;
beforeEach(() => {
  store = makeStorage();
  globalThis.localStorage = store;
});
afterEach(() => {
  delete globalThis.localStorage;
});

describe('getPref / setPref (strings)', () => {
  it('round-trips a string value', () => {
    setPref('k', 'hello');
    expect(store.setItem).toHaveBeenCalledWith('k', 'hello');
    expect(getPref('k')).toBe('hello');
  });

  it('returns null by default when the key is unset', () => {
    expect(getPref('missing')).toBeNull();
  });

  it('returns the provided fallback when the key is unset', () => {
    expect(getPref('missing', 'fallback')).toBe('fallback');
  });

  it('treats a null/undefined value as "clear the key"', () => {
    setPref('k', 'v');
    setPref('k', null);
    expect(store.removeItem).toHaveBeenCalledWith('k');
    expect(getPref('k')).toBeNull();

    setPref('k', undefined);
    expect(store.removeItem).toHaveBeenCalledTimes(2);
  });

  it('coerces non-string values to strings', () => {
    setPref('n', 42);
    expect(store.setItem).toHaveBeenCalledWith('n', '42');
    expect(getPref('n')).toBe('42');
  });
});

describe('getJSON / setJSON (objects)', () => {
  it('round-trips an object via JSON', () => {
    setJSON('cfg', { a: 1, b: [2, 3] });
    expect(getJSON('cfg')).toEqual({ a: 1, b: [2, 3] });
  });

  it('returns null by default when unset, or the provided fallback', () => {
    expect(getJSON('none')).toBeNull();
    expect(getJSON('none', {})).toEqual({});
  });

  it('returns the fallback when the stored value is corrupt JSON', () => {
    store._map.set('bad', '{not valid json');
    expect(getJSON('bad', { ok: true })).toEqual({ ok: true });
  });
});

describe('storage-safety guards', () => {
  it('getPref/getJSON return the fallback when localStorage throws', () => {
    store.getItem.mockImplementation(() => { throw new Error('SecurityError'); });
    expect(getPref('k', 'fb')).toBe('fb');
    expect(getJSON('k', 'fb')).toBe('fb');
  });

  it('setPref/setJSON swallow a throwing localStorage (quota / private mode)', () => {
    store.setItem.mockImplementation(() => { throw new Error('QuotaExceeded'); });
    store.removeItem.mockImplementation(() => { throw new Error('QuotaExceeded'); });
    expect(() => setPref('k', 'v')).not.toThrow();
    expect(() => setPref('k', null)).not.toThrow();
    expect(() => setJSON('k', { a: 1 })).not.toThrow();
  });

  it('is safe under SSR with no localStorage at all', () => {
    delete globalThis.localStorage;
    expect(getPref('k', 'fb')).toBe('fb');
    expect(getJSON('k', 'fb')).toBe('fb');
    expect(() => setPref('k', 'v')).not.toThrow();
    expect(() => setJSON('k', { a: 1 })).not.toThrow();
  });
});
