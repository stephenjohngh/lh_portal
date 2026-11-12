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

// ── A tab of its own, reused (user, 2026-11-12) ────────────────────────────
// "In a new tab" used to open a fresh tab every time, and each loaded the
// whole portal again. Now each app has ONE named tab: the first link opens it,
// and a later link asks that tab — already loaded — to open the record, which
// is almost instant. The tab answers so we know it heard; if it does not
// (it is on the sign-in page, say, or was moved on to another site), it is
// pointed at the address instead, as before.
//
// ⚠ A browser may not bring an existing tab to the front when asked (Chrome
// often will not). The record is then ready in that tab; the person clicks it.

export const OPEN_APP_MESSAGE = 'lh-open-app';
export const OPEN_APP_ACK = 'lh-open-app-ack';

/** The window name an app's own tab uses. */
export function appTabName(app) {
  return `lh-portal-${String(app).replace(/[^a-z0-9_-]/gi, '')}`;
}

/** Is this a well-formed request message (from a page of ours)? */
export function isOpenAppMessage(data) {
  return !!data && data.type === OPEN_APP_MESSAGE && typeof data.app === 'string' && data.app.length > 0
    && (data.params == null || (typeof data.params === 'object' && Object.values(data.params).every((v) => typeof v === 'string')));
}

/**
 * Open `app` at `params` in that app's own tab — reused if it is open.
 * Call it from a click (a browser lets a page open a tab only then).
 * @param {string} app @param {Record<string,string>} [params]
 * @param {{ ackMs?: number, win?: Window }} [opts]  for tests
 * @returns {'opened'|'sent'|'blocked'}
 */
export function openAppInTab(app, params = {}, opts = {}) {
  const win = opts.win ?? window;
  const href = appHref(app, params);
  const name = appTabName(app);
  let tab = null;
  try { tab = win.open('', name); } catch { tab = null; }
  if (!tab) return 'blocked';

  let fresh = true;
  try { fresh = !tab.location.href || tab.location.href === 'about:blank'; } catch { fresh = false; }
  if (fresh) {
    tab.location.href = href;
    try { tab.focus(); } catch { /* the browser decides */ }
    return 'opened';
  }

  // An existing tab of ours: ask it, and fall back to the address if it does not answer.
  let answered = false;
  const onAck = (e) => {
    if (e.origin === win.location.origin && e.source === tab && e.data?.type === OPEN_APP_ACK) answered = true;
  };
  win.addEventListener('message', onAck);
  tab.postMessage({ type: OPEN_APP_MESSAGE, app, params: { ...params } }, win.location.origin);
  try { tab.focus(); } catch { /* the browser decides */ }
  setTimeout(() => {
    win.removeEventListener('message', onAck);
    if (!answered) { try { tab.location.href = href; } catch { /* closed */ } }
  }, opts.ackMs ?? 1000);
  return 'sent';
}

/**
 * The shell's side: act on a request sent by `openAppInTab` from another tab
 * of ours, and answer it. Returns a remover.
 * @param {(app: string, params: Record<string,string>) => void} handle
 */
export function listenForAppRequests(handle, win = window) {
  const onMessage = (e) => {
    if (e.origin !== win.location.origin || !isOpenAppMessage(e.data)) return;
    try { e.source?.postMessage({ type: OPEN_APP_ACK }, e.origin); } catch { /* opener gone */ }
    handle(e.data.app, e.data.params ?? {});
  };
  win.addEventListener('message', onMessage);
  return () => win.removeEventListener('message', onMessage);
}
