// src/lib/apps/building_assets/utils/checkApplies.js
//
// Does a check apply to this component? (migration 286, user 2026-11-08)
//
// A condition attribute may carry `applies_when`: fixed-attribute filters, all of
// which must match, in the shape planned obligation scopes use. "Lit after mains
// off" applies only where Emergency is ticked. Null means always.
//
// ⛔ ONE rule, used by the walk, the component record, the reports and the survey
// template, so a check cannot be offered in one place and hidden in another. It is
// the scope matcher itself (matchesAllAttrFilters), so "this check applies" and
// "this component is in the walk" are judged the same way.
//
// Pure.

import { matchesAllAttrFilters } from './attrFilters.js';

/** @param {any} def */
const conditionOf = (def) => (Array.isArray(def?.applies_when) && def.applies_when.length ? def.applies_when : null);

/**
 * @param {any} def               a type_attributes row (or a recorded check)
 * @param {any} component         needs `id`
 * @param {any[]} defs            the component type's effective attributes
 * @param {Record<string, any[]>} componentAttrs
 */
export function checkApplies(def, component, defs, componentAttrs) {
  const when = conditionOf(def);
  if (!when) return true;
  if (!component) return true;
  return matchesAllAttrFilters(component, defs ?? [], componentAttrs ?? {}, {}, when);
}

/**
 * The attributes to show for one component: every fixed one, and the checks that apply.
 * @param {any[]} defs @param {any} component @param {Record<string, any[]>} componentAttrs
 */
export function checksFor(defs, component, componentAttrs) {
  return (defs ?? []).filter((d) => !d.checkable || checkApplies(d, component, defs, componentAttrs));
}

/**
 * Did a recorded check apply, judged on the component as it was recorded
 * (as_recorded.fixed: [{ id, name, display_type?, value }])?
 * @param {any} check @param {Array<{ id: string, name: string, display_type?: string, value: any }>|null|undefined} fixed
 */
export function recordedCheckApplies(check, fixed) {
  const when = conditionOf(check);
  if (!when || !Array.isArray(fixed)) return true;
  const defs = fixed.map((f) => ({ id: f.id, name: f.name, checkable: false, display_type: f.display_type }));
  const attrs = { c: fixed.filter((f) => f.value != null).map((f) => ({ type_attribute_id: f.id, value: f.value })) };
  return matchesAllAttrFilters({ id: 'c' }, defs, attrs, {}, when);
}

const OP_WORDS = {
  is_true:  'is ticked',
  is_false: 'is not ticked',
  eq_text:  'is',
  contains: 'contains',
  eq:       'is',
};

/**
 * The condition in words, or '' when the check always applies.
 * @param {any} def
 * @returns {string}  e.g. "Only where Emergency is ticked"
 */
export function describeCondition(def) {
  const when = conditionOf(def);
  if (!when) return '';
  const parts = when.map((f) => {
    if (f.op === 'in') {
      const v = (Array.isArray(f.values) ? f.values : [f.values]).filter((x) => x !== '' && x != null);
      return `${f.defName} is ${v.length > 1 ? `one of ${v.join(', ')}` : v[0] ?? '(nothing chosen)'}`;
    }
    return `${f.defName} ${OP_WORDS[f.op] ?? f.op}${f.op === 'is_true' || f.op === 'is_false' ? '' : ` ${f.values ?? ''}`}`;
  });
  return `Only where ${parts.join(' and ')}`;
}

/**
 * A condition for one fixed attribute, as the editor builds it.
 * @param {any} fixedDef  the fixed attribute it depends on
 * @param {string} op     'is_true' | 'is_false' | 'in' | 'eq_text'
 * @param {any} [value]
 */
export function conditionFor(fixedDef, op, value) {
  const f = { defName: fixedDef.name, checkable: false, op };
  if (op === 'in') return [{ ...f, values: Array.isArray(value) ? value : [value] }];
  if (op === 'eq_text') return [{ ...f, values: String(value ?? '') }];
  return [f];
}

/**
 * Is a condition complete enough to save? Returns a reason, or null.
 * @param {any} when
 */
export function conditionProblem(when) {
  if (when == null) return null;
  if (!Array.isArray(when) || !when.length) return 'Choose what the check depends on.';
  for (const f of when) {
    if (!f.defName) return 'Choose what the check depends on.';
    if (f.op === 'in' && !(Array.isArray(f.values) && f.values.some((v) => v !== '' && v != null))) return `Choose a value of ${f.defName}.`;
    if (f.op === 'eq_text' && !String(f.values ?? '').trim()) return `Enter a value of ${f.defName}.`;
  }
  return null;
}
