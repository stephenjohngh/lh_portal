// src/lib/apps/golden_thread/stores/gtStoreHelpers.js
//
// Shared helpers for the Golden Thread stores (gtStore, gtRiskStore): the
// authenticated mutation wrapper run() + currentUserId(), so the saving/error
// bookkeeping and the not-authenticated guard live in one place instead of
// being copy-pasted per store. Each store passes its own writable `update` and
// logger. LOADERS do NOT use run() — they throw so onMount/callers surface the
// error state (the R6 convention).

import { supabase } from '$lib/supabaseClient';

/** The current auth user id, or null. */
export async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Build a `run(fn)` bound to a store: flips saving/error around a mutation and
 * resolves to `{ success, error?, ...fnResult }`. `fn` receives the user id and
 * may return extra fields to merge into the result (e.g. `{ risk }`).
 * @param {(updater: (s: any) => any) => void} update  the store's writable update
 * @param {(msg: string) => void} logger
 */
export function makeRun(update, logger) {
  return async function run(fn) {
    update((s) => ({ ...s, saving: true, error: '' }));
    try {
      const userId = await currentUserId();
      if (!userId) throw new Error('Not authenticated');
      const r = await fn(userId);
      update((s) => ({ ...s, saving: false }));
      return { success: true, ...(r ?? {}) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger('❌ ' + msg);
      update((s) => ({ ...s, saving: false, error: msg }));
      return { success: false, error: msg };
    }
  };
}
