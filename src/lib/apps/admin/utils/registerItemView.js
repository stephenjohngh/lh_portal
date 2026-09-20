// src/lib/apps/admin/utils/registerItemView.js
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
