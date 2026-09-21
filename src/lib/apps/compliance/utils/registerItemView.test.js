// src/lib/apps/compliance/utils/registerItemView.test.js
//
// The screen for the register's non-requirement kinds.
//
// ⚠ These read the REAL shipped items, never fixtures. A fixture transcribing
// register data is what broke tests four rounds running here — a correction to
// the data failed a test about the mapping. So every assertion below is an
// invariant that holds whatever the items happen to say.

import { describe, it, expect } from 'vitest';
import { REGISTER_ITEMS } from '$lib/utils/registerItemsData.js';
import {
  ACTION_CATEGORIES, ACTION_PRIORITIES, KIND_KEYS, ofKind, priorityRank,
} from '$lib/utils/registerKinds.js';
import {
  filterItems, groupByCategory, groupItems, inAuthorOrder,
  itemTally, itemFilterFields, citableRef, KIND_SECTION,
} from './registerItemView.js';
// ⚠ A server module, imported HERE only. The screen must not pull `docx` into
// the client bundle — but the one thing worth cross-checking is that the screen
// and the document agree about what the optional sections are.
import { SECTION_KEYS } from '$lib/server/registerDocx.js';

const ACTIONS = ofKind(REGISTER_ITEMS, 'action');
const DISPLAYED_KINDS = KIND_KEYS.filter(k => k !== 'requirement');
const placed = groups => groups.reduce((n, g) => n + g.items.length, 0);

describe('⛔ nothing is lost between the filter and the page', () => {
  // The worst fault this register has produced was exactly this shape: the
  // statement grouped on `building_own` while the data said `building_specific`,
  // nothing errored, and nine entries were absent from every version of the
  // document ever generated — including the copy an external reviewer assessed.
  it('places every shipped item of every displayed kind in a group', () => {
    for (const kind of DISPLAYED_KINDS) {
      const mine = ofKind(REGISTER_ITEMS, kind);
      expect(mine.length, kind).toBeGreaterThan(0);
      expect(placed(groupItems(kind, mine)), kind).toBe(mine.length);
    }
  });

  it('places each action in exactly one group', () => {
    const seen = groupItems('action', ACTIONS).flatMap(g => g.items.map(i => i.key));
    expect(new Set(seen).size).toBe(ACTIONS.length);
  });

  // ⚠ Proved by injection: this is the failure mode, demonstrated. An item with
  // an unrecognised category disappears silently and its group simply is not
  // rendered — indistinguishable, on the page, from a category nobody has work
  // in. The component shows a red banner when the counts disagree; this is why.
  it('loses an item whose category is not a known one, and the count says so', () => {
    const rogue = [...ACTIONS, { ...ACTIONS[0], key: 'x9', category: 'no_such_group' }];
    const groups = groupItems('action', rogue);
    expect(placed(groups)).toBe(rogue.length - 1);
    expect(groups.some(g => g.items.some(i => i.key === 'x9'))).toBe(false);
  });
});

describe('⛔ a kind is never shown as another', () => {
  it('returns only the kind asked for', () => {
    for (const kind of DISPLAYED_KINDS) {
      const out = filterItems(REGISTER_ITEMS, kind);
      expect(out.length).toBeGreaterThan(0);
      expect(out.every(i => i.kind === kind), kind).toBe(true);
    }
  });

  it('counts the whole kind and no other, filtered view or not', () => {
    for (const kind of DISPLAYED_KINDS) {
      const tally = itemTally(REGISTER_ITEMS, kind);
      expect(tally.total, kind).toBe(ofKind(REGISTER_ITEMS, kind).length);
    }
    // Every action has a category and a priority, so both breakdowns account for
    // all of them. A kind with neither contributes nothing to either.
    const t = itemTally(REGISTER_ITEMS, 'action');
    const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(t.byCategory)).toBe(t.total);
    expect(sum(t.byPriority)).toBe(t.total);
    expect(itemTally(REGISTER_ITEMS, 'caveat').byCategory).toEqual({});
  });
});

describe('order', () => {
  // ⛔ Priority orders WITHIN a category and never across one. The duty holder
  // cannot do the fire engineer's work and neither of them can write software,
  // so the top of a globally sorted list would read as "do this next" when it is
  // nothing of the kind.
  it('sorts by priority inside each group, and never reorders the groups', () => {
    const groups = groupItems('action', ACTIONS);
    expect(groups.map(g => g.key))
      .toEqual(ACTION_CATEGORIES.map(c => c.key).filter(k => groups.some(g => g.key === k)));
    for (const g of groups) {
      const ranks = g.items.map(priorityRank);
      expect([...ranks].sort((a, b) => a - b), g.key).toEqual(ranks);
    }
  });

  it('keeps absences and caveats in the author’s order', () => {
    const caveats = inAuthorOrder(ofKind(REGISTER_ITEMS, 'caveat'));
    const orders = caveats.map(c => c.sortOrder ?? 0);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe('search', () => {
  it('finds an action by its reference, its name and its consequence', () => {
    const one = ACTIONS[0];
    for (const q of [one.key, one.name.slice(0, 20), one.consequence.slice(10, 40)]) {
      expect(filterItems(REGISTER_ITEMS, 'action', { q }).some(i => i.key === one.key), q)
        .toBe(true);
    }
  });

  it('narrows to a chosen category and priority', () => {
    const cat = ACTION_CATEGORIES[0].key;
    const out = filterItems(REGISTER_ITEMS, 'action', { category: [cat] });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every(i => i.category === cat)).toBe(true);
    const crit = filterItems(REGISTER_ITEMS, 'action', { priority: ['critical'] });
    expect(crit.every(i => i.priority === 'critical')).toBe(true);
  });
});

describe('the facets', () => {
  it('offers them only where there is something to filter', () => {
    const t = itemTally(REGISTER_ITEMS, 'action');
    expect(itemFilterFields('action', t).map(f => f.key)).toEqual(['category', 'priority']);
    // ⚠ Three caveats and seven absences. A filter bar over ten rows is
    // furniture, and the screen says so by not having one.
    for (const kind of ['absence', 'caveat']) {
      expect(itemFilterFields(kind, itemTally(REGISTER_ITEMS, kind)), kind).toEqual([]);
    }
  });

  // §6n: a facet whose value is nowhere on the row is indistinguishable from a
  // broken filter. Both of these ARE on the row — priority as its marker, and
  // category as the group heading the row sits under — which is why the list is
  // grouped rather than flat.
  it('filters only on things the list itself shows', () => {
    const groups = groupItems('action', ACTIONS);
    expect(groups.every(g => g.label && g.blurb)).toBe(true);
    expect(ACTIONS.every(a => ACTION_PRIORITIES.some(p => p.key === a.priority))).toBe(true);
  });

  // §6o: a button with only a min-width grows to fit its summary and shoves
  // every facet after it sideways; a counted label frozen into that summary is a
  // figure from whenever the dropdown was last opened.
  it('declares a width, and a clean short label for every counted option', () => {
    for (const f of itemFilterFields('action', itemTally(REGISTER_ITEMS, 'action'))) {
      expect(f.minWidth, f.key).toBeTruthy();
      for (const o of f.options) {
        expect(o.label, `${f.key}/${o.value}`).toMatch(/\(\d+\)$/);
        expect(o.short, `${f.key}/${o.value}`).toBeTruthy();
        expect(o.short).not.toMatch(/\(\d+\)\s*$/);
        expect(o.short.length).toBeLessThanOrEqual(o.label.length);
      }
    }
  });

  it('omits a category nothing sits in', () => {
    const t = { byCategory: { process: 2 }, byPriority: { high: 2 } };
    expect(itemFilterFields('action', t)[0].options.map(o => o.value)).toEqual(['process']);
  });
});

describe('the citable reference', () => {
  // ⚠ The A/D/H numbering is how these are cited in the statement, the delivery
  // plan and the backlog — but seven came across as named items rather than
  // numbered ones, and printing `H_COMPLAINTS` would invent a citation nobody
  // uses. A blank is honest; a manufactured ref is not.
  it('gives a ref where there is one and nothing where there is not', () => {
    expect(citableRef({ key: 'a1' })).toBe('A1');
    expect(citableRef({ key: 'd19' })).toBe('D19');
    expect(citableRef({ key: 'h7' })).toBe('H7');
    expect(citableRef({ key: 'h_complaints' })).toBe(null);
    expect(citableRef({ key: 'cav_intent' })).toBe(null);
    expect(citableRef({ key: 'abs_dwellings' })).toBe(null);
    expect(citableRef(undefined)).toBe(null);
  });

  it('never gives two shipped items the same ref', () => {
    const refs = REGISTER_ITEMS.map(citableRef).filter(Boolean);
    expect(refs.length).toBeGreaterThan(0);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe('⛔ the screen and the document agree about the optional sections', () => {
  // A kind missing from `KIND_SECTION` gives the screen a checkbox bound to
  // nothing: it renders unticked whatever the truth is, and ticking it writes a
  // section key the document has never heard of. Neither errors, and both read
  // as an answer.
  it('maps every displayed kind onto a section the document has', () => {
    expect(Object.keys(KIND_SECTION).sort()).toEqual([...DISPLAYED_KINDS].sort());
    expect(Object.values(KIND_SECTION).sort()).toEqual([...SECTION_KEYS].sort());
  });

  it('has no section the screen cannot reach', () => {
    for (const s of SECTION_KEYS) {
      expect(Object.values(KIND_SECTION), s).toContain(s);
    }
  });
});

describe('groupByCategory on its own', () => {
  it('drops an empty category rather than rendering an empty heading', () => {
    const out = groupByCategory(ACTIONS.filter(a => a.category === 'software'));
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('software');
  });

  it('survives nothing at all', () => {
    expect(groupByCategory([])).toEqual([]);
    expect(groupByCategory(undefined)).toEqual([]);
    expect(inAuthorOrder(undefined)).toEqual([]);
  });
});
