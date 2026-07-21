// src/lib/utils/idb.js
//
// Tiny, dependency-free promise wrapper over IndexedDB.
//
// Why hand-rolled rather than the `idb` npm package: the project keeps its
// dependency surface small (see the dependency-free `server/zip.js` precedent),
// and we need only a handful of single-request operations. This exposes a
// generic handle — get / getAll / count / put / add / delete / clear — over any
// object store, so the Inspection offline queue (`offlineQueue.js`) can layer its
// own schema on top and tests can substitute an in-memory handle of the same
// shape.
//
// Not available under SSR (no `indexedDB`). Callers guard with isIdbAvailable().

/** @returns {boolean} whether IndexedDB exists in this environment. */
export function isIdbAvailable() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/**
 * Open (creating/upgrading if needed) a database.
 * @param {string} name
 * @param {number} version
 * @param {(db: IDBDatabase, oldVersion: number) => void} [upgrade]  create/adjust
 *        object stores on a version bump.
 * @returns {Promise<IdbHandle>}
 */
export async function openDB(name, version, upgrade) {
  if (!isIdbAvailable()) throw new Error('IndexedDB is not available in this environment');
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (e) => {
      try { upgrade?.(req.result, e.oldVersion); }
      catch (err) { reject(err); }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another open tab'));
  });
  return makeHandle(db);
}

/**
 * @typedef {object} IdbHandle
 * @property {(store: string, key: any) => Promise<any>}   get
 * @property {(store: string) => Promise<any[]>}           getAll
 * @property {(store: string) => Promise<number>}          count
 * @property {(store: string, value: any) => Promise<any>} put
 * @property {(store: string, value: any) => Promise<any>} add
 * @property {(store: string, key: any) => Promise<void>}  delete
 * @property {(store: string) => Promise<void>}            clear
 * @property {() => void}                                  close
 */

function makeHandle(db) {
  // Each call runs exactly ONE request inside its own transaction and resolves on
  // the transaction's oncomplete — the request result is captured on the way. One
  // request per transaction keeps us clear of IDB's auto-close-when-idle rule.
  function run(store, mode, op) {
    return new Promise((resolve, reject) => {
      let out;
      const t = db.transaction(store, mode);
      t.oncomplete = () => resolve(out);
      t.onerror    = () => reject(t.error);
      t.onabort    = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
      const req = op(t.objectStore(store));
      req.onsuccess = () => { out = req.result; };
      req.onerror   = () => reject(req.error);
    });
  }
  return {
    get:    (store, key)   => run(store, 'readonly',  o => o.get(key)),
    getAll: (store)        => run(store, 'readonly',  o => o.getAll()),
    count:  (store)        => run(store, 'readonly',  o => o.count()),
    put:    (store, value) => run(store, 'readwrite', o => o.put(value)),
    add:    (store, value) => run(store, 'readwrite', o => o.add(value)),
    delete: (store, key)   => run(store, 'readwrite', o => o.delete(key)),
    clear:  (store)        => run(store, 'readwrite', o => o.clear()),
    close:  () => db.close(),
  };
}
