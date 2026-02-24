// src/lib/apps/plans/utils/filterHelpers.js
// Shared element filter logic for PlanViewer and PlansReport.
// Single source of truth — eliminates the diverged applyFilters / filterEls copies.

import { getElementDisplayName } from '$lib/utils/planConstants';

/**
 * Apply a filter object to an array of plan elements.
 *
 * filters shape:
 * {
 *   types:    string[]   — element_type values to include (empty = all)
 *   statuses: string[]   — status values to include (empty = all)
 *   searchText: string   — substring match against label, asset_id, subtype,
 *                          and getElementDisplayName (when plan is supplied)
 *   plan:     object     — optional; when supplied, searchText also matches the
 *                          element's display name (e.g. "G/O/001")
 *   lightFilters:    { subtypes[], battery[], emergency, movementSensor, lightSensor }
 *   communalFilters: { subtypes[], security[], retained }
 *   apartmentFilters: {}  (reserved)
 *   fireFilters:     { subtypes[] }
 *   otherFilters:    { subtypes[] }
 * }
 *
 * Rules: AND across groups, OR within arrays inside a group.
 * Type-specific sub-filters only affect elements of the matching element_type.
 *
 * @param {Array}  elements  — plan_elements rows
 * @param {object} filters   — filter object (missing keys = "no filter")
 * @returns {Array}          — filtered subset, original order preserved
 */
export function applyElementFilters(elements, filters) {
  let result = [...elements];
  const f = filters ?? {};

  // ── Type filter ──────────────────────────────────────────────────────────
  if (f.types?.length > 0) {
    result = result.filter(el => f.types.includes(el.element_type));
  }

  // ── Status filter ────────────────────────────────────────────────────────
  if (f.statuses?.length > 0) {
    result = result.filter(el => f.statuses.includes(el.status));
  }

  // ── Text search ──────────────────────────────────────────────────────────
  // Matches label, asset_id, subtype, and (when plan is provided) display name.
  if (f.searchText) {
    const q          = f.searchText.toLowerCase();
    const floorLevel = f.plan?.floor_level;
    result = result.filter(el =>
      el.label?.toLowerCase().includes(q)    ||
      el.asset_id?.toLowerCase().includes(q) ||
      el.subtype?.toLowerCase().includes(q)  ||
      (floorLevel !== undefined &&
        getElementDisplayName(el, floorLevel).toLowerCase().includes(q))
    );
  }

  // ── Light-specific sub-filters ───────────────────────────────────────────
  const lf = f.lightFilters;
  if (lf) {
    if (lf.subtypes?.length > 0) {
      result = result.filter(el => el.element_type !== 'light' || lf.subtypes.includes(el.subtype));
    }
    if (lf.battery?.length > 0) {
      result = result.filter(el => el.element_type !== 'light' || lf.battery.includes(el.battery));
    }
    if (lf.emergency) {
      result = result.filter(el => el.element_type !== 'light' || el.emergency === true);
    }
    if (lf.movementSensor) {
      result = result.filter(el => el.element_type !== 'light' || el.movement_sensor === true);
    }
    if (lf.lightSensor) {
      result = result.filter(el => el.element_type !== 'light' || el.light_sensor === true);
    }
  }

  // ── Communal door sub-filters ────────────────────────────────────────────
  const cf = f.communalFilters;
  if (cf) {
    if (cf.subtypes?.length > 0) {
      result = result.filter(el => el.element_type !== 'communal_door' || cf.subtypes.includes(el.subtype));
    }
    if (cf.security?.length > 0) {
      result = result.filter(el => el.element_type !== 'communal_door' || cf.security.includes(el.security));
    }
    if (cf.retained) {
      result = result.filter(el => el.element_type !== 'communal_door' || el.retained === true);
    }
  }

  // ── Fire control sub-filters ─────────────────────────────────────────────
  const ff = f.fireFilters;
  if (ff?.subtypes?.length > 0) {
    result = result.filter(el => el.element_type !== 'fire_control' || ff.subtypes.includes(el.subtype));
  }

  // ── Other sub-filters ────────────────────────────────────────────────────
  const of_ = f.otherFilters;
  if (of_?.subtypes?.length > 0) {
    result = result.filter(el => el.element_type !== 'other' || of_.subtypes.includes(el.subtype));
  }

  return result;
}
