// src/lib/apps/building_assets/utils/attrDisplay.js
// How an attribute value is written when it is SHOWN — one definition.
//
// The rule came from ComponentInventoryTable, where it lived as a private
// function, and was copied into the works schedule when that needed the same
// summary. Two copies of a display rule is how the same asset comes to read
// differently in two places, and a reader cannot then tell whether they are
// looking at the same thing. Extracted so there is one.
//
// The rule itself, unchanged from the inventory table:
//   number   → "Wattage: 40"    the name means nothing without the figure
//   dropdown → "FD30"           the value already says what it is
//   anything else present → the NAME alone, because these are flags: an asset
//                           that has "Emergency" is emergency-rated, and
//                           "Emergency: Yes" says the same twice.

/**
 * Values treated as "nothing worth saying". An attribute explicitly set to
 * None/No/Unknown carries no more information than an unset one, and printing
 * it crowds out what does.
 */
export const SUPPRESSED_ATTR_VALUES = new Set(['None', 'No', 'Unknown']);

/**
 * One attribute definition and its raw stored value → the pair a display uses,
 * or null when there is nothing worth showing.
 *
 * @param {{ name: string, display_type?: string }} def  type_attributes row
 * @param {string|boolean|null|undefined} raw
 * @returns {{ name: string, value: string, display_type: string }|null}
 */
export function attrPair(def, raw) {
  if (!def) return null;
  if (raw == null || raw === '') return null;

  // Stored as the strings 'true'/'false'. Only a ticked box is worth showing —
  // an unticked one is the absence of a property, not a property.
  if (def.display_type === 'checkbox') {
    return raw === 'true' || raw === true
      ? { name: def.name, value: 'Yes', display_type: 'checkbox' }
      : null;
  }

  if (SUPPRESSED_ATTR_VALUES.has(String(raw))) return null;

  return {
    name: def.name,
    value: String(raw),
    display_type: def.display_type ?? 'text',
  };
}

/**
 * Every visible, non-condition attribute of a component, as display pairs.
 *
 * Condition attributes (`checkable`) are excluded: those are re-assessed at each
 * inspection and live in the inspection record, not in what the asset IS.
 *
 * @param {object[]} defs    effective attribute definitions for the type
 * @param {Record<string, string>} values  by type_attribute_id
 */
export function componentAttrPairs(defs = [], values = {}) {
  return defs
    .filter(d => d.visible !== false && !d.checkable)
    .map(d => attrPair(d, values[d.id] ?? d.default_value ?? null))
    .filter(Boolean);
}

/**
 * Display pairs as one comma-separated line.
 *
 * @param {{ name: string, value: string, display_type?: string }[]} pairs
 */
export function attrPairsText(pairs = []) {
  return pairs
    .map(p => (p.display_type === 'number'   ? `${p.name}: ${p.value}`
             : p.display_type === 'dropdown' ? p.value
             : p.name))
    .join(', ');
}
