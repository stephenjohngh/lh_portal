// src/lib/utils/storeLoad.js
//
// A store's load, written once (2026-10-02, PROJECT_STATUS §6aaa item 4).
//
// Twenty-one stores wrote the same block by hand:
//
//   update(s => ({ ...s, loading: true, error: null }));
//   try { const x = await fetch(); update(s => ({ ...s, x, loading: false })); }
//   catch (err) { update(s => ({ ...s, error: err.message, loading: false })); throw err; }
//
// and every copy shared three faults:
//   · `err.message` — a Supabase/PostgREST error is often a plain object, so a
//     failed load could set `error` to undefined: a failure that reads as none;
//   · two loads at once — the app opening while a tab also asks — fetched
//     twice; and
//   · the slower of two loads won, whichever was asked for last: a stale list
//     could overwrite a newer one.
//
// What `storeLoader` does instead:
//   · `loading` true and `error` cleared while it runs; on success the result
//     goes in through `apply`, `loading` false and `loaded` true — so "read,
//     and empty" can be told apart from "not read yet";
//   · on failure `error` is a sentence (errMessage), never undefined;
//   · a call with the same arguments as one still running gets THAT promise,
//     not a second request;
//   · a call with different arguments supersedes the earlier one, whose
//     result (or failure) is then discarded rather than written over it.

import { errMessage } from './errors.js';

/**
 * @template T
 * @param {(fn: (s: any) => any) => void} update   the store's own update
 * @param {(...args: any[]) => Promise<T>} fetch    reads the data
 * @param {(result: T, ...args: any[]) => Record<string, any>} apply
 *        the fields to set from the result, e.g. `(groups) => ({ groups })`
 * @param {{
 *   clearError?: null | string,  // what `error` holds when there is none (default null)
 *   rethrow?: boolean,           // re-throw a failure to the caller (default true)
 *   what?: string,               // for the fallback message, e.g. "the maintenance groups"
 *   log?: (...a: any[]) => void, // the store's logger
 * }} [opts]
 * @returns {(...args: any[]) => Promise<T | undefined>}
 */
export function storeLoader(update, fetch, apply, opts = {}) {
  const { clearError = null, rethrow = true, what = 'the data', log } = opts;
  let latest = 0;
  /** @type {null | { id: number, key: string, promise: Promise<any> }} */
  let running = null;

  return function load(...args) {
    const key = JSON.stringify(args);
    if (running && running.key === key) return running.promise;

    const id = ++latest;
    update((s) => ({ ...s, loading: true, error: clearError }));

    const promise = (async () => {
      try {
        const result = await fetch(...args);
        if (id === latest) {
          update((s) => ({ ...s, ...apply(result, ...args), loading: false, loaded: true }));
        }
        return result;
      } catch (/** @type {any} */ err) {
        log?.(`✖ could not load ${what}:`, err);
        if (id === latest) {
          update((s) => ({ ...s, loading: false, error: errMessage(err, `Could not load ${what}.`) }));
        }
        if (rethrow) throw err;
        return undefined;
      } finally {
        if (running?.id === id) running = null;
      }
    })();

    running = { id, key, promise };
    return promise;
  };
}
