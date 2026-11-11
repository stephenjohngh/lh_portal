// src/lib/utils/appLink.js
//
// Opening another app AT a record — e.g. Management's issue → the Dossier pack
// made from it (user, 2026-11-11, who asked for the jump; the earlier decline
// of cross-app navigation was the Planner's, and this is the user's own call).
//
// Two ways in, one shape:
//   · same tab — `openApp(app, params)`: the main shell watches `appRequest`
//     and switches app; the target app calls `takeAppParams(app)` once on
//     opening and acts on them. The app being left keeps its own place as
//     before (Management holds its scroll and open sections in a store).
//   · new tab — `appHref(app, params)` → `/?app=dossier&pack=<id>`; the shell
//     reads that on start, turns it into the same request, and tidies the
//     address so a reload does not jump again.
//
// Params are plain strings. The target app decides what they mean and must
// treat an id it cannot find (deleted, no access) as "open normally".

import { writable, get } from 'svelte/store';

/** @type {import('svelte/store').Writable<{ app: string, params: Record<string,string> } | null>} */
export const appRequest = writable(null);

/** Ask the shell to switch to `app`, carrying `params` for it. */
export function openApp(app, params = {}) {
  appRequest.set({ app, params: { ...params } });
}

/** The address that opens `app` with `params`, for a new tab. */
export function appHref(app, params = {}) {
  const q = new URLSearchParams({ app, ...params });
  return `/?${q.toString()}`;
}

/** Read a request from an address's search params (`?app=…&…`); null when none. */
export function requestFromSearch(search) {
  const q = new URLSearchParams(search ?? '');
  const app = q.get('app');
  if (!app) return null;
  const params = {};
  for (const [k, v] of q) if (k !== 'app') params[k] = v;
  return { app, params };
}

/**
 * The params waiting for `app`, once: they are cleared as they are read, so
 * reopening the app later does not jump again. Null when nothing waits.
 */
export function takeAppParams(app) {
  const req = get(appRequest);
  if (!req || req.app !== app) return null;
  appRequest.set(null);
  return req.params;
}
