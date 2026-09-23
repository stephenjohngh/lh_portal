// src/lib/apps/compliance/utils/registerFilter.js
//
// Filtering and grouping for the two lists in the Compliance app: the
// compliance obligations REGISTER (statutory_register, seeded from code) and
// the PLANNED OBLIGATIONS configured for this building (statutory_obligations).
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
  GROUPS, GROUP_LABEL, BASIS, BASIS_LABEL, BASIS_RANK, HANDLED_BY_LABEL,
  TRIGGER_TYPE_LABEL,
} from '$lib/utils/statutoryTemplate.js';
import { EVIDENCE_ROUTE_LABEL } from '$lib/utils/obligationEvidence.js';
import {
  DUTY_HOLDER_ROLES, dutyHolderRole, unclassifiedDutyHolders, dutyHolderTally,
} from '$lib/utils/dutyHolderRole.js';

/**
 * Every state a register entry can be in, most-actionable first. The order is
 * the order the sections used to appear in, and it drives the count strip.
 */
export const REGISTER_STATUS = [
  'not_covered', 'awaiting_setup', 'no_home', 'elsewhere',
  'scheduled', 'not_applicable', 'superseded',
];

/**
 * The same seven states, said in full.
 *
 * ⭐ A LABEL ON A COUNT IS A NAME, NOT AN EXPLANATION. "Added — needs scope"
 * tells somebody who already knows what a scope is; the count strip is exactly
 * where a person meets these words for the first time. The tooltip used to read
 * "Show only: Added — needs scope", which repeats the label and teaches nothing.
 *
 * ⚠ Written for somebody who has never seen the screen, and kept to one
 * sentence — a tooltip nobody finishes reading is the same as no tooltip.
 */
export const REGISTER_STATUS_EXPLAINED = {
  not_covered:    'This building has to do it, and nothing here does it yet',
  awaiting_setup: 'Added to this building, but nobody has said which parts of the building it covers',
  no_home:        'A real duty that no part of this portal can schedule or record',
  elsewhere:      'Another part of the portal already runs this on its own cycle',
  scheduled:      'A check is set up, switched on, and counts as covering this',
  not_applicable: 'Somebody recorded a decision that this does not apply to this building',
  superseded:     'No longer required by law, so it is not counted against you',
};

export const REGISTER_STATUS_LABEL = {
  not_covered:    'Not covered',
  awaiting_setup: 'Added — needs scope',
  no_home:        'Nothing deals with it',
  elsewhere:      'Tracked in another app',
  scheduled:      'Scheduled here',
  not_applicable: 'Not applicable',
  superseded:     'No longer required',
};

/** Row tint class per status — kept beside the labels so they cannot diverge. */
export const REGISTER_STATUS_CLASS = {
  not_covered: 'gap', awaiting_setup: 'part', no_home: 'gap', elsewhere: 'else',
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
 * @param {{coveredKeys?: Set<string>, dismissedKeys?: Set<string>, awaitingKeys?: Set<string>}} [ctx]
 * @returns {string} a REGISTER_STATUS value
 */
export function registerStatus(entry, ctx = {}) {
  const covered   = ctx.coveredKeys   ?? new Set();
  const dismissed = ctx.dismissedKeys ?? new Set();
  const awaiting  = ctx.awaitingKeys  ?? new Set();
  if (isSuperseded(entry))       return 'superseded';
  if (covered.has(entry.key))    return 'scheduled';
  if (dismissed.has(entry.key))  return 'not_applicable';
  if (!isSchedulable(entry))     return isUnhomed(entry) ? 'no_home' : 'elsewhere';
  // ⚠ AFTER the three above and BEFORE 'not_covered'. An obligation that
  // exists but is switched off is NOT covered — `templateCoverage` says so
  // deliberately and that stays true. This only separates two things that were
  // being shown identically: one somebody switched OFF, and one that apply
  // created and nobody has finished. The second is a work queue; the first is a
  // decision. ⛔ It is styled as a gap, never as covered — the duty is not
  // being discharged either way. Same shape as `assured` vs `ok` in the
  // compliance report: a third state, not a softened one.
  if (awaiting.has(entry.key))   return 'awaiting_setup';
  return 'not_covered';
}

/** The text a search matches against. Kept in one place so the fields a person
 *  can search by are visible rather than buried in a predicate. */
function haystack(entry) {
  return [
    entry.name, entry.statutoryRef, entry.description,
    entry.appliesWhen, entry.responsibleParty, entry.statutoryDutyHolder, entry.key,
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
      && has(filters.trigger,  triggerTypeOf(entry))
      && has(filters.dutyHolder, dutyHolderRole(entry))
      && has(filters.citation, citationState(entry));
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
  // ⚠ Least-discretionary FIRST within a group — legislation, then standards,
  // then contract, then our own controls. A compliance reader opening a section
  // should meet the legal duties before the conventions.
  //
  // This was `registerByGroup()`'s behaviour and had its own test. Replacing the
  // two view tabs with one list on 2026-09-17 dropped it silently; removing that
  // dead function in R1 is what surfaced the loss. Restored here, with the test
  // moved across rather than deleted.
  const byRank = (a, b) =>
    (BASIS_RANK[a.entry.basis] ?? 99) - (BASIS_RANK[b.entry.basis] ?? 99);

  return [...byGroup]
    .filter(([, list]) => list.length > 0)
    .map(([group, list]) => ({
      group, label: GROUP_LABEL[group] ?? group, rows: [...list].sort(byRank),
    }));
}

/**
 * ⭐ HOW EACH REQUIREMENT ACTUALLY GETS DONE — the four-way split the user drew,
 * and it was already in the data with nothing showing it as one shape.
 *
 * The user: *"could the top level be requirements register — the list of
 * building management requirements — underneath this it splits into inspections
 * — either in-house or contractor — contractor maintenance visits, and what
 * else?"* It splits into four, not three, and the field that does it already
 * existed: `evidencedBy` gives the first two, `handledBy` separates the last two.
 * Until now the Evidence facet gave you half and the status strip the other
 * half, so nobody would ever see it as a tree.
 *
 * ⛔ IN-HOUSE VERSUS CONTRACTOR IS NOT A FOURTH BRANCH, and it is not recorded.
 * The only candidate is `responsibleParty`, free text with 47 distinct values,
 * and 27 of the 57 contractor-route rows name no contractor in it at all —
 * they name who is ACCOUNTABLE. Deriving it would be the `ventilation_stack`
 * mistake again: reading what a thing IS off a label describing something else.
 * Who actually turns up is a fact about this building's arrangements, and it
 * belongs on the work (where a job already carries a `contractor_id`).
 */
export const ROUTE_GROUPS = [
  { key: 'inspection', label: 'Done by an in-house walk',
    blurb: 'Somebody here walks round with the phone and records what they find.' },
  { key: 'maintenance_job', label: 'Done by a booked contractor visit',
    blurb: 'A visit you book. The certificate or report that comes back is the evidence.' },
  { key: 'elsewhere', label: 'Tracked in another part of the portal',
    blurb: 'Already has its own cycle somewhere else. Scheduling it here would give it a second, competing due date.' },
  { key: 'no_home', label: 'Nothing here can schedule it',
    blurb: 'A real duty that no part of this portal can put a date on. Named so it is not mistaken for an oversight.' },
];

/** Which of the four a requirement belongs to. */
export function routeGroupOf(entry) {
  if (entry?.evidencedBy === 'inspection') return 'inspection';
  if (entry?.evidencedBy) return 'maintenance_job';
  return (!entry?.handledBy || entry.handledBy === 'none') ? 'no_home' : 'elsewhere';
}

/**
 * The same rows, grouped by how they get done rather than by subject.
 *
 * ⚠ Same shape as `groupRegisterRows` and the same ordering rule inside a
 * group, so the list markup does not care which it was handed.
 */
export function groupRegisterRowsByRoute(rows) {
  const byRank = (a, b) =>
    (BASIS_RANK[a.entry.basis] ?? 99) - (BASIS_RANK[b.entry.basis] ?? 99);
  return ROUTE_GROUPS
    .map(g => ({
      group: g.key,
      label: g.label,
      blurb: g.blurb,
      rows: rows.filter(r => routeGroupOf(r.entry) === g.key).sort(byRank),
    }))
    .filter(g => g.rows.length > 0);
}

/** Facet definitions for the register bar — the options a person can pick.
 *  Built from the register's own vocabularies, so a new basis or group cannot
 *  appear in the data without appearing in the filter. */
export function registerFilterFields(tally, dutyTally, citationTally) {
  return [
    { key: 'status', label: 'Status', placeholder: 'All statuses', noun: 'statuses', minWidth: '150px',
      options: REGISTER_STATUS.map(s => ({
        value: s, label: `${REGISTER_STATUS_LABEL[s]} (${tally?.[s] ?? 0})`, short: REGISTER_STATUS_LABEL[s],
      })) },
    // ⚠ Every facet states a minWidth wide enough for its LONGEST option.
    // Without one the button is sized by its summary, so choosing a long value
    // ("Risk or condition", "Management decision") widened the button and
    // reflowed every facet after it — the bar rearranging itself as a side
    // effect of using it. The summary still truncates rather than growing.
    { key: 'basis', label: 'Source', placeholder: 'Any source', noun: 'sources', minWidth: '160px',
      options: BASIS.map(b => ({ value: b, label: BASIS_LABEL[b] })) },
    { key: 'group', label: 'Group', placeholder: 'All groups', noun: 'groups', minWidth: '150px',
      options: GROUPS.map(g => ({ value: g, label: GROUP_LABEL[g] })) },
    { key: 'evidence', label: 'Evidence', placeholder: 'Any route', noun: 'routes', minWidth: '150px',
      options: [
        { value: 'inspection',      label: EVIDENCE_ROUTE_LABEL.inspection },
        { value: 'maintenance_job', label: EVIDENCE_ROUTE_LABEL.maintenance_job },
        { value: 'none',            label: 'Neither — not schedulable' },
      ] },
    { key: 'citation', label: 'Citation', placeholder: 'Any', noun: 'states', minWidth: '170px',
      options: Object.entries(CITATION_STATE_LABEL).map(([v, label]) => ({
        value: v, label: citationTally ? `${label} (${citationTally[v] ?? 0})` : label, short: label,
      })) },
    { key: 'trigger', label: 'Trigger', placeholder: 'Any trigger', noun: 'triggers', minWidth: '150px',
      options: Object.entries(TRIGGER_TYPE_LABEL).map(([v, label]) => ({ value: v, label })) },
    // ⚠ Labelled "Duty holder", never "Responsible" — the register keeps who
    // bears a duty in law apart from who performs the work, deliberately.
    { key: 'dutyHolder', label: 'Duty holder', placeholder: 'Any duty holder',
      noun: 'duty holders', minWidth: '170px',
      // Roles with no entries are dropped rather than shown as (0) — there are
      // nine possible and this building uses most of them, so a dead option is
      // noise. Falls back to all roles if no tally is supplied, so a caller
      // forgetting it loses the counts, never the facet.
      options: (dutyTally ? DUTY_HOLDER_ROLES.filter(r => (dutyTally[r] ?? 0) > 0) : DUTY_HOLDER_ROLES)
        .map(r => ({
          value: r,
          label: dutyTally ? `${DUTY_HOLDER_ROLE_LABEL[r]} (${dutyTally[r]})` : DUTY_HOLDER_ROLE_LABEL[r],
          short: DUTY_HOLDER_ROLE_LABEL[r],
        })) },
  ];
}

// ── Who bears the duty IN LAW ────────────────────────────────────────────────
//
// ⚠ `statutoryDutyHolder` is NOT `responsibleParty`, and keeping them apart is
// the whole reason the field exists. Round 12 of the external review found
// "Responsible: Site staff" standing on eight rows whose statutory duty is the
// Responsible Person's — the register asserting that a legal duty had been
// transferred to a cleaner. `statutoryDutyHolder` says who bears it in law
// (which follows from the INSTRUMENT, so a catalogue can hold it);
// `responsibleParty` says who performs the work.
//
// The stored values are full sentences, each carrying its own citation — right
// for a document, useless as a dropdown. So a short ROLE is derived for
// filtering only; the sentence is what gets displayed.
//
// ⛔ The derivation must stay TOTAL. `assertDutyHolderRolesTotal()` fails if any
// entry lands on 'other', so rewording a duty holder cannot silently drop a row
// out of its facet — the failure mode of every "infer a category from prose"
// scheme, and one this project has already been bitten by.

// ⚠ The roles and the derivation moved to `$lib/utils/dutyHolderRole.js`, which
// imports nothing — so `check:obligations` runs under plain node and checks the
// counts §4 of the statement quotes against the SAME classifier this facet uses.
// A second copy of the rule would let the app's facet and the document's prose
// disagree about what a role is, over the same register.
// Re-exported here so every existing import site is unchanged.
export { DUTY_HOLDER_ROLES, dutyHolderRole, unclassifiedDutyHolders, dutyHolderTally };

export const DUTY_HOLDER_ROLE_LABEL = {
  responsible_person:           'Responsible person (Fire Safety Order)',
  principal_accountable_person: 'Principal accountable person (BSA)',
  accountable_person:           'Accountable person (BSA)',
  shared_ap_rp:                 'Shared — AP and responsible person',
  employer_or_controller:       'Employer / person in control',
  asbestos_duty_holder:         'Asbestos duty holder',
  none_own_control:             'No statutory duty holder — our own control',
  none_contract:                'No statutory duty holder — contract',
  none_code:                    'No statutory duty holder — a code, not statute',
};

/**
 * The same roles, short enough to sit on a collapsed row.
 *
 * ⚠ A FACET MUST BE VISIBLE IN WHAT IT FILTERS. Four of the seven register
 * facets used to filter on something the row never displayed — most of all
 * Trigger, which appeared nowhere in the panel at all — so picking one narrowed
 * 116 rows to 33 with nothing on screen saying why. That is indistinguishable
 * from a broken filter.
 *
 * ⛔ These must stay in step with `DUTY_HOLDER_ROLE_LABEL`, because the row and
 * the facet disagreeing about what a role is called is the same confusion
 * pointed the other way. A test asserts the two maps carry identical keys.
 */
export const DUTY_HOLDER_ROLE_SHORT = {
  responsible_person:           'Responsible person',
  principal_accountable_person: 'Principal AP',
  accountable_person:           'Accountable person',
  shared_ap_rp:                 'Shared AP + RP',
  employer_or_controller:       'Employer / controller',
  asbestos_duty_holder:         'Asbestos duty holder',
  none_own_control:             'No duty holder in law',
  none_contract:                'No duty holder in law',
  none_code:                    'No duty holder in law',
};

/**
 * Whether this row’s CITATION has been checked against the instrument.
 *
 * ⚠ The citation only. The review that produced the evidence says in terms that
 * the intervals and the applicability conditions were NOT checked, so this must
 * never be read — or named — as "the row is verified".
 *
 * ⚠ Two states today because every row is seeded. The third, `local` and never
 * checked by anyone, arrives with the in-app editor; see the build plan §4.1.
 * @param {Object} entry
 * @returns {'verified'|'not_recorded'}
 */
export function citationState(entry) {
  return entry?.citationVerifiedAgainst ? 'verified' : 'not_recorded';
}

export const CITATION_STATE_LABEL = {
  verified:     'Citation verified',
  not_recorded: 'Citation not individually recorded',
};

/** The same two states, short enough for a collapsed row. ⛔ Same keys as
 *  `CITATION_STATE_LABEL`, asserted by a test — see `DUTY_HOLDER_ROLE_SHORT`. */
export const CITATION_STATE_SHORT = {
  verified:     'Citation checked',
  not_recorded: 'Citation not recorded',
};

// ── Making the facets visible on the row ─────────────────────────────────────
//
// ⛔ THE RULE: a person must be able to see, on the row, the thing they filtered
// by. Reported by the user on 2026-09-19 — *"there are a set of filters but I
// cant see all those fields in the presentation"* — and they were right about
// all four: Evidence, Citation and Duty holder were in the expanded detail only,
// and TRIGGER was rendered nowhere in the panel at all. Filtering to the 33
// calendar rows changed the list and left nothing on screen explaining the
// selection.
//
// Three facets are already visible and are NOT repeated here: Status is the
// right-hand pill, Source is the badge beside the name, and Group is the section
// heading the row sits under.

/** Facets whose value the row already shows by other means. */
export const ROW_VISIBLE_FACETS = new Set(['status', 'basis', 'group']);

/**
 * The facet values to print on a collapsed row, in the facets' OWN words — the
 * row and the filter must not use different vocabulary for one fact.
 *
 * @param {Object} entry
 * @returns {{key: string, text: string, title: string}[]}
 */
export function rowFacetSummary(entry) {
  const role = dutyHolderRole(entry);
  const cite = citationState(entry);
  const trigger = triggerTypeOf(entry);
  return [
    { key: 'evidence',
      text:  EVIDENCE_ROUTE_LABEL[entry?.evidencedBy] ?? 'Not schedulable here',
      title: 'Evidence route' },
    { key: 'trigger',
      text:  TRIGGER_TYPE_LABEL[trigger] ?? trigger,
      title: 'What makes this fall due' },
    { key: 'dutyHolder',
      text:  DUTY_HOLDER_ROLE_SHORT[role] ?? role,
      title: `Duty holder in law — ${DUTY_HOLDER_ROLE_LABEL[role] ?? role}` },
    { key: 'citation',
      text:  CITATION_STATE_SHORT[cite] ?? cite,
      title: CITATION_STATE_LABEL[cite] ?? cite },
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
    // ⚠ Every counted option needs a `short` WITHOUT the count. The count is
    // useful while choosing and wrong afterwards: the button and the pill use
    // `short`, so without one a figure from the moment you opened the dropdown
    // sits frozen in the summary of a filter you set ten minutes ago.
    { key: 'source', label: 'Origin', placeholder: 'Any origin', noun: 'origins', minWidth: '150px',
      options: [
        { value: 'register', label: `From the register (${count(d => !!d.template_key)})`,
          short: 'From the register' },
        { value: 'own',      label: `Our own (${count(d => !d.template_key)})`,
          short: 'Our own' },
      ] },
    { key: 'scope', label: 'Scope', placeholder: 'Any scope', noun: 'scopes', minWidth: '150px',
      options: [
        { value: 'unscoped', label: `No scope set (${count(hasEmptyScope)})`,
          short: 'No scope set' },
        { value: 'scoped',   label: `Scoped (${count(d => !hasEmptyScope(d))})`,
          short: 'Scoped' },
      ] },
  ];
}

/** Handy for the "N of M" headings both lists show. */
export { GROUP_LABEL, BASIS_LABEL, HANDLED_BY_LABEL, isRecurring };
