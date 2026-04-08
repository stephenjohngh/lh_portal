// src/lib/apps/v2/utils/attrResolution.js
// Shared attribute hierarchy resolution used by both v2proto and v2walk.
//
// Separates raw type_attributes rows into:
//   systemAttrDefs — indexed by systemId  (system-scoped rows only)
//   attrDefs       — indexed by typeId    (effective = system-inherited + type-own)
//                    each row carries _scope: 'system' | 'type'
//   attrOptions    — indexed by attrDefId (all options; empty if options not supplied)
//   regimeMap      — indexed by typeId    (empty if regime not supplied)
//
// options and regime are optional — v2walk does not use them.

export function resolveHierarchy(systems, types, defs, options = [], regime = []) {
  const systemAttrDefs = {};
  const attrDefs       = {};
  const attrOptions    = {};
  const regimeMap      = {};

  // Partition raw defs by scope
  const systemDefs = defs.filter(d => d.building_system_id != null);
  const typeDefs   = defs.filter(d => d.component_type_id  != null);

  // Index system-level attrs (for admin management)
  for (const sys of systems) {
    systemAttrDefs[sys.id] = systemDefs.filter(d => d.building_system_id === sys.id);
  }

  // Build effective attribute set per type (inherited + own), mark scope
  for (const t of types) {
    const inherited = (systemAttrDefs[t.building_system_id] ?? [])
      .map(a => ({ ...a, _scope: 'system' }));
    const own = typeDefs
      .filter(d => d.component_type_id === t.id)
      .map(a => ({ ...a, _scope: 'type' }));
    attrDefs[t.id] = [...inherited, ...own]
      .sort((a, b) => a.presentation_order - b.presentation_order);
    regimeMap[t.id] = regime.filter(r => r.type_id === t.id);
  }

  // Index options by attr def id (works for both system and type attrs)
  for (const d of defs) {
    attrOptions[d.id] = options.filter(o => o.type_attribute_id === d.id);
  }

  return { systemAttrDefs, attrDefs, attrOptions, regimeMap };
}
