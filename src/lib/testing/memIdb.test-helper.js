// src/lib/testing/memIdb.test-helper.js
//
// An offline database in memory, with IndexedDB's semantics where the queues
// depend on them: an auto-increment key on the ops store, a refused `add` of a
// key that exists, and values cloned in and out (so a test cannot pass by
// mutating what it holds). Shared by every offline-queue test (2026-10-17;
// there were two copies in Inspection's).

import { STORE_OPS, STORE_CACHE } from '#lib/offline/outbox.js';
import { STORE_PHOTOS } from '#lib/offline/photoStore.js';

/**
 * @param {Record<string, string>} [extraStores]  more store name → keyPath
 * @returns {import('#lib/utils/idb.js').IdbHandle}
 */
export function memIdb(extraStores = {}) {
  /** @type {Record<string, string>} */
  const keyPath = { [STORE_OPS]: 'seq', [STORE_PHOTOS]: 'photoId', [STORE_CACHE]: 'key', ...extraStores };
  /** @type {Record<string, Map<any, any>>} */
  const stores = Object.fromEntries(Object.keys(keyPath).map((s) => [s, new Map()]));
  let seq = 0;
  const clone = (/** @type {any} */ v) => (v === undefined ? undefined : structuredClone(v));
  return {
    add: async (s, v) => {
      const val = s === STORE_OPS && v.seq == null ? { ...v, seq: ++seq } : v;
      const k = val[keyPath[s]];
      if (stores[s].has(k)) throw new Error('ConstraintError: key exists');
      stores[s].set(k, clone(val));
      return k;
    },
    put:    async (s, v) => { stores[s].set(v[keyPath[s]], clone(v)); return v[keyPath[s]]; },
    get:    async (s, k) => clone(stores[s].get(k)),
    getAll: async (s) => [...stores[s].values()].map(clone),
    count:  async (s) => stores[s].size,
    delete: async (s, k) => { stores[s].delete(k); },
    clear:  async (s) => { stores[s].clear(); },
    close:  () => {},
  };
}
