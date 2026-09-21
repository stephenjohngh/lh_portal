// src/lib/apps/compliance/public.js
//
// What other apps may do with this building's PLANNED OBLIGATIONS.
//
// ⛔ WHY THIS FILE EXISTS. Admin's Component Types tab carries a per-type
// quick-add — "which planned obligations touch this type, and add one" — and
// it used to reach straight into `inspectionDefinitionsStore` because both
// lived in the same app. They no longer do: `statutory_obligations` belongs to
// Compliance, and an app must not write another app's data. That rule is not
// decoration here — it is why G4 was declined and why the polymorphic action
// tracker was rejected. See `docs/design/Inter_App_Interfaces.md`.
//
// ⭐ THE PANEL ITSELF STAYS IN ADMIN, deliberately. It answers a question asked
// while configuring a component TYPE, and the Compliance app has no type
// browser to ask it from. Moving the screen to follow its data would have cost
// a real affordance; routing the writes through here costs nothing.
//
// ⚠ Stateless, per the convention: this exposes operations, never the store.
// A caller that needs to RENDER the list subscribes to the store it already
// has — what must not cross an app boundary is a WRITE.

import { api } from '$lib/utils/api';
import { inspectionDefinitionsStore } from './stores/inspectionDefinitionsStore.js';

/**
 * Every planned obligation, as rows.
 *
 * ⛔ THIS MOVED HERE FROM `inspection/public.js`, WHERE IT WAS CALLED
 * `listInspectionDefinitions`, AND THAT WAS AN OWNERSHIP INVERSION.
 * `statutory_obligations` belongs to this app — it stopped being Inspection's
 * `inspection_definitions` at migration 206 — so serving it through the
 * Inspection app's door meant the Compliance app would have been reading its
 * OWN table through another app's public interface. ⚠ The old name is still on
 * `walk_sessions.definition_id`, deliberately; a column is not renamed to
 * follow a vocabulary.
 *
 * Stateless, so a cross-app reader gets rows without acquiring this app's
 * store. Presentation order, because that is the order every screen shows them
 * in and a report that reordered them would not match the screen it came from.
 *
 * @param {{ activeOnly?: boolean }} [opts] `activeOnly` for the schedulers:
 *   an obligation switched off is deliberately still a gap in a REPORT, and
 *   deliberately not work in a SCHEDULE.
 */
export function listPlannedObligations({ activeOnly = false } = {}) {
  const options = { orderBy: 'presentation_order' };
  if (activeOnly) options.filters = { active: true };
  return api.get('statutory_obligations', options);
}

/**
 * The recorded applicability decisions — which compliance obligations this
 * building has decided do not apply to it, with a reason and a name against
 * each (migration 208).
 *
 * ⛔ ALSO MOVED FROM `inspection/public.js`, same inversion. Append-only, so
 * this is the whole log, newest first; reduce it with
 * `statutoryExclusions.currentDecisions()`.
 *
 * ⚠ It explains something ABSENT from the obligation list, which is why a
 * report that omitted it would be the more dangerous of the two possible
 * errors: a duty with no plan and no recorded decision reads as a gap, and a
 * duty with no plan and a recorded decision reads as a gap too unless somebody
 * hands the reader this.
 */
export function listStatutoryExclusions() {
  return api.get('statutory_exclusions', { orderBy: 'decided_at', ascending: false });
}

/**
 * Load the planned obligations into this app's store, if they are not there.
 * Safe to call repeatedly — the store no-ops when it already holds them.
 *
 * ⚠ Named apart from `listPlannedObligations` on purpose: one fills a store
 * and returns nothing useful, the other returns rows. Two near-identical names
 * for two different things is the fault this whole strand of work exists to
 * end, and it would be silly to introduce one here.
 */
export async function ensurePlannedObligationsLoaded() {
  return inspectionDefinitionsStore.load();
}

/**
 * Create a planned obligation.
 * @param {Object} data  a `statutory_obligations` row shape
 */
export async function createPlannedObligation(data) {
  return inspectionDefinitionsStore.create(data);
}

/**
 * Update a planned obligation.
 * @param {string} id
 * @param {Object} data
 */
export async function updatePlannedObligation(id, data) {
  return inspectionDefinitionsStore.save(id, data);
}

/**
 * Delete a planned obligation.
 *
 * ⚠ Deleting is for something created by mistake. A duty that no longer
 * applies is RETIRED (`retired_on`) so the walks and jobs done under it keep
 * saying what they were for — `CLAUDE.md`'s three kinds of "it doesn't count".
 * The Compliance app's own screen says so at the point of deletion; a caller
 * here is trusted to have meant it.
 *
 * @param {string} id
 */
export async function deletePlannedObligation(id) {
  return inspectionDefinitionsStore.remove(id);
}

/**
 * The store, for READING only.
 *
 * ⚠ Exposed because a cross-app reader needs reactivity and the convention
 * allows a `getX()` accessor for an owned entity. ⛔ Do not call its mutating
 * methods from another app — use the operations above, which are the supported
 * surface and the place any rule would live.
 */
export { inspectionDefinitionsStore as plannedObligations };
