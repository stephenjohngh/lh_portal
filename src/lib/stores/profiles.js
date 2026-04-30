// src/lib/stores/profiles.js
//
// Single shared cache of profile rows.
//
// Used wherever an app needs to populate an "assignee" / "person" dropdown
// from the user list — Issues actions, Issues actions report, meeting
// participants, etc. Without this every component would run its own
// `select id, full_name from profiles order by full_name` per mount.
//
// Public surface:
//   - `profiles`            — readable store: { loaded, list, error }
//                             where list is [{ id, full_name }]
//   - `profilesStore.load`  — fetch (idempotent — only hits the DB the first
//                             time, subsequent calls are no-ops; pass
//                             { force: true } to refetch)
//   - `profilesStore.assigneeOptions(extras?)` — convenience derived helper
//                             returning [{value, label}] for FormSelect.
//                             value is full_name (matches the legacy
//                             actions.name_text shape — string, not uuid).

import { writable, derived } from 'svelte/store';
import { api } from '$lib/utils/api';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('profilesStore');

const _state = writable({
  loaded: false,
  list:   [],     // [{ id, full_name }]
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
        select:  'id, full_name',
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
