// src/lib/apps/compliance/utils/registerItemView.js
//
// Filtering and grouping for the register's NON-requirement kinds — the
// outstanding actions, the reasoned absences and the caveats.
//
// ⭐ WHY THIS IS NOT `filterRegister` WITH A KIND FILTER. Everything in that
// module is REQUIREMENT logic: coverage status, scope, evidence route, the seven
// states, the interval labels. An action has none of those. Asking
// `registerStatus()` what an action's coverage is would produce an answer — and
// a meaningless answer rendered confidently is the failure this whole project
// keeps finding, not a small untidiness.
//
// ⛔ So the kinds do not share a pipeline, and a count from one can never leak
// into a tally of the other. "118 checks identified" stays a statement about
// requirements.

import {
  ACTION_CATEGORIES, ACTION_CATEGORY_LABEL, ACTION_PRIORITIES,
  PRIORITY_LABEL, priorityRank, ofKind,
} from '$lib/utils/registerKinds.js';

const text = v => String(v ?? '').toLowerCase();

/**
 * The items of one kind, filtered.
 *
 * @param {Object[]} items     every row the register holds
 * @param {string} kind        which kind to show
 * @param {{q?: string, category?: string[], priority?: string[], status?: string[]}} [filters]
 * @returns {Object[]}
 */
export function filterItems(items, kind, filters = {}) {
  const q = text(filters.q).trim();
  const has = (sel, v) => !sel?.length || sel.includes(v);

  return ofKind(items, kind).filter((item) => {
    if (!has(filters.category, item.category)) return false;
    if (!has(filters.priority, item.priority)) return false;
    if (!has(filters.status, item.actionStatus ?? 'open')) return false;
    if (!q) return true;
    // ⚠ Searches the consequence too. It is the half that says why an action
    // matters, and somebody looking for "reg 7(4)" will find it there and
    // nowhere else.
    return [item.name, item.description, item.consequence, item.unblocks, item.key]
      .some(f => text(f).includes(q));
  });
}

/**
 * Actions grouped by WHO MUST ACT, each group ordered by priority then by the
 * author's order.
 *
 * ⛔ NEVER ONE FLAT LIST SORTED BY PRIORITY. Priority across categories would be
 * fiction — the duty holder cannot do the fire engineer's work and neither of
 * them can write software — so the top of a globally sorted list would read as
 * "do this next" when it is nothing of the kind.
 *
 * @param {Object[]} items
 * @returns {{key: string, label: string, blurb: string, items: Object[]}[]}
 */
export function groupByCategory(items) {
  return ACTION_CATEGORIES
    .map(c => ({
      key: c.key,
      label: c.label,
      blurb: c.blurb,
      items: (items ?? [])
        .filter(i => i.category === c.key)
        .sort((a, b) => priorityRank(a) - priorityRank(b) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    }))
    .filter(g => g.items.length);
}

/** Items in their author's order — for absences and caveats, which have no category. */
export function inAuthorOrder(items) {
  return [...(items ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/**
 * The groups a kind is displayed in — categories for actions, one unlabelled
 * run for everything else.
 *
 * ⛔ THIS IS A FUNCTION RATHER THAN TWO LINES IN THE COMPONENT BECAUSE IT CAN
 * LOSE A ROW. `groupByCategory` works by filtering on a KNOWN category, so an
 * item whose category is misspelt, renamed or new is simply not in any group —
 * and an absent row looks exactly like a group that is empty. That is the shape
 * of the worst fault this register has produced: the statement grouped on
 * `building_own` while the data said `building_specific`, nothing errored, and
 * nine entries were missing from every version of the document ever generated,
 * including the copy an external reviewer assessed.
 *
 * Extracted so the invariant can be asserted over the real shipped items rather
 * than reasoned about in markup.
 *
 * @param {string} kind
 * @param {Object[]} items  already filtered to that kind
 * @returns {{key: string, label: string, blurb: string, items: Object[]}[]}
 */
export function groupItems(kind, items) {
  if (kind === 'action') return groupByCategory(items);
  return [{ key: kind, label: '', blurb: '', items: inAuthorOrder(items) }];
}

/**
 * How many items of a kind sit in each category and priority.
 * ⚠ Counted over the WHOLE kind, never the filtered view — it is how a filter
 * gets chosen, so it has to show what is there.
 */
export function itemTally(items, kind) {
  const rows = ofKind(items, kind);
  /** @type {Record<string, number>} */
  const byCategory = {};
  /** @type {Record<string, number>} */
  const byPriority = {};
  for (const item of rows) {
    if (item.category) byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    if (item.priority) byPriority[item.priority] = (byPriority[item.priority] ?? 0) + 1;
  }
  return { total: rows.length, byCategory, byPriority };
}

/**
 * The facets for a kind. Actions get category and priority; the other kinds have
 * neither, and are short enough to read without filtering.
 *
 * @param {string} kind
 * @param {{byCategory: Record<string, number>, byPriority: Record<string, number>}} tally
 */
export function itemFilterFields(kind, tally) {
  if (kind !== 'action') return [];
  return [
    { key: 'category', label: 'Who must act', placeholder: 'Anyone', noun: 'groups',
      minWidth: '210px', fixedWidth: true,
      options: ACTION_CATEGORIES
        .filter(c => tally.byCategory[c.key])
        .map(c => ({
          value: c.key,
          label: `${c.label} (${tally.byCategory[c.key]})`,
          short: ACTION_CATEGORY_LABEL[c.key],
        })) },
    { key: 'priority', label: 'Priority', placeholder: 'Any', noun: 'priorities',
      minWidth: '150px', fixedWidth: true,
      options: ACTION_PRIORITIES
        .filter(p => tally.byPriority[p.key])
        .map(p => ({
          value: p.key,
          label: `${p.marker} ${p.label} (${tally.byPriority[p.key]})`,
          short: PRIORITY_LABEL[p.key],
        })) },
  ];
}

/**
 * The reference a person or a document would cite this item by — `A1`, `D19`,
 * `H3` — or null where it has none.
 *
 * ⚠ NOT EVERY KEY IS A REF. Seven of the actions came from the human backlog as
 * named items rather than numbered ones (`h_complaints`, `h_mor`), and printing
 * `H_COMPLAINTS` as though it were a citation would invent an identity nobody
 * uses. A blank is honest; a manufactured ref is not.
 *
 * ⭐ The refs are shown at all because the A/D/H numbering is how these are
 * cited in the statement, the delivery plan and the backlog — three origins for
 * one kind of thing, which is exactly why `category` and not the letter is what
 * the screen groups by.
 */
export function citableRef(item) {
  return /^[adh]\d+$/.test(item?.key ?? '') ? item.key.toUpperCase() : null;
}

/**
 * Which optional section of the Word file each kind is.
 *
 * ⛔ REQUIREMENTS ARE NOT IN HERE, and that is the statement: a register
 * document with no register in it is not a thing, so there is no switch for it.
 * The other three are optional, and whether they are all on is exactly what
 * decides between the obligations statement and an extract of it.
 *
 * ⚠ A kind missing from this map would give the screen a checkbox bound to
 * nothing — it would render unticked whatever the truth was, and ticking it
 * would write a section key the document has never heard of. A test asserts it
 * agrees with the document's own section list.
 */
export const KIND_SECTION = {
  action: 'actions',
  absence: 'absences',
  caveat: 'caveats',
};
