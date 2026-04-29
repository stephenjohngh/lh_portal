// src/lib/stores/profiles.js
//
// Single shared cache of `profiles.full_name` rows.
//
// Used wherever an app needs to populate an "assignee" / "person" dropdown
// from the user list — Issues actions, Issues actions report, etc.
// Without this every component (CommentsSection, ActionsSection,
// ActionsReport, …) would run its own `select full_name from profiles
// order by full_name` per mount.
//
// Public surface:
//   - `profiles`            — readable store: { loaded, list, error }
//   - `profilesStore.load`  — fetch (idempotent — only hits the DB the first
//                             time, subsequent calls are no-ops; pass
//                             { force: true } to refetch)
//   - `profilesStore.assigneeOptions(extras?)` — convenience derived helper
//                             returning [{value, label}] for FormSelect/etc.

import { writable, derived } from 'svelte/store';
import { api } from '$lib/utils/api';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('profilesStore');

const _state = writable({
  loaded: false,
  list:   [],     // [{ full_name }]
  error:  null
});

// In-flight promise so concurrent callers share one request.
let _loadPromise = null;

async function load({ force = false } = {}) {
  let snapshot;
  _state.subscribe(s => snapshot = s)();
  if (snapshot.loaded && !force) return snapshot.list;
  if (_loadPromise && !force)    return _loadPromise;

  _loadPromise = (async () => {
    try {
      const list = await api.get('profiles', {
        select:  'full_name',
        orderBy: 'full_name'
      });
      _state.set({ loaded: true, list: list || [], error: null });
      return list || [];
    } catch (err) {
      logger('❌ Failed to load profiles:', err.message);
      _state.set({ loaded: true, list: [], error: err.message });
      return [];
    } finally {
      _loadPromise = null;
    }
  })();
  return _loadPromise;
}

/**
 * Build [{value, label}] options for an assignee/person <select>.
 * `extras` is appended at the end (e.g. `[{ value: 'External', label: 'External' }]`).
 *
 * Returns a derived store so the options stay in sync with the cache.
 */
function assigneeOptions(extras = [{ value: 'External', label: 'External' }]) {
  return derived(_state, $s => [
    { value: '', label: '' },
    ...$s.list.map(p => ({ value: p.full_name, label: p.full_name })),
    ...extras
  ]);
}

export const profiles = { subscribe: _state.subscribe };

export const profilesStore = {
  subscribe: _state.subscribe,
  load,
  assigneeOptions
};
