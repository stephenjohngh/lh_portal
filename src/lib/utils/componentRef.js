// src/lib/utils/componentRef.js
// Shared helpers for working with component reference strings.
//
// Stored refs use the buildRef() format from building_assets/stores/helpers.js:
//   "{facility short_name} / {floor short_name} / {type name} / {asset_id}"
//   e.g. "LH / G / Fire Door / FD-042"
//
// Used by Building Assets (ComponentLinks, ComponentInventoryTable) and
// Inspection (to resolve which linked components also need checking).

/**
 * Reformat a stored ref for compact display as floor/initial/assetId.
 *   "LH / G / Fire Door / FD-042"  →  "G/FD/FD-042"
 * Pass the types array so the type name can be resolved to its initial.
 * Falls back to stripping spaces if the format doesn't match or types is empty.
 *
 * @param {string}   ref   - stored to_component_ref value
 * @param {object[]} types - component_types[] — used to resolve type initial
 */
export function fmtComponentRef(ref, types = []) {
  if (!ref) return '—';
  const parts = ref.split(' / ');
  if (parts.length === 4) {
    const typeName = parts[2];
    const initial  = types.find(t => t.name === typeName)?.initial ?? typeName.slice(0, 2).toUpperCase();
    return `${parts[1]}/${initial}/${parts[3]}`;
  }
  return ref.replace(/ \/ /g, '/');
}

/**
 * Find the component whose ref matches the given stored ref string.
 * Handles both formats:
 *   Short (current):  "{floorShortName}/{typeInitial}/{assetId}"   e.g. "G/FD/FD-042"
 *   Long  (legacy):   "{facility} / {floor} / {typeName} / {id}"  e.g. "LH / G / Fire Door / FD-042"
 *
 * @param {string}   ref        - stored to_component_ref value
 * @param {object[]} components - all components[]
 * @param {object[]} floors     - all floors[]
 * @param {object[]} facilities - all facilities[]
 * @param {object[]} types      - all component_types[]
 */
export function findComponentByRef(ref, components, floors, facilities, types) {
  if (!ref || !components?.length) return null;

  // Short format: "{floorSN}/{initial}/{assetId}" — no spaces, exactly 3 slash-segments
  const shortParts = ref.split('/');
  if (shortParts.length === 3 && !ref.includes(' ')) {
    const [floorSN, initial, assetId] = shortParts;
    return components.find(c => {
      const floor = floors.find(f => f.id === c.floor_id);
      const type  = types.find(t => t.code === c.type_code);
      const id    = c.asset_id || c.label || c.id?.slice(0, 8) || '?';
      return floor?.short_name === floorSN && type?.initial === initial && id === assetId;
    }) ?? null;
  }

  // Long format (legacy): "{facility} / {floor} / {typeName} / {id}"
  for (const c of components) {
    const floor    = floors.find(f => f.id === c.floor_id);
    const facility = floor ? facilities.find(f => f.id === floor.facility_id) : null;
    const type     = types.find(t => t.code === c.type_code);
    const facName  = facility?.short_name ?? '?';
    const flrName  = floor?.short_name    ?? '?';
    const typeName = type?.name ?? c.type_code ?? '?';
    const id       = c.asset_id || c.label || c.id?.slice(0, 8) || '?';
    if (`${facName} / ${flrName} / ${typeName} / ${id}` === ref) return c;
  }
  return null;
}

/**
 * Given a component, return all components that are linked FROM it
 * and need to be checked when it is inspected (link_type contains "check"
 * or is left blank — callers can filter further as needed).
 *
 * @param {string}   componentId   - the from-component's id
 * @param {object}   componentLinks - store.componentLinks map { [id]: link[] }
 * @param {object[]} components    - all components[]
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
