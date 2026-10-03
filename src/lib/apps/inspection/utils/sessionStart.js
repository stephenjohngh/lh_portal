// src/lib/apps/inspection/utils/sessionStart.js
//
// What starting a walk writes, and the walk state it starts from — ONE copy
// (2026-10-03, PROJECT_STATUS §6bbb item 5). The three ways to start a session
// (one floor, the whole building, a rotating definition) each wrote these out
// by hand, so a change to how a session is recorded had to be made three times.
// Pure: no store, no clock, no ids — inspectionStore.createSession adds those.

/**
 * The session row, before createSession stamps id, inspector, status and times.
 *
 * A definition session records the RESOLVED type codes of the components it
 * walks, for the historic record; scheduling keys off definition_id, not the
 * filter (configurable inspections plan §4.2). A non-definition session records
 * the filter it was started with.
 *
 * `components` is the walk itself, for its count and its types;
 * `triggerComponentId` is a rotating session's trigger.
 *
 * @param {{
 *   sessionType: string, scope: 'single_floor'|'building',
 *   components: Array<{ type_code: string }>,
 *   building: string, floorId: string|null, sessionName: string,
 *   definition?: { id: string } | null,
 *   preset?: string, typeFilter?: string[], emergencyOnly?: boolean,
 *   triggerComponentId?: string,
 * }} start
 */
export function newSessionRecord({
  sessionType, scope, components, building, floorId, sessionName,
  definition = null, preset, typeFilter, emergencyOnly, triggerComponentId,
}) {
  const walked = components ?? [];
  return {
    session_type:               sessionType,
    session_scope:              scope,
    session_preset:             definition ? 'custom' : preset,
    type_filter:                JSON.stringify(definition ? [...new Set(walked.map(c => c.type_code))] : typeFilter),
    emergency_only:             definition ? false : emergencyOnly,
    definition_id:              definition?.id ?? null,
    // Only a rotating session has one; the key is absent otherwise, as before.
    ...(triggerComponentId ? { trigger_component_id: triggerComponentId } : {}),
    building,
    floor_id:                   floorId,
    session_name:               sessionName,
    total_components_count:     walked.length,
    inspected_components_count: 0,
  };
}

/**
 * The walk state a new session starts from: at the first component, nothing
 * inspected yet. A building-wide walk also carries its floors and progress.
 *
 * @param {{ walkComponents: any[], currentFloor: any,
 *           buildingFloors?: any[], floorProgress?: Record<string, any> }} start
 */
export function freshWalkState({ walkComponents, currentFloor, buildingFloors = [], floorProgress = {} }) {
  return {
    walkComponents,
    currentIndex:   0,
    inspections:    {},
    statusBefore:   {},
    buildingFloors,
    currentFloor,
    floorProgress,
  };
}
