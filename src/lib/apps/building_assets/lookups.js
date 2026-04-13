// Shared lookup helpers for the v2proto app.
// Centralise the repeated .find() / ?? [] patterns that appear in 20+ locations.

/** Look up a component_types row by its code string. */
export function typeByCode(types, code) {
  return types.find(t => t.code === code) ?? null;
}

/** Effective (inherited + own) visible attribute definitions for a type code. */
export function defsForType(attrDefs, types, typeCode) {
  const t = typeByCode(types, typeCode);
  return t ? (attrDefs[t.id] ?? []) : [];
}

/** The is_primary attribute definition for a type code, or null. */
export function primaryDef(attrDefs, types, typeCode) {
  return defsForType(attrDefs, types, typeCode).find(d => d.is_primary) ?? null;
}

/** Checkable + visible attribute definitions for a type code. */
export function checkableDefs(attrDefs, types, typeCode) {
  return defsForType(attrDefs, types, typeCode).filter(d => d.checkable && d.visible);
}

/** Raw attribute value for a component + attribute definition id. */
export function attrValue(componentAttrs, componentId, defId) {
  return (componentAttrs[componentId] ?? []).find(a => a.type_attribute_id === defId)?.value ?? null;
}

/** All raw attribute rows for a component. */
export function attrsFor(componentAttrs, componentId) {
  return componentAttrs[componentId] ?? [];
}

/** Look up a building_systems row by id. */
export function systemById(systems, id) {
  return systems.find(s => s.id === id) ?? null;
}

/** Look up a floor by id. */
export function floorById(floors, id) {
  return floors.find(f => f.id === id) ?? null;
}
