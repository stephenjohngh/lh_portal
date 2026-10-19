// src/lib/workflow/workflowNaming.js
//
// How a workflow is named where staff choose one (user, 2026-10-19: "start the
// name with Appname.optional tab then rest of name"): App.Tab – name, e.g.
// "Parking.Waiting list – Waiting list place".
//
// ⭐ The prefix is BUILT, never stored. The app comes from the workflow's
// app_id and AVAILABLE_APPS; the tab from where the app shows its items,
// below. Typed into the name, it would be a second copy of a fact that goes
// stale when a tab is renamed — and the stored name is what the PUBLIC status
// page shows, where "Parking.Applications" means nothing to an applicant.
//
// A Cases process has its own tab in the Cases app, named after the process,
// so its label is "Cases – <name>" with no tab between.

import { AVAILABLE_APPS } from '#lib/apps/apps.js';

/**
 * The tab an app shows a workflow's items on, by workflow key. null = the
 * workflow is the whole app, or is shown on more than one tab, so there is no
 * single tab to name. ⛔ Every shipped workflow has an entry (a test holds it):
 * a new one must say where it is worked, not fall back silently.
 * @type {Readonly<Record<string, string|null>>}
 */
export const WORKFLOW_TABS = Object.freeze({
  parking_application: 'Applications',
  parking_waiting_list: 'Waiting list',
  works_schedule: 'Works',
  compliance_action: 'Compliance obligations',
  complaint: null,          // the whole Complaints app — Open and All both list them
  maintenance_job: null,    // Due work and All Jobs both show jobs
});

/** @param {string|null|undefined} appId */
function appName(appId) {
  return AVAILABLE_APPS.find((a) => a.id === appId)?.name ?? appId ?? '';
}

/** "App.Tab" — or "App" alone when there is no single tab. @param {{ key: string, app_id: string }} wf */
export function workflowPlace(wf) {
  const app = appName(wf.app_id);
  const tab = wf.app_id === 'cases' ? null : WORKFLOW_TABS[wf.key] ?? null;
  return tab ? `${app}.${tab}` : app;
}

/** "App.Tab – name", the label staff see. @param {{ key: string, app_id: string, name: string }} wf */
export function workflowLabel(wf) {
  const place = workflowPlace(wf);
  return place ? `${place} – ${wf.name}` : wf.name;
}

/** Workflows in label order, so one app's sit together. @template {{ key: string, app_id: string, name: string }} T @param {T[]} list */
export function sortByLabel(list) {
  return [...list].sort((a, b) => workflowLabel(a).localeCompare(workflowLabel(b), 'en-GB', { sensitivity: 'base', numeric: true }));
}
