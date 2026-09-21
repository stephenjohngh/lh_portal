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

import { inspectionDefinitionsStore } from './stores/inspectionDefinitionsStore.js';

/**
 * Load the planned obligations, if they are not already loaded.
 * Safe to call repeatedly — the store no-ops when it already holds them.
 */
export async function loadPlannedObligations() {
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
