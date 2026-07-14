// src/lib/apps/building_assets/utils/spaceMembership.js
// Pure, derive-at-read component ↔ space membership.
// See docs/requirements/Spaces_Enhancement_Design.md §4.3.
//
// "Within = any part of the marker": a component (its point x,y plus a small
// marker footprint of radius `tolerance`) is IN a space when its point is inside
// the space polygon OR within `tolerance` of an edge. The tolerance is what puts
// a boundary component (a door drawn on a shared wall) in BOTH adjacent spaces.
//
// Membership is plan-scoped (same plan_id) and can be overridden
// (space_component_overrides): effective = (geometric ∪ include) − exclude.
// `overrides` defaults to [] so this works before that table exists (P1).
//
// `tolerance` is a fraction in AR-corrected normalised-height space (see
// planMeasure.js). ~0.01 = 1% of plan height. Tunable; refine against real plans.

import { pointInPolygon, distanceToPolygon } from '../components/plan/planMeasure.js';
import { buildSpaceRef } from '$lib/utils/spaceRef.js';

export const DEFAULT_TOLERANCE = 0.01;

// Does the component's marker footprint touch the space polygon?
function markerWithinSpace(component, space, AR, tolerance) {
  const poly = space.polygon;
  if (!poly || poly.length < 3) return false;
  if (component.x_position == null || component.y_position == null) return false;
  const pt = { x: component.x_position, y: component.y_position };
  if (pointInPolygon(pt, poly)) return true;
  return distanceToPolygon(pt, poly, AR) <= tolerance;
}

// The override mode for a (space, component) pair, or null. DB enforces
// unique(space_id, component_id), so at most one applies.
function overrideMode(overrides, spaceId, componentId) {
  return overrides.find(o => o.space_id === spaceId && o.component_id === componentId)?.mode ?? null;
}

// Shared decision for one (component, space) pair.
function isMember(component, space, overrides, AR, tolerance) {
  const mode = overrideMode(overrides, space.id, component.id);
  if (mode === 'exclude') return false;
  if (mode === 'include') return true;
  return component.plan_id === space.plan_id && markerWithinSpace(component, space, AR, tolerance);
}

/**
 * Components that belong to a space.
 * @param {object}   space
 * @param {object[]} components
 * @param {Array<{space_id:string,component_id:string,mode:'include'|'exclude'}>} [overrides]
 * @param {{AR?:number, tolerance?:number}} [opts]
 * @returns {object[]} member component objects
 */
export function componentsInSpace(space, components = [], overrides = [], opts = {}) {
  if (!space) return [];
  const AR  = opts.AR ?? 1;
  const tol = opts.tolerance ?? DEFAULT_TOLERANCE;
  return components.filter(c => isMember(c, space, overrides, AR, tol));
}

/**
 * Spaces a single component belongs to (reverse lookup — e.g. the two spaces a
 * boundary door separates).
 * @param {object}   component
 * @param {object[]} spaces
 * @param {Array<{space_id:string,component_id:string,mode:'include'|'exclude'}>} [overrides]
 * @param {{AR?:number, tolerance?:number}} [opts]
 * @returns {object[]} member space objects
 */
export function spacesForComponent(component, spaces = [], overrides = [], opts = {}) {
  if (!component) return [];
  const AR  = opts.AR ?? 1;
  const tol = opts.tolerance ?? DEFAULT_TOLERANCE;
  return spaces.filter(sp => isMember(component, sp, overrides, AR, tol));
}

/**
 * Building-wide map of componentId → sorted space labels ("Reference name",
 * e.g. "G/S/12 PlantRoom2"), resolved once with each space's own plan aspect
 * ratio (membership is plan-scoped and AR-sensitive, so we can't use a single
 * AR building-wide). Reverse of componentsInSpace — drives the Components-tab
 * "Space(s)" column + exports. Derive-at-read; call from the store's in-memory
 * state.
 * @param {object[]} components
 * @param {object[]} spaces
 * @param {Array<{space_id:string,component_id:string,mode:'include'|'exclude'}>} [overrides]
 * @param {object[]} [plans]   — for per-plan aspect ratio
 * @param {object[]} [floors]  — for buildSpaceRef
 * @returns {Map<string, string[]>}
 */
export function componentSpaceRefs(components = [], spaces = [], overrides = [], plans = [], floors = [], opts = {}) {
  const planAR = new Map(plans.map(p => [
    p.id,
    p.image_aspect_ratio ?? (p.image_width && p.image_height ? p.image_width / p.image_height : 1),
  ]));
  const byId = new Map();
  for (const space of spaces) {
    const AR    = planAR.get(space.plan_id) ?? 1;
    const ref   = buildSpaceRef(space, floors);
    const entry = space.name ? `${ref} ${space.name}` : ref;   // "Reference + name" for reports
    for (const c of componentsInSpace(space, components, overrides, { AR, tolerance: opts.tolerance })) {
      const arr = byId.get(c.id);
      if (arr) arr.push(entry); else byId.set(c.id, [entry]);
    }
  }
  for (const arr of byId.values()) arr.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return byId;
}
