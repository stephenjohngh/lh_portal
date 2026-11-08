// src/lib/apps/cases/utils/bulkOpen.js
//
// Opening one case each for several failed components (user, 2026-11-04): a round
// with twenty failed doors was twenty forms by hand. Pure, no I/O.
//
// ⛔ A component that already has an OPEN case in this process is shown and not
// offered: two cases for one door is two letters to one owner. A finished case
// does not stop a new one, because the door can fail again.
// ⛔ A Problem component whose latest result is No access is not offered: it is
// Problem because nobody got in (statusRule.js), which is the access process's.

import { isFinished, fieldMissing } from '#lib/workflow/workflowModel.js';

export const BULK_STATUSES = Object.freeze(['failed', 'problem']);
export const BULK_TITLE_DEFAULT = '{label}: failed check';

/**
 * The field a bulk open fills in: the process's component field that is needed
 * to open a case. Null when there is none, or when another field is also needed
 * to open one, because nothing here could fill that in.
 * @param {Array<{ key: string, type: string, required_on_create?: boolean }>} fields
 */
export function bulkField(fields = []) {
  const needed = fields.filter((f) => f.required_on_create);
  return needed.length === 1 && needed[0].type === 'component' ? needed[0] : null;
}

/** A case's title from the words typed: {label} is the component's label. @param {string} template @param {string|null} label */
export function bulkTitle(template, label) {
  return String(template ?? '').replaceAll('{label}', String(label ?? '').trim() || 'No label').trim();
}

/**
 * The failed components this process could open cases for, each saying whether
 * an open case already has it.
 * @param {{ components: any[], field: { key: string, options?: string[] }, items: any[], cases: any[],
 *           steps: Array<{ key: string, kind: string }>, links?: Array<{ id: string, text: string }> }} p
 */
export function bulkCandidates({ components = [], field, items = [], cases = [], steps = [], links = [] }) {
  const types = field.options ?? [];
  const kindOf = new Map(steps.map((s) => [s.key, s.kind]));
  const referenceOf = new Map(cases.map((c) => [c.id, c.reference]));
  const textOf = new Map(links.map((l) => [l.id, l.text]));
  /** @type {Map<string, string>} */
  const openFor = new Map();
  for (const i of items) {
    const id = i.fields?.[field.key];
    if (fieldMissing(id) || isFinished(kindOf.get(i.step_key) ?? '')) continue;
    openFor.set(String(id), referenceOf.get(i.subject_id) ?? 'an open case');
  }
  return components
    .filter((c) => !types.length || types.includes(c.type_code))
    // Problem because nobody got in, not because a fault was seen: that is the
    // access process's, not a defect case (user, 2026-11-08). A FAILED door whose
    // latest visit was no access is still offered: its Fail was seen and stands.
    .filter((c) => !(c.status === 'problem' && c.last_result === 'no_access'))
    .map((c) => ({ id: c.id, label: c.label ?? null, status: c.status, text: textOf.get(c.id) ?? c.label ?? c.asset_id ?? c.id, openCase: openFor.get(c.id) ?? null }))
    .sort((a, b) => a.text.localeCompare(b.text, 'en-GB', { numeric: true }));
}
