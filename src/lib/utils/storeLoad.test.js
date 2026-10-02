// src/lib/utils/storeLoad.test.js
import { describe, it, expect, vi } from 'vitest';
import { writable, get } from 'svelte/store';
import { storeLoader } from './storeLoad.js';

/** A load the test finishes by hand. */
function held() {
  /** @type {(v: any) => void} */ let resolve = () => {};
  /** @type {(e: any) => void} */ let reject = () => {};
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(opts) {
  const store = writable({ items: [], loading: false, error: null });
  const calls = [];
  const fetch = vi.fn((...args) => { const h = held(); calls.push(h); return h.promise; });
  const load = storeLoader(store.update, fetch, (items) => ({ items }), opts);
  return { store, fetch, calls, load };
}

describe('storeLoader', () => {
  it('marks loading, then stores the result and says it has been read', async () => {
    const { store, calls, load } = setup();
    const p = load();
    expect(get(store)).toMatchObject({ loading: true, error: null });
    expect(get(store).loaded).toBeUndefined();     // not read yet ≠ read and empty
    calls[0].resolve([]);
    await p;
    expect(get(store)).toMatchObject({ items: [], loading: false, loaded: true });
  });

  it('records a failure as a sentence, even when the error is a plain object', async () => {
    const { store, calls, load } = setup();
    const p = load();
    calls[0].reject({ message: 'permission denied for table x', code: '42501' });
    await expect(p).rejects.toMatchObject({ code: '42501' });
    expect(get(store)).toMatchObject({ loading: false, error: 'permission denied for table x' });
  });

  it('never leaves error empty after a failure', async () => {
    const { store, calls, load } = setup({ what: 'the groups' });
    const p = load();
    calls[0].reject({});
    await expect(p).rejects.toEqual({});
    expect(get(store).error).toBe('Could not load the groups.');
  });

  it('does not re-throw when told not to', async () => {
    const { store, calls, load } = setup({ rethrow: false });
    const p = load();
    calls[0].reject(new Error('down'));
    await expect(p).resolves.toBeUndefined();
    expect(get(store).error).toBe('down');
  });

  it('clears error to what the store uses for none', () => {
    const { store, load } = setup({ clearError: '' });
    store.update((s) => ({ ...s, error: 'old' }));
    load();
    expect(get(store).error).toBe('');
  });

  it('shares a load already running instead of fetching twice', async () => {
    const { fetch, calls, load } = setup();
    const a = load();
    const b = load();
    expect(b).toBe(a);
    expect(fetch).toHaveBeenCalledTimes(1);
    calls[0].resolve([1]);
    await a;
    load();                                         // finished, so a new one runs
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('lets the newer of two different loads win, whichever finishes last', async () => {
    const { store, calls, load } = setup();
    const older = load('a');
    const newer = load('b');
    calls[1].resolve(['b']);
    await newer;
    calls[0].resolve(['a']);                        // the slow, earlier one
    await older;
    expect(get(store).items).toEqual(['b']);
    expect(get(store).loading).toBe(false);
  });

  it('keeps loading on while a newer load runs, and ignores the earlier one failing', async () => {
    const { store, calls, load } = setup();
    const older = load('a');
    load('b');
    calls[0].reject(new Error('stale failure'));
    await expect(older).rejects.toThrow('stale failure');
    expect(get(store)).toMatchObject({ loading: true, error: null });
  });

  it('passes the arguments to the fetch and to apply', async () => {
    const store = writable({});
    const load = storeLoader(store.update, async (id) => [id], (rows, id) => ({ rows, for: id }));
    await load('x');
    expect(get(store)).toMatchObject({ rows: ['x'], for: 'x' });
  });
});
