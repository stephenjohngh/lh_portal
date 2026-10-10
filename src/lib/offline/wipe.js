// src/lib/offline/wipe.js
//
// ⛔ Offline copies that hold PERSONAL data are deleted at logout (2026-10-10).
// The 2026-09-27 security review stopped the portal keeping server data on a
// device after logout; Parking (M) keeps a copy of holders' names and phones
// for a lookup with no signal (the user's choice), so it must go when the
// person logs out.
//
// Listed by name, not registered by the app: logout deletes a database whether
// or not the app that writes it was opened on this page.
// The Inspection outbox is NOT listed — it holds unsynced walk results that
// would be lost, and no personal data.
//
// An app may register a hook to run first (Parking (M) sends its queued lookup
// audit lines and closes its connection). Hooks get a few seconds, then the
// databases go regardless.

/** Offline databases holding personal data, deleted at logout. */
export const PERSONAL_DATABASES = Object.freeze(['lh_parking_offline']);

/** @type {Set<() => Promise<void>>} */
const beforeWipe = new Set();

/**
 * Run `fn` before the wipe (best effort, time-limited).
 * @param {() => Promise<void>} fn
 * @returns {() => void} unregister
 */
export function onBeforeOfflineWipe(fn) {
  beforeWipe.add(fn);
  return () => beforeWipe.delete(fn);
}

/** @param {string} name */
function deleteDatabase(name) {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) { resolve(false); return; }
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
    // Blocked by a connection still open elsewhere: the delete completes when
    // it closes (this page is about to go to /login), so do not wait for it.
    req.onblocked = () => resolve(false);
  });
}

/**
 * Delete every offline copy that holds personal data. Never throws.
 * @param {{ timeoutMs?: number }} [opts]
 */
export async function wipeOfflinePersonalData({ timeoutMs = 4000 } = {}) {
  const hooks = [...beforeWipe].map((fn) => Promise.resolve().then(fn).catch(() => {}));
  await Promise.race([Promise.all(hooks), new Promise((r) => setTimeout(r, timeoutMs))]);
  await Promise.all(PERSONAL_DATABASES.map(deleteDatabase));
}
