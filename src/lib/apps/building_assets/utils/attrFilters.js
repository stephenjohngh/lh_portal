// src/lib/apps/building_assets/utils/attrFilters.js
//
// Pure helpers for the Fixed-attribute and Condition-attribute filters
// on the Components tab. Two responsibilities:
//
//   1. availableFixedDefs / availableConditionDefs — what attributes are
//      offered in the filter picker, given the current Type filter.
//
//   2. matchesAttrFilter — does this component pass a single active filter?
//      Branches by attribute *class* (fixed vs condition) to source the value:
//        - Fixed     → componentAttrs[componentId]   (component_attributes table)
//        - Condition → inspections[componentId].checklist_results[defId]
//                      (latest component_inspections row)
//
// All values in component_attributes are stored as text; we parse on the fly
// for number / boolean comparison. Condition values in checklist_results are
// booleans (the only non-text/number condition values currently storable per
// inspection — text/number condition values get stitched into notes in the
// inspection panel and are not structurally queryable).
//
// Filter shape (see ComponentsTab):
//   {
//     defId:        string,                          // type_attributes.id
//     op:           string,                          // see operators below
//     values:       string[] | number | string,      // depends on op
//     includeUnset: boolean,                         // include components missing this attr
//   }
//
// Supported operators:
//   'in'        — values is string[]; match if attr value ∈ values   (dropdown / radio)
//   'is_true'   — match if attr value === true (or 'true')           (checkbox / boolean condition)
//   'is_false'  — match if attr value === false (or 'false')         (checkbox / boolean condition)
//   'lt'/'lte'/'eq'/'gte'/'gt'  — numeric;  values is a number       (number)
//   'contains' / 'starts' / 'eq_text' — string compare, case-insensitive (text / textarea)

/**
 * @typedef {object} AttrFilter
 * @property {string}   defId
 * @property {string}   op
 * @property {string[]|number|string} values
 * @property {boolean}  [includeUnset]
 */

// ──────────────────────────────────────────────────────────────────────────
// Available-def selectors
// ──────────────────────────────────────────────────────────────────────────

/**
 * Union of effective attribute definitions across the given set of type ids,
 * de-duplicated by id. Used by the picker so we never offer the same attr
 * twice when several types share an inherited (system-scoped) one.
 *
 * @param {object}   attrDefs   { [typeId]: type_attributes[] }
 * @param {string[]} typeIds
 * @returns {Array}
 */
function unionDefs(attrDefs, typeIds) {
  const seen = new Map();
  for (const tid of typeIds) {
    for (const d of attrDefs[tid] ?? []) {
      if (d.visible === false) continue;
      if (!seen.has(d.id))     seen.set(d.id, d);
    }
  }
  return [...seen.values()];
}

/**
 * Effective Fixed attribute definitions (checkable=false) available given
 * the user's current Type filter.
 *
 *   - When filterTypeCodes is empty → union across every visible type.
 *   - Otherwise → union across the selected types (inherited attrs included
 *     naturally since defsForType already returns the effective set).
 *
 * @param {Array}    types
 * @param {object}   attrDefs        { [typeId]: type_attributes[] }
 * @param {Set<string>|string[]} filterTypeCodes
 */
export function availableFixedDefs(types, attrDefs, filterTypeCodes) {
  return availableDefs(types, attrDefs, filterTypeCodes, /* checkable */ false);
}

/** Effective Condition attribute definitions (checkable=true). */
export function availableConditionDefs(types, attrDefs, filterTypeCodes) {
  return availableDefs(types, attrDefs, filterTypeCodes, /* checkable */ true);
}

function availableDefs(types, attrDefs, filterTypeCodes, checkable) {
  const codes = filterTypeCodes instanceof Set
    ? [...filterTypeCodes]
    : (filterTypeCodes ?? []);

  const targetTypeIds = codes.length > 0
    ? types.filter(t => codes.includes(t.code)).map(t => t.id)
    : types.map(t => t.id);

  return unionDefs(attrDefs, targetTypeIds)
    .filter(d => d.checkable === checkable)
    .sort((a, b) => (a.presentation_order ?? 0) - (b.presentation_order ?? 0)
                 || a.name.localeCompare(b.name));
}

// ──────────────────────────────────────────────────────────────────────────
// Match logic
// ──────────────────────────────────────────────────────────────────────────

/**
 * Coerce a stored value (always text in component_attributes) to the
 * comparable JS type expected by the operator.
 */
function asNumber(v)  { const n = Number(v); return Number.isFinite(n) ? n : null; }
function asString(v)  { return v == null ? '' : String(v); }
function isTrueish(v) {
  if (v === true)  return true;
  if (v === false) return false;
  if (v == null)   return null;          // unset
  const s = String(v).toLowerCase();
  if (s === 'true'  || s === 'yes' || s === '1') return true;
  if (s === 'false' || s === 'no'  || s === '0') return false;
  return null;
}

/**
 * Look up the raw value for `defId` from the right source for the given
 * attribute class.
 *
 *   - def.checkable=false → componentAttrs (the component's stored value)
 *   - def.checkable=true  → latest inspection's checklist_results[defId]
 *
 * Returns:
 *   - boolean for condition booleans
 *   - string for fixed values (stored as text in component_attributes)
 *   - null  when the value is absent / component never inspected
 */
export function lookupAttrValue(def, componentId, componentAttrs, inspections) {
  if (def.checkable) {
    const insp = inspections?.[componentId];
    if (!insp) return null;
    const v = insp.checklist_results?.[def.id];
    return v == null ? null : v;            // boolean
  }
  const row = (componentAttrs?.[componentId] ?? [])
    .find(a => a.type_attribute_id === def.id);
  return row?.value ?? null;
}

/**
 * Does this component pass this filter?
 *
 * @param {object}      component
 * @param {Array}       defs            effective attr defs for the component's type
 * @param {object}      componentAttrs
 * @param {object}      inspections
 * @param {AttrFilter}  filter
 */
export function matchesAttrFilter(component, defs, componentAttrs, inspections, filter) {
  const def = defs.find(d => d.id === filter.defId);
  if (!def) {
    // This filter doesn't apply to the component's type at all.
    // Returning true keeps it inclusive — a "narrows-by-other-types" filter
    // shouldn't kick out components for which the attr is irrelevant.
    return true;
  }

  const raw = lookupAttrValue(def, component.id, componentAttrs, inspections);
  if (raw == null || raw === '') {
    return !!filter.includeUnset;
  }

  switch (filter.op) {
    case 'in': {
      const set = new Set((filter.values ?? []).map(String));
      return set.has(String(raw));
    }
    case 'is_true':  return isTrueish(raw) === true;
    case 'is_false': return isTrueish(raw) === false;

    case 'lt':  { const n = asNumber(raw); return n != null && n <  Number(filter.values); }
    case 'lte': { const n = asNumber(raw); return n != null && n <= Number(filter.values); }
    case 'eq':  { const n = asNumber(raw); return n != null && n === Number(filter.values); }
    case 'gte': { const n = asNumber(raw); return n != null && n >= Number(filter.values); }
    case 'gt':  { const n = asNumber(raw); return n != null && n >  Number(filter.values); }

    case 'contains': return asString(raw).toLowerCase().includes(asString(filter.values).toLowerCase());
    case 'starts':   return asString(raw).toLowerCase().startsWith(asString(filter.values).toLowerCase());
    case 'eq_text':  return asString(raw).toLowerCase() === asString(filter.values).toLowerCase();

    default:
      return true;
  }
}

/**
 * Apply a list of filters across all attribute classes. Short-circuits as
 * soon as any filter rejects (AND across filters).
 */
export function matchesAllAttrFilters(
  component, defs, componentAttrs, inspections, filters,
) {
  for (const f of filters) {
    if (!matchesAttrFilter(component, defs, componentAttrs, inspections, f)) return false;
  }
  return true;
}

// ──────────────────────────────────────────────────────────────────────────
// Display helpers (used by the chip / popover for human-readable summaries)
// ──────────────────────────────────────────────────────────────────────────

/** Operator → short symbol for chip display. */
export const OP_SYMBOL = {
  in:       '∈',
  is_true:  '= ✓',
  is_false: '= ✗',
  lt:       '<',
  lte:      '≤',
  eq:       '=',
  gte:      '≥',
  gt:       '>',
  contains: 'contains',
  starts:   'starts',
  eq_text:  '=',
};

/** Default operator + initial value for a fresh filter of the given display_type. */
export function defaultFilterFor(def) {
  switch (def.display_type) {
    case 'checkbox':
      // For condition (boolean) checkable the typical filter is "passed = false" (i.e. failures).
      // For fixed checkbox the typical filter is "= true".
      return { op: def.checkable ? 'is_false' : 'is_true', values: '', includeUnset: false };
    case 'dropdown':
    case 'radio':
      return { op: 'in', values: [], includeUnset: false };
    case 'number':
      return { op: 'eq', values: '', includeUnset: false };
    case 'text':
    case 'textarea':
    default:
      return { op: 'contains', values: '', includeUnset: false };
  }
}
