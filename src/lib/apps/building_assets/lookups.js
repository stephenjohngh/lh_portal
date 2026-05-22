// Shared lookup helpers for the Building Assets app.
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

/**
 * Build the per-attribute condition-checklist display data from an
 * inspection row and the type's effective attribute defs.
 *
 * Used by every UI surface that shows the condition results of one
 * inspection (ComponentDetailPanel current state, InspectionPanel
 * last-inspection summary, ComponentInspectionHistory rows,
 * InspectionsTab expandable rows, InspectionsReport Word doc).
 *
 * `passed` is true / false when the inspection recorded a value for
 * that attribute, or null when the attribute exists on the type but
 * has no entry in checklist_results (e.g. attr added after the
 * inspection, or component never inspected).
 *
 * @param {Object|null} inspection — component_inspections row or null
 * @param {Array}       defs       — type_attributes[] (effective set)
 * @returns {Array<{ def: Object, passed: boolean|null }>}
 */
export function conditionChecklistDisplay(inspection, defs) {
  const conditionDefs = (defs ?? []).filter(d => d.checkable && d.visible);
  const results       = inspection?.checklist_results ?? {};
  return conditionDefs.map(def => ({
    def,
    passed: typeof results[def.id] === 'boolean' ? results[def.id] : null,
  }));
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

// ── Highlight / halo helpers ─────────────────────────────────────────────────

/**
 * Return a visually contrasting 6-char hex colour (no '#') for the given hex.
 * Rotates the hue 180° (complementary) with forced saturation and inverted
 * lightness band so the result is always vivid and clearly different.
 * @param {string} hex — 6-char hex without '#' (e.g. 'ef4444')
 * @returns {string}
 */
export function complementaryColour(hex) {
  if (!hex || hex.length < 6) return 'ff6b00';

  // Parse to 0–1 RGB
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  // RGB → HSL
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6;                break;
      case b: h = ((r - g) / d + 4) / 6;                break;
    }
  }

  // Shift hue 180°, ensure vivid saturation, flip lightness
  const h2 = (h + 0.5) % 1;
  const s2 = Math.max(0.7, s);
  const l2 = l > 0.5 ? 0.35 : 0.65;

  // HSL → RGB
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  const q2  = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2;
  const p2  = 2 * l2 - q2;
  const hex2 = v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return hex2(hue2rgb(p2, q2, h2 + 1 / 3))
       + hex2(hue2rgb(p2, q2, h2))
       + hex2(hue2rgb(p2, q2, h2 - 1 / 3));
}

/**
 * Return the halo colour (6-char hex, no '#') for a component on the plan,
 * or null if no halo should be shown.
 *
 * Logic:
 *  1. type.highlight_attribute must be set (not null)
 *  2. That name must exist in the type's effective attribute definitions
 *  3. The component's value for that attribute must be exactly 'true'
 *  4. Colour = type.highlight_colour if set, otherwise complementaryColour(type.colour)
 *
 * @param {object} component       — components row (may include _haloColour already)
 * @param {Array}  types           — component_types[]
 * @param {object} attrDefs        — { [typeId]: type_attributes[] } (effective: inherited + own)
 * @param {object} componentAttrs  — { [componentId]: component_attributes[] }
 * @returns {string|null}
 */
export function resolveComponentHalo(component, types, attrDefs, componentAttrs) {
  const type = typeByCode(types, component.type_code);
  if (!type?.highlight_attribute) return null;

  // Find the attribute definition with the matching name in the effective set
  const defs    = attrDefs[type.id] ?? [];
  const attrDef = defs.find(d => d.name === type.highlight_attribute);
  if (!attrDef) return null;

  // Check if this component's stored value is 'true'
  if (attrValue(componentAttrs, component.id, attrDef.id) !== 'true') return null;

  // Resolve colour: explicit config or auto-contrast
  return type.highlight_colour || complementaryColour(type.colour ?? '888888');
}
