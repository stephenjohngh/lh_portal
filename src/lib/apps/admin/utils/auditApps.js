// src/lib/apps/admin/utils/auditApps.js
// The apps an audit log entry can be filtered by, and how each reads on a card.
//
// ⛔ ONE list. It used to be written out three times (the filter panel, the
// quick dropdown and the card's badge), each with seven apps, so an entry from
// Info, Compliance, Parking, MOR, Golden Thread and the rest could be seen but
// never filtered to (found running the Admin tutorial, 2026-10-27). The apps come
// from the registry, so a new app appears here by itself; only the legacy values
// older rows carry are listed by hand.
import { AVAILABLE_APPS } from '#lib/apps/apps.js';

/** appId values older rows carry that are no longer apps. */
const LEGACY = [
  { id: 'users', name: 'Users (legacy)' },
  { id: 'plans', name: 'Floor Schematics (legacy)' },
  { id: 'issues', name: 'Issues (legacy)' },
];

/** Colour classes for the badge on a card; an app without one gets the default. */
const COLOURS = {
  admin: 'bg-purple-600/20 text-purple-400',
  users: 'bg-purple-600/20 text-purple-400',
  issues: 'bg-green-600/20 text-green-400',
  building_assets: 'bg-blue-600/20 text-blue-400',
  inspection: 'bg-orange-600/20 text-orange-400',
  maintenance: 'bg-yellow-600/20 text-yellow-400',
  mobileplan: 'bg-teal-600/20 text-teal-400',
  plans: 'bg-amber-600/20 text-amber-400',
};
const DEFAULT_COLOUR = 'bg-slate-600/30 text-slate-300';

/** Every app an entry may name, registry apps first. @returns {Array<{ id: string, name: string }>} */
export function auditApps() {
  const apps = AVAILABLE_APPS.filter((a) => a.id !== 'home').map((a) => ({ id: a.id, name: a.name }));
  const have = new Set(apps.map((a) => a.id));
  return [...apps, ...LEGACY.filter((a) => !have.has(a.id))];
}

/** The options for an app filter, "all" first. @param {string} allLabel */
export function auditAppOptions(allLabel) {
  return [{ value: null, label: allLabel }, ...auditApps().map((a) => ({ value: a.id, label: a.name }))];
}

/** The badge for an entry's app, or null when it names none. @param {string|null|undefined} appId */
export function auditAppBadge(appId) {
  if (!appId) return null;
  const app = auditApps().find((a) => a.id === appId);
  return { label: app ? app.name : appId, color: COLOURS[appId] ?? DEFAULT_COLOUR };
}
