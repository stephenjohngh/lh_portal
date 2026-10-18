// src/lib/workflow/workflowFieldValues.js
//
// A process's FIELD VALUES, pure (migration 253 for Cases; any process since
// 254, when the values moved onto the workflow item, `workflow_items.fields`).
// The field definitions are the workflow's (workflow_fields, Admin →
// Workflows); an item holds its values keyed by the field's key. The database
// checks every value again (workflow_clean_fields()) and keeps the change in
// the item's history.
//
// ⛔ A person field is a PORTAL USER (profiles) — never a resident.

import { buildComponentRef } from '#lib/utils/componentRef.js';
import { buildSpaceRef } from '#lib/utils/spaceRef.js';
import { fmtDateOnly } from '#lib/utils/dates.js';
import { fieldMissing } from './workflowModel.js';

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
 * database's own test (case_open()) — or null.
 * @param {Array<{ key: string, label: string, required_on_create?: boolean, position?: number }>} fields
 * @param {Record<string, any>} values
 */
export function missingToOpen(fields, values) {
  const f = [...fields].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .find((x) => x.required_on_create && fieldMissing(values?.[x.key]));
  return f ? `Fill in "${f.label}" to open a case.` : null;
}

/** A value as it is compared and sent: text trimmed, blank as null. @param {any} v */
const norm = (v) => (fieldMissing(v) ? null : typeof v === 'string' ? v.trim() : String(v));

/**
 * What changed between the saved values and a draft, as the database takes
 * it (workflow_set_fields / case_open): only the process's current fields, a
 * cleared one as null (removes it). A value held under a field the process no
 * longer has is never sent, so it is kept.
 * @param {Array<{ key: string }>} fields
 * @param {Record<string, any>} draft
 * @param {Record<string, any>} [saved]
 * @returns {Record<string, string|null>}
 */
export function fieldChanges(fields, draft, saved = {}) {
  /** @type {Record<string, string|null>} */
  const out = {};
  for (const f of fields) {
    const now = norm(draft?.[f.key]);
    if (now !== norm(saved?.[f.key])) out[f.key] = now;
  }
  return out;
}

/** The draft for an item: a value for every current field ('' when none). */
export function fieldDraft(/** @type {Array<{ key: string }>} */ fields, /** @type {Record<string, any>} */ saved = {}) {
  return Object.fromEntries(fields.map((f) => [f.key, saved?.[f.key] ?? '']));
}
