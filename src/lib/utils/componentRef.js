// src/lib/utils/componentRef.js
// Shared helpers for working with component reference strings.
//
// Refs are stored in short format: "{floorShortName}/{typeInitial}/{assetId}"
//   e.g. "G/FD/FD-042"
//
// Used by Building Assets (ComponentLinks, ComponentInventoryTable) and
// Inspection (to resolve which linked components also need checking).

/**
 * Format a stored ref for display — already in display format so returned as-is,
 * but kept as a named helper so call sites don't embed format assumptions.
 *
 * @param {string}   ref   - stored to_component_ref value
 * @param {object[]} types - unused, kept for call-site compatibility
 */
export function fmtComponentRef(ref, types = []) {
  return ref || '—';
}

/**
 * Build the canonical ref for a component: "{floorShortName}/{typeInitial}/{assetId}".
 * The asset_id → label → truncated-id fallback mirrors what findComponentByRef
 * matches against and what the plan-copy remap has always written, so refs
 * built here resolve refs already stored.
 *
 * @param {object}   component
 * @param {object[]} floors
 * @param {object[]} types
 * @returns {string} e.g. "G/CP/03"
 */
export function buildComponentRef(component, floors, types) {
  const floor   = floors.find(f => f.id === component.floor_id);
  const type    = types.find(t => t.code === component.type_code);
  const assetId = component.asset_id || component.label || component.id?.slice(0, 8) || '?';
  return `${floor?.short_name ?? '?'}/${type?.initial ?? '?'}/${assetId}`;
}

/**
 * Find the component whose ref matches the given stored ref string.
 * Format: "{floorShortName}/{typeInitial}/{assetId}"  e.g. "G/FD/FD-042"
 *
 * @param {string}   ref        - stored to_component_ref value
 * @param {object[]} components - all components[]
 * @param {object[]} floors     - all floors[]
 * @param {object[]} facilities - unused, kept for call-site compatibility
 * @param {object[]} types      - all component_types[]
 */
export function findComponentByRef(ref, components, floors, facilities, types) {
  if (!ref || !components?.length) return null;
  const parts = ref.split('/');
  if (parts.length !== 3) return null;
  const [floorSN, initial, assetId] = parts;
  return components.find(c => {
    const floor = floors.find(f => f.id === c.floor_id);
    const type  = types.find(t => t.code === c.type_code);
    const id    = c.asset_id || c.label || c.id?.slice(0, 8) || '?';
    return floor?.short_name === floorSN && type?.initial === initial && id === assetId;
  }) ?? null;
}

/**
 * Given a component, return all components that are linked FROM it.
 *
 * @param {string}   componentId    - the from-component's id
 * @param {object}   componentLinks - store.componentLinks map { [id]: link[] }
 * @param {object[]} components     - all components[]
 * @param {object[]} floors
 * @param {object[]} facilities
 * @param {object[]} types
 * @returns {object[]} resolved component objects (nulls filtered out)
 */
export function resolveLinkedComponents(componentId, componentLinks, components, floors, facilities, types) {
  const links = componentLinks[componentId] ?? [];
  return links
    .map(l => findComponentByRef(l.to_component_ref, components, floors, facilities, types))
    .filter(Boolean);
}
