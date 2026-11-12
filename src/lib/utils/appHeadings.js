// src/lib/utils/appHeadings.js
//
// Headings on the home page's app cards (user, 2026-11-12): an admin puts
// "Building apps" above Inspections and Building Assets, "BSA" above MOR and
// Golden Thread, and each starts a new line on the home page.
//
// Stored beside the app order, in portal_settings under 'app_headings', as
// [{ id, title, before }] — `before` is the app the heading sits above in the
// saved order. A heading covers the apps from there to the next heading, judged
// on the FULL saved order, so a person who cannot see the first app under a
// heading still sees the heading over the rest. Apps above the first heading
// show first, with no heading. The top bar is not affected.
//
// Pure.

export const APP_HEADINGS_KEY = 'app_headings';
export const HEADING_MAX = 60;

/**
 * @typedef {{ id: string, title: string, before: string }} AppHeading
 * @typedef {{ kind: 'heading', id: string, title: string } | { kind: 'app', app: any }} LayoutRow
 */

/** @param {unknown} value @returns {AppHeading[]} */
export function cleanHeadings(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  /** @type {AppHeading[]} */
  const out = [];
  for (const h of value) {
    const title = String(h?.title ?? '').trim().slice(0, HEADING_MAX);
    const before = String(h?.before ?? '');
    const id = String(h?.id ?? '') || `h${out.length + 1}`;
    if (!title || !before || seen.has(before)) continue;   // one heading above an app
    seen.add(before);
    out.push({ id, title, before });
  }
  return out;
}

/**
 * The admin's working list: every app in order, with the headings in place.
 * A heading whose app is no longer in the list goes at the end, so it is not
 * silently lost (saving drops it, since nothing follows it).
 * @param {any[]} apps  in the saved order
 * @param {AppHeading[]} headings
 * @returns {LayoutRow[]}
 */
export function layoutRows(apps, headings) {
  const byBefore = new Map(cleanHeadings(headings).map((h) => [h.before, h]));
  /** @type {LayoutRow[]} */
  const rows = [];
  for (const app of apps ?? []) {
    const h = byBefore.get(app.id);
    if (h) { rows.push({ kind: 'heading', id: h.id, title: h.title }); byBefore.delete(app.id); }
    rows.push({ kind: 'app', app });
  }
  for (const h of byBefore.values()) rows.push({ kind: 'heading', id: h.id, title: h.title });
  return rows;
}

/**
 * Back from the working list to what is stored. A heading with no app after it
 * (at the end, or straight above another heading) is dropped and counted.
 * @param {LayoutRow[]} rows
 * @returns {{ order: string[], headings: AppHeading[], dropped: number }}
 */
export function fromRows(rows) {
  /** @type {string[]} */
  const order = [];
  /** @type {AppHeading[]} */
  const headings = [];
  let pending = /** @type {{ id: string, title: string } | null} */ (null);
  let dropped = 0;
  for (const r of rows ?? []) {
    if (r.kind === 'heading') {
      if (pending) dropped++;
      const title = String(r.title ?? '').trim().slice(0, HEADING_MAX);
      if (title) pending = { id: r.id, title }; else { pending = null; dropped++; }
    } else {
      if (pending) { headings.push({ id: pending.id, title: pending.title, before: r.app.id }); pending = null; }
      order.push(r.app.id);
    }
  }
  if (pending) dropped++;
  return { order, headings, dropped };
}

/**
 * The home page's groups: the apps a person can see, under their headings.
 * @param {any[]} apps        the person's apps, in display order
 * @param {string[]|null} fullOrder  the saved order of every app
 * @param {AppHeading[]} headings
 * @returns {Array<{ id: string|null, title: string|null, apps: any[] }>}  empty groups left out
 */
export function groupApps(apps, fullOrder, headings) {
  const hs = cleanHeadings(headings);
  if (!hs.length || !Array.isArray(fullOrder) || !fullOrder.length) {
    return (apps ?? []).length ? [{ id: null, title: null, apps: [...apps] }] : [];
  }
  const byBefore = new Map(hs.map((h) => [h.before, h]));
  /** @type {Map<string, string|null>} app id → heading id */
  const under = new Map();
  let current = /** @type {string|null} */ (null);
  for (const id of fullOrder) {
    const h = byBefore.get(id);
    if (h) current = h.id;
    under.set(id, current);
  }
  const groups = [{ id: /** @type {string|null} */ (null), title: /** @type {string|null} */ (null), apps: /** @type {any[]} */ ([]) },
    ...hs.filter((h) => under.size && fullOrder.includes(h.before))
      .sort((a, b) => fullOrder.indexOf(a.before) - fullOrder.indexOf(b.before))
      .map((h) => ({ id: h.id, title: h.title, apps: /** @type {any[]} */ ([]) }))];
  /** @type {any[]} */
  const unplaced = [];
  for (const app of apps ?? []) {
    if (!under.has(app.id)) { unplaced.push(app); continue; }   // an app added since the order was saved
    const g = groups.find((x) => x.id === under.get(app.id));
    (g ?? groups[0]).apps.push(app);
  }
  if (unplaced.length) groups.push({ id: '_new', title: null, apps: unplaced });
  return groups.filter((g) => g.apps.length > 0);
}
