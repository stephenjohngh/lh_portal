// src/lib/apps/cases/utils/caseFields.js
//
// A Cases process's fields (migration 253), pure: how a value reads, what a
// link field offers, and what is still missing. The field definitions are the
// process's (workflow_fields, set in Admin → Workflows); a case holds its
// values in `cases.fields`, keyed by the field's key.
//
// ⛔ A person field is a PORTAL USER (profiles) — never a resident. The
// resident-data rule: cases are for building processes.

import { buildComponentRef } from '#lib/utils/componentRef.js';
import { buildSpaceRef } from '#lib/utils/spaceRef.js';
import { fmtDateOnly } from '#lib/utils/dates.js';
import { fieldMissing } from '#lib/workflow/workflowModel.js';

/** The link field types: their value is the id of a portal record. */
export const LINK_TYPES = Object.freeze(['component', 'space', 'person']);

/**
 * What each link field offers, as { id, text } sorted by text.
 * @param {{ components?: any[], spaces?: any[], floors?: any[], types?: any[], people?: any[] }} refs
 * @returns {{ component: Array<{id: string, text: string}>, space: Array<{id: string, text: string}>, person: Array<{id: string, text: string}> }}
 */
export function linkOptions({ components = [], spaces = [], floors = [], types = [], people = [] } = {}) {
  const byText = (/** @type {any} */ a, /** @type {any} */ b) => a.text.localeCompare(b.text, 'en-GB', { numeric: true });
  return {
    component: components.map((c) => ({ id: c.id, text: `${buildComponentRef(c, floors, types)}${c.label ? ` — ${c.label}` : ''}` })).sort(byText),
    space: spaces.map((s) => ({ id: s.id, text: `${buildSpaceRef(s, floors)}${s.label || s.name ? ` — ${s.label || s.name}` : ''}` })).sort(byText),
    person: people.map((p) => ({ id: p.id, text: p.full_name || 'A user with no name set' })).sort(byText),
  };
}

/**
 * A field's value as words. A link to something no longer in the portal says
 * so rather than showing an id.
 * @param {{ type: string }} field
 * @param {any} value
 * @param {ReturnType<typeof linkOptions>} [links]
 */
export function fieldText(field, value, links) {
  if (fieldMissing(value)) return '—';
  if (field.type === 'date') return fmtDateOnly(String(value));
  if (LINK_TYPES.includes(field.type)) {
    const list = /** @type {Array<{id: string, text: string}>} */ (/** @type {any} */ (links ?? {})[field.type] ?? []);
    return list.find((o) => o.id === value)?.text ?? 'No longer in the portal';
  }
  return String(value);
}

/**
 * The first field that must be filled to OPEN a case and is not — the
 * database's own test (cases_rules) — or null.
 * @param {Array<{ key: string, label: string, required_on_create?: boolean, position?: number }>} fields
 * @param {Record<string, any>} values
 */
export function missingToOpen(fields, values) {
  const f = [...fields].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .find((x) => x.required_on_create && fieldMissing(values?.[x.key]));
  return f ? `Fill in "${f.label}" to open a case.` : null;
}

/**
 * A case's values as they are saved: blanks dropped, numbers as numbers.
 * ⛔ A value held under a field the process no longer has is KEPT (Admin says
 * removing a field keeps what cases hold in it) — `previous` carries them.
 * @param {Array<{ key: string, type: string }>} fields
 * @param {Record<string, any>} values
 * @param {Record<string, any>} [previous]  the case's saved values
 */
export function fieldsForSave(fields, values, previous = {}) {
  const current = new Set(fields.map((f) => f.key));
  /** @type {Record<string, any>} */
  const out = Object.fromEntries(Object.entries(previous ?? {}).filter(([k]) => !current.has(k)));
  for (const f of fields) {
    const v = values?.[f.key];
    if (fieldMissing(v)) continue;
    out[f.key] = f.type === 'number' ? Number(v) : typeof v === 'string' ? v.trim() : v;
  }
  return out;
}
