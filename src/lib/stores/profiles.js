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
import { api } from '#lib/utils/api.js';
import { getLogger } from '#lib/utils/logger.js';

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
        select:  'id, full_name, short_name',
        orderBy: 'full_name'
      });
      _state.set({ loaded: true, list: list || [], error: null });
      return list || [];
    } catch (/** @type {any} */ err) {
      logger('❌ Failed to load profiles:', err.message);
      _state.set({ loaded: true, list: [], error: err.message });
      return [];
    } finally {
      _loadPromise = null;
    }
  })();
  return _loadPromise;
}

// ── Short names (migration 279) ─────────────────────────────────────────────
// A person's short name ("SP") is set by an admin (Admin → Users → ✎ Edit).
// Management offers ONLY people who have one, as "SP (Stephen Pallett)", and
// shows "SP" once chosen (user, 2026-11-03). Other apps keep the full name.

/** @typedef {{ id: string, full_name?: string|null, short_name?: string|null }} Person */

/** "SP (Stephen Pallett)" — how a person is offered in a Management picker. @param {Person} p */
export function pickerLabel(p) {
  if (!p) return '';
  if (!p.short_name) return p.full_name ?? '';
  return p.full_name ? `${p.short_name} (${p.full_name})` : p.short_name;
}

/** "SP" — how a chosen person is shown in Management; the full name when none is set. @param {Person|undefined} p */
export function shortLabel(p) {
  return p?.short_name || p?.full_name || '';
}

/** The people Management may offer: those with a short name, by short name. @param {Person[]} list */
export function withShortName(list) {
  return (list ?? []).filter((p) => p.short_name)
    .sort((a, b) => String(a.short_name).localeCompare(String(b.short_name)));
}

/**
 * [{value, label}] for an action-assignee <select>: one option per person WITH a
 * short name — value the short name (an action stores its assignee as text),
 * label "SP (Stephen Pallett)" — then `extras`. A `current` value that is none
 * of these (an action assigned before short names, e.g. "Chloe") is kept as an
 * option so editing that action does not silently blank it.
 * @param {Person[]} list
 * @param {Array<{value:string,label:string}>} [extras]
 * @param {string|null} [current]
 */
export function assigneeChoices(list, extras = [{ value: 'External', label: 'External' }], current = null) {
  const people = withShortName(list).map((p) => ({ value: String(p.short_name), label: pickerLabel(p) }));
  const options = [{ value: '', label: '' }, ...people, ...extras];
  if (current && !options.some((o) => o.value === current)) {
    options.splice(1, 0, { value: current, label: `${current} (as recorded)` });
  }
  return options;
}

/**
 * Build [{value, label}] options for an assignee/person <select> — see
 * assigneeChoices. Returns a derived store so the options stay in sync with the cache.
 */
function assigneeOptions(extras = [{ value: 'External', label: 'External' }]) {
  return derived(_state, $s => assigneeChoices($s.list, extras));
}

export const profiles = { subscribe: _state.subscribe };

export const profilesStore = {
  subscribe: _state.subscribe,
  load,
  assigneeOptions
};
