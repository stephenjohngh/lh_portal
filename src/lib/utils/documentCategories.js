// src/lib/utils/documentCategories.js
//
// The document library's categories — what a document IS to this building (an
// EICR, a fire risk assessment, a safety case) — as an admin setting: Admin →
// Other Config → Document categories (2026-10-04, PROJECT_STATUS §6ccc item
// 10, C). They used to be a list in code, so a building with no gas supply was
// offered "Gas Safety" on every upload and could add nothing of its own.
//
// What ships is the starting list. An admin may RENAME one, ADD their own and
// RETIRE one. What is stored (portal_settings, key `document_categories`) is
// only those changes, so a category a later release adds still arrives.
//
// ⛔ A category is never deleted, only retired: `document_library.category`
// holds the value, so a deleted one would leave documents labelled with a code.
// A retired category is not OFFERED any more, and still NAMES the documents
// that carry it. Values never change — a rename changes the label only.
//
// ⛔ READ IT WHEN IT IS USED — `documentCategories()` inside the component, not
// a constant at module scope, which loads before the setting does.
//
// Pure: imports nothing.

export const DOCUMENT_CATEGORIES_KEY = 'document_categories';

/** The shipped list. Its values are stored on documents and never change. */
const SHIPPED = Object.freeze([
  { value: 'installation_cert',    label: 'Installation Certificate' },
  { value: 'test_cert',            label: 'Test Certificate' },
  { value: 'commissioning_cert',   label: 'Commissioning Certificate' },
  { value: 'inspection_report',    label: 'Inspection Report' },
  { value: 'fire_risk_assessment', label: 'Fire Risk Assessment' },
  { value: 'structural_report',    label: 'Structural Report' },
  { value: 'ews1',                 label: 'EWS1' },
  { value: 'safety_case',          label: 'Safety Case' },
  { value: 'asbestos_survey',      label: 'Asbestos Survey' },
  { value: 'eicr',                 label: 'EICR' },
  { value: 'gas_safety',           label: 'Gas Safety' },
  { value: 'warranty',             label: 'Warranty' },
  { value: 'specification',        label: 'Specification' },
  { value: 'invoice',              label: 'Invoice' },
  { value: 'other',                label: 'Other' },
]);
const SHIPPED_VALUES = new Set(SHIPPED.map((c) => c.value));

const MAX_LABEL = 60;

/**
 * @typedef {{ labels: Record<string, string>, added: { value: string, label: string }[], retired: string[] }} CategoryChanges
 */

/** @type {CategoryChanges} */
let changes = { labels: {}, added: [], retired: [] };

/** A stored value for a new label: lower-case words joined by `_`. @param {string} label */
export function categoryValueFor(label) {
  return String(label ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

const cleanLabel = (/** @type {unknown} */ l) => String(l ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);

/**
 * What would be stored: only real changes, each well-formed.
 * @param {unknown} raw
 * @returns {CategoryChanges}
 */
export function cleanDocumentCategories(raw) {
  const v = raw && typeof raw === 'object' ? /** @type {any} */ (raw) : {};
  /** @type {Record<string, string>} */
  const labels = {};
  for (const c of SHIPPED) {
    const l = cleanLabel(v.labels?.[c.value]);
    if (l && l !== c.label) labels[c.value] = l;
  }
  const seen = new Set(SHIPPED_VALUES);
  /** @type {{ value: string, label: string }[]} */
  const added = [];
  for (const a of Array.isArray(v.added) ? v.added : []) {
    const label = cleanLabel(a?.label);
    const value = categoryValueFor(a?.value || label);
    if (!label || !value || seen.has(value)) continue;
    seen.add(value);
    added.push({ value, label });
  }
  const retired = [...new Set((Array.isArray(v.retired) ? v.retired : []).map(String))]
    .filter((x) => seen.has(x)).sort();
  return { labels, added, retired };
}

/**
 * Problems with a proposed set of changes — a list of sentences, empty when
 * all is well. Two categories may not be shown under the same name.
 * @param {unknown} raw
 */
export function validateDocumentCategories(raw) {
  const v = raw && typeof raw === 'object' ? /** @type {any} */ (raw) : {};
  const problems = [];
  for (const a of Array.isArray(v.added) ? v.added : []) {
    if (!cleanLabel(a?.label)) problems.push('A new category needs a name.');
    else if (!categoryValueFor(a?.value || a?.label)) problems.push(`“${a.label}” needs at least one letter or number.`);
  }
  const all = listFor(cleanDocumentCategories(v), { includeRetired: true });
  const byLabel = new Map();
  for (const c of all) {
    const k = c.label.toLowerCase();
    if (byLabel.has(k)) problems.push(`Two categories are called “${c.label}”.`);
    byLabel.set(k, c.value);
  }
  const addedValues = (Array.isArray(v.added) ? v.added : []).map((a) => categoryValueFor(a?.value || a?.label));
  for (const val of addedValues) {
    if (SHIPPED_VALUES.has(val)) problems.push(`“${val}” is already a category — rename that one instead.`);
  }
  return [...new Set(problems)];
}

/** Put an admin's stored changes in force. @param {unknown} raw */
export function setDocumentCategories(raw) {
  changes = cleanDocumentCategories(raw);
  return changes;
}

/** @param {CategoryChanges} ch @param {{ includeRetired?: boolean }} opts */
function listFor(ch, { includeRetired = false } = {}) {
  const retired = new Set(ch.retired);
  const list = [
    ...SHIPPED.map((c) => ({ value: c.value, label: ch.labels[c.value] ?? c.label, shipped: true })),
    ...ch.added.map((c) => ({ ...c, shipped: false })),
  ].map((c) => ({ ...c, retired: retired.has(c.value) }));
  return includeRetired ? list : list.filter((c) => !c.retired);
}

/**
 * The categories in force, for a picker. Retired ones are left out — except
 * `keep`, a document's own current category, so editing it does not lose it.
 * @param {{ includeRetired?: boolean, keep?: string|null }} [opts]
 * @returns {{ value: string, label: string, shipped: boolean, retired: boolean }[]}
 */
export function documentCategories({ includeRetired = false, keep = null } = {}) {
  return listFor(changes, { includeRetired: true })
    .filter((c) => includeRetired || !c.retired || c.value === keep);
}

/** The changes in force, for the Admin screen. */
export function documentCategoryChanges() { return changes; }

/** The shipped list, for "Use default". */
export function shippedDocumentCategories() { return SHIPPED; }

/**
 * A category's name — retired ones included, since documents still carry
 * them. An unknown value shows as itself, never as a guess.
 * @param {string|null|undefined} value
 */
export function categoryLabel(value) {
  if (!value) return '—';
  return listFor(changes, { includeRetired: true }).find((c) => c.value === value)?.label ?? value;
}

/** Whether a category is offered at all now (in force and not retired). @param {string} value */
export function isOfferedCategory(value) {
  return documentCategories().some((c) => c.value === value);
}
