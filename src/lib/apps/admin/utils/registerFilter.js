// src/lib/apps/admin/utils/registerFilter.js
//
// Filtering and grouping for the two lists on Admin > Inspections: the periodic
// activity REGISTER (116 catalogue entries, in code) and the OBLIGATIONS
// actually configured for this building (statutory_obligations rows).
//
// Pure — no stores, no DOM — so the awkward part is Type-1 testable and the
// components stay declarative. See CLAUDE.md "Testing".
//
// ── Why a status FUNCTION and not a set of sections ──────────────────────────
// The panel used to render six hand-written sections, each with its own row
// markup, and a separate `statusOf()` used only by a seventh ("full register")
// view. So a status could be computed one way for the badge and implied another
// way by which section a row landed in. There is now ONE function; a section is
// just a filter over its result, which is also what makes "Not covered" a
// filter value rather than a view mode.

import {
  isSchedulable, isRecurring, isUnhomed, isSuperseded, triggerTypeOf,
  GROUPS, GROUP_LABEL, BASIS, BASIS_LABEL, HANDLED_BY_LABEL, TRIGGER_TYPE_LABEL,
} from '$lib/utils/statutoryTemplate.js';
import { EVIDENCE_ROUTE_LABEL } from '$lib/utils/obligationEvidence.js';

/**
 * Every state a register entry can be in, most-actionable first. The order is
 * the order the sections used to appear in, and it drives the count strip.
 */
export const REGISTER_STATUS = [
  'not_covered', 'no_home', 'elsewhere', 'scheduled', 'not_applicable', 'superseded',
];

export const REGISTER_STATUS_LABEL = {
  not_covered:    'Not covered',
  no_home:        'Nothing deals with it',
  elsewhere:      'Tracked in another app',
  scheduled:      'Scheduled here',
  not_applicable: 'Not applicable',
  superseded:     'No longer required',
};

/** Row tint class per status — kept beside the labels so they cannot diverge. */
export const REGISTER_STATUS_CLASS = {
  not_covered: 'gap', no_home: 'gap', elsewhere: 'else',
  scheduled: 'ok', not_applicable: 'na', superseded: 'na',
};

/**
 * What state one register entry is in for this building.
 *
 * ⚠ Order matters. Withdrawn is tested FIRST: whether we happen to be doing
 * something the law no longer requires is not a compliance question, and
 * without that branch a repealed requirement falls through and reads as a gap.
 *
 * @param {Object} entry
 * @param {{coveredKeys?: Set<string>, dismissedKeys?: Set<string>}} [ctx]
 * @returns {string} a REGISTER_STATUS value
 */
export function registerStatus(entry, ctx = {}) {
  const covered   = ctx.coveredKeys   ?? new Set();
  const dismissed = ctx.dismissedKeys ?? new Set();
  if (isSuperseded(entry))       return 'superseded';
  if (covered.has(entry.key))    return 'scheduled';
  if (dismissed.has(entry.key))  return 'not_applicable';
  if (!isSchedulable(entry))     return isUnhomed(entry) ? 'no_home' : 'elsewhere';
  return 'not_covered';
}

/** The text a search matches against. Kept in one place so the fields a person
 *  can search by are visible rather than buried in a predicate. */
function haystack(entry) {
  return [
    entry.name, entry.statutoryRef, entry.description,
    entry.appliesWhen, entry.responsibleParty, entry.key,
  ].filter(Boolean).join(' ').toLowerCase();
}

/** True when every active facet admits this entry. An empty Set means "all",
 *  which is what lets the bar start unfiltered without special-casing. */
function matches(entry, filters, status) {
  const has = (set, value) => !set || set.size === 0 || set.has(value);
  return has(filters.status,   status)
      && has(filters.basis,    entry.basis)
      && has(filters.group,    entry.group)
      && has(filters.evidence, entry.evidencedBy ?? 'none')
      && has(filters.trigger,  triggerTypeOf(entry));
}

/**
 * Filter register entries. Returns `{ entry, status }` pairs so a caller never
 * recomputes the status it just filtered on.
 *
 * @param {Object[]} entries
 * @param {Object} [filters]  { q, status, basis, group, evidence, trigger }
 * @param {Object} [ctx]      { coveredKeys, dismissedKeys }
 * @returns {{entry: Object, status: string}[]}
 */
export function filterRegister(entries, filters = {}, ctx = {}) {
  const q = String(filters.q ?? '').trim().toLowerCase();
  const out = [];
  for (const entry of entries) {
    const status = registerStatus(entry, ctx);
    if (!matches(entry, filters, status)) continue;
    if (q && !haystack(entry).includes(q)) continue;
    out.push({ entry, status });
  }
  return out;
}

/**
 * How many entries are in each status, over the WHOLE register rather than the
 * filtered view — the strip is how you choose a filter, so it has to show what
 * is there, not what survives the filter you already applied.
 * @returns {Record<string, number>}
 */
export function registerStatusTally(entries, ctx = {}) {
  /** @type {Record<string, number>} */
  const tally = Object.fromEntries(REGISTER_STATUS.map(s => [s, 0]));
  for (const entry of entries) tally[registerStatus(entry, ctx)]++;
  return tally;
}

/**
 * Group rows for display, in the register's own GROUPS order, dropping groups
 * with nothing in them so the filtered view has no empty headings.
 * @param {{entry: Object, status: string}[]} rows
 * @returns {{group: string, label: string, rows: Object[]}[]}
 */
export function groupRegisterRows(rows) {
  /** @type {Map<string, Object[]>} */
  const byGroup = new Map(GROUPS.map(g => [g, []]));
  for (const row of rows) {
    const list = byGroup.get(row.entry.group) ?? [];
    if (!byGroup.has(row.entry.group)) byGroup.set(row.entry.group, list);
    list.push(row);
  }
  return [...byGroup]
    .filter(([, list]) => list.length > 0)
    .map(([group, list]) => ({ group, label: GROUP_LABEL[group] ?? group, rows: list }));
}

/** Facet definitions for the register bar — the options a person can pick.
 *  Built from the register's own vocabularies, so a new basis or group cannot
 *  appear in the data without appearing in the filter. */
export function registerFilterFields(tally) {
  return [
    { key: 'status', label: 'Status', placeholder: 'All statuses', noun: 'statuses', minWidth: '150px',
      options: REGISTER_STATUS.map(s => ({
        value: s, label: `${REGISTER_STATUS_LABEL[s]} (${tally?.[s] ?? 0})`, short: REGISTER_STATUS_LABEL[s],
      })) },
    { key: 'basis', label: 'Source', placeholder: 'Any source', noun: 'sources',
      options: BASIS.map(b => ({ value: b, label: BASIS_LABEL[b] })) },
    { key: 'group', label: 'Group', placeholder: 'All groups', noun: 'groups', minWidth: '150px',
      options: GROUPS.map(g => ({ value: g, label: GROUP_LABEL[g] })) },
    { key: 'evidence', label: 'Evidence', placeholder: 'Any route', noun: 'routes', minWidth: '150px',
      options: [
        { value: 'inspection',      label: EVIDENCE_ROUTE_LABEL.inspection },
        { value: 'maintenance_job', label: EVIDENCE_ROUTE_LABEL.maintenance_job },
        { value: 'none',            label: 'Neither — not schedulable' },
      ] },
    { key: 'trigger', label: 'Trigger', placeholder: 'Any trigger', noun: 'triggers',
      options: Object.entries(TRIGGER_TYPE_LABEL).map(([v, label]) => ({ value: v, label })) },
  ];
}

// ── The obligations list ─────────────────────────────────────────────────────
// Five rows today and ~84 the moment the register is applied, which is the next
// thing on the backlog — so it gets the same treatment now rather than a second
// round of this later.

export const OBLIGATION_STATE = ['active', 'inactive', 'retired'];
export const OBLIGATION_STATE_LABEL = {
  active: 'Active', inactive: 'Switched off', retired: 'No longer required',
};

/**
 * ⚠ Retired is tested before active for the same reason `registerStatus` tests
 * withdrawn first: a retired obligation may still carry `active = true`, and
 * showing it as active would say the building is doing something the law no
 * longer asks for.
 * @param {Object} d  a statutory_obligations row
 */
export function obligationState(d) {
  if (d.retired_on) return 'retired';
  return d.active ? 'active' : 'inactive';
}

/** An obligation whose scope is empty matches EVERY component — safe to be
 *  wrong in that direction, but each needs scoping by hand, so it is worth
 *  being able to list them. */
export function hasEmptyScope(d) {
  const scope = d.scope ?? {};
  return Object.values(scope).every(v => v == null || (Array.isArray(v) && v.length === 0));
}

/**
 * @param {Object[]} defs  statutory_obligations rows
 * @param {Object} [filters]  { q, state, evidence, source }
 */
export function filterObligations(defs, filters = {}) {
  const q = String(filters.q ?? '').trim().toLowerCase();
  const has = (set, value) => !set || set.size === 0 || set.has(value);
  return defs.filter(d => {
    if (!has(filters.state, obligationState(d))) return false;
    if (!has(filters.evidence, d.evidenced_by ?? 'none')) return false;
    if (filters.source?.size) {
      const source = d.template_key ? 'register' : 'own';
      if (!filters.source.has(source)) return false;
    }
    if (filters.scope?.size) {
      const scope = hasEmptyScope(d) ? 'unscoped' : 'scoped';
      if (!filters.scope.has(scope)) return false;
    }
    if (q) {
      const text = [d.name, d.description, d.statutory_ref, d.template_key]
        .filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });
}

/** Facets for the obligations bar. */
export function obligationFilterFields(defs = []) {
  const count = (fn) => defs.filter(fn).length;
  return [
    { key: 'state', label: 'State', placeholder: 'All states', noun: 'states', minWidth: '150px',
      options: OBLIGATION_STATE.map(s => ({
        value: s, label: `${OBLIGATION_STATE_LABEL[s]} (${count(d => obligationState(d) === s)})`,
        short: OBLIGATION_STATE_LABEL[s],
      })) },
    { key: 'evidence', label: 'Evidence', placeholder: 'Any route', noun: 'routes', minWidth: '150px',
      options: [
        { value: 'inspection',      label: EVIDENCE_ROUTE_LABEL.inspection },
        { value: 'maintenance_job', label: EVIDENCE_ROUTE_LABEL.maintenance_job },
      ] },
    { key: 'source', label: 'Origin', placeholder: 'Any origin', noun: 'origins', minWidth: '150px',
      options: [
        { value: 'register', label: `From the register (${count(d => !!d.template_key)})` },
        { value: 'own',      label: `Our own (${count(d => !d.template_key)})` },
      ] },
    { key: 'scope', label: 'Scope', placeholder: 'Any scope', noun: 'scopes', minWidth: '150px',
      options: [
        { value: 'unscoped', label: `Matches everything (${count(hasEmptyScope)})` },
        { value: 'scoped',   label: `Scoped (${count(d => !hasEmptyScope(d))})` },
      ] },
  ];
}

/** Handy for the "N of M" headings both lists show. */
export { GROUP_LABEL, BASIS_LABEL, HANDLED_BY_LABEL, isRecurring };
