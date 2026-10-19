// src/lib/apps/golden_thread/stores/gtStoreHelpers.js
//
// Shared helpers for the Golden Thread stores (gtStore, gtRiskStore): the
// authenticated mutation wrapper run() + currentUserId(), so the saving/error
// bookkeeping and the not-authenticated guard live in one place instead of
// being copy-pasted per store. Each store passes its own writable `update` and
// logger. LOADERS do NOT use run() — they throw so onMount/callers surface the
// error state (the R6 convention).

import { errMessage } from '../../../utils/errors.js';

// The current auth user id, or null — the portal's one helper. Imported, then
// exported, because makeRun below calls it: `export { x } from` alone creates
// no local name, and every Golden Thread save would throw.
import { currentUserId } from '#lib/utils/currentUser.js';
export { currentUserId };

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
      const msg = errMessage(err);
      logger('❌ ' + msg);
      update((s) => ({ ...s, saving: false, error: msg }));
      return { success: false, error: msg };
    }
  };
}

// ── The workflow manager (migration 264) ─────────────────────────────────────
// A document or risk moves through its workflow: workflow_move() checks the
// move, then changes the row with ONE ordinary UPDATE — so gt_write_audit()
// chains it exactly as before, against the person who made the move.

import { api } from '#lib/utils/api.js';
import { loadWorkflow, listItems, saveWorkflow } from '#lib/workflow/workflowApi.js';

/** A Golden Thread workflow and its items; empty until it is set up. @param {string} key */
export async function readGtWorkflow(key) {
  const wf = await loadWorkflow(key);
  if (!wf) return { workflow: null, steps: [], moves: [], fields: [], items: [] };
  return { ...wf, items: await listItems(wf.workflow.id) };
}

/** Admin: save a shipped Golden Thread workflow and attach what was registered before it. @param {any} seed */
export async function setUpGtWorkflow(seed) {
  await saveWorkflow(seed);
  await api.rpc('gt_attach_to_workflow', { p_key: seed.key });
}
