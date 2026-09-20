// src/lib/utils/registerKinds.test.js
//
// The register holds four kinds of row now. These are the two properties that
// stop that being dangerous.
//
// ⛔ THE FAULT THIS GUARDS. The single error this register has found more than
// any other — six separate times — is collapsing two obligations into one row so
// that satisfying one reads as satisfying the other. Putting 55 actions, 3
// absences and 7 caveats into the table the 118 duties live in is exactly the
// shape of that mistake, and the only thing preventing it is that a kind is
// never counted as another.

import { describe, it, expect } from 'vitest';
import { STATUTORY_TEMPLATE } from './statutoryTemplate.js';
import { REGISTER_ITEMS, REGISTER_ACTIONS } from './registerItemsData.js';
import {
  REGISTER_KINDS, KIND_KEYS, ACTION_CATEGORIES, ACTION_PRIORITIES,
  kindOf, ofKind, kindTally, priorityRank,
} from './registerKinds.js';
import { toRow, fromRow, shippedDiffers, ITEM_COLUMNS } from './registerRowMapping.js';

describe('a kind is never counted as another', () => {
  // ⭐ The load-bearing one. `STATUTORY_TEMPLATE` must keep meaning THE
  // REQUIREMENTS, because 173 claims and every test written before actions
  // existed assert things about it.
  it('keeps actions, absences and caveats out of STATUTORY_TEMPLATE', () => {
    const strays = STATUTORY_TEMPLATE.filter(e => kindOf(e) !== 'requirement');
    expect(strays.map(e => e.key), 'a non-requirement reached the register seed').toEqual([]);
  });

  it('keeps requirements out of the items seed', () => {
    const strays = REGISTER_ITEMS.filter(i => kindOf(i) === 'requirement');
    expect(strays.map(i => i.key)).toEqual([]);
  });

  it('gives every shipped row exactly one known kind', () => {
    for (const row of [...STATUTORY_TEMPLATE, ...REGISTER_ITEMS]) {
      expect(KIND_KEYS, row.key).toContain(kindOf(row));
    }
  });

  // ⛔ A tally must account for every row it is given. A kind quietly dropped
  // from the sum is how "118 checks identified" becomes a wrong number nobody
  // notices — four of the statement's own tallies decayed exactly that way.
  it('accounts for every row in a tally', () => {
    const all = [...STATUTORY_TEMPLATE, ...REGISTER_ITEMS];
    const t = kindTally(all);
    expect(t.total).toBe(all.length);
    expect(KIND_KEYS.reduce((n, k) => n + t[k], 0)).toBe(all.length);
  });

  it('ofKind returns only that kind, and never silently widens', () => {
    const all = [...STATUTORY_TEMPLATE, ...REGISTER_ITEMS];
    expect(ofKind(all, 'requirement')).toHaveLength(STATUTORY_TEMPLATE.length);
    expect(ofKind(all, 'action').every(a => a.kind === 'action')).toBe(true);
    expect(ofKind(all, 'nonsense')).toEqual([]);
  });
});

describe('the shipped items are well formed', () => {
  it('has no duplicate key across BOTH seeds', () => {
    const keys = [...STATUTORY_TEMPLATE, ...REGISTER_ITEMS].map(e => e.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes, 'a key exists in both seeds, or twice in one').toEqual([]);
  });

  // ⚠ `consequence` is the half we can assess and the half that sets the order.
  // An action without one is a task nobody can prioritise.
  it('gives every action a category, a priority and a consequence', () => {
    for (const a of REGISTER_ACTIONS) {
      expect(ACTION_CATEGORIES.map(c => c.key), a.key).toContain(a.category);
      expect(ACTION_PRIORITIES.map(p => p.key), a.key).toContain(a.priority);
      expect(a.consequence?.trim(), `${a.key} has no consequence`).toBeTruthy();
    }
  });

  // ⛔ Owner, technical authority and due date stay EMPTY on purpose — filling
  // them with plausible names defeats the point. A blank is conspicuous every
  // time the list is produced; a plausible name is not.
  it('leaves owner, technical authority and due date unassigned', () => {
    for (const a of REGISTER_ACTIONS) {
      expect(a.owner ?? null, a.key).toBeNull();
      expect(a.technicalAuthority ?? null, a.key).toBeNull();
      expect(a.dueDate ?? null, a.key).toBeNull();
    }
  });

  // ⚠ A straight apostrophe inside a single-quoted string once broke sixteen
  // rows of the register at once. The house style is the typographic one.
  it('uses no straight apostrophe', () => {
    const straight = REGISTER_ITEMS.filter(i => JSON.stringify(i).includes(String.fromCharCode(39)));
    expect(straight.map(i => i.key)).toEqual([]);
  });

  it('orders priority within a category, and sorts an unset one last', () => {
    expect(priorityRank({ priority: 'critical' })).toBeLessThan(priorityRank({ priority: 'high' }));
    expect(priorityRank({ priority: 'high' })).toBeLessThan(priorityRank({ priority: 'medium' }));
    expect(priorityRank({})).toBeGreaterThan(priorityRank({ priority: 'medium' }));
  });

  it('says what each kind IS, so the screen can tell somebody', () => {
    for (const k of REGISTER_KINDS) {
      expect(k.label, k.key).toBeTruthy();
      expect(k.one, k.key).toBeTruthy();
      expect(k.blurb?.length, `${k.key} has no blurb to show the reader`).toBeGreaterThan(20);
    }
  });
});

describe('items survive the round trip to a row and back', () => {
  it('reproduces every item unchanged', () => {
    for (const item of REGISTER_ITEMS) {
      expect(fromRow(toRow(item)), item.key).toEqual(item);
    }
  });

  it('emits no column outside the declared sets', () => {
    const declared = new Set([...ITEM_COLUMNS, 'template_key', 'name', 'description']);
    const emitted = new Set(REGISTER_ITEMS.flatMap(i => Object.keys(toRow(i))));
    expect([...emitted].filter(c => !declared.has(c)), 'emitted but not declared').toEqual([]);
  });

  it('puts an action’s category in `action_category`, not `category`', () => {
    // ⚠ A bare `category` beside `group_key` and `basis` would read as a fourth
    // way of classifying a requirement. It applies to one kind.
    const row = toRow(REGISTER_ACTIONS[0]);
    expect(row.action_category).toBeTruthy();
    expect(row.category).toBeUndefined();
  });
});

describe('levelling a settled register does nothing', () => {
  // ⛔ THE BUG THIS EXISTS FOR, AND IT WAS REAL. The first comparison walked the
  // UNION of the shipped entry's fields and the stored row's — and a stored row
  // carries schema defaults the entry has no opinion about (`kind` defaults to
  // 'requirement', `action_status` to 'open', `sort_order` to null). So every
  // requirement differed from ITSELF, and every load would have rewritten all
  // 118 rows. For ever.
  //
  // ⚠ Verified against real production rows before being written down here.
  const asStoredRow = entry => ({
    ...toRow(entry),
    // what the database adds on its own
    kind: entry.kind ?? 'requirement',
    action_category: entry.category ?? null,
    action_status: 'open',
    sort_order: entry.sortOrder ?? null,
    origin: 'seed', seed_modified_at: null, active: true,
    created_at: '2026-09-17T21:58:25.145Z', created_by: 'someone',
    updated_at: null, updated_by: null, citation_verified_by: null,
  });

  it('finds nothing to update on any of the 118 requirements', () => {
    const changed = STATUTORY_TEMPLATE
      .map(e => [e.key, shippedDiffers(e, asStoredRow(e))])
      .filter(([, diff]) => diff.length);
    expect(changed, 'a requirement differs from its own stored row').toEqual([]);
  });

  it('finds nothing to update on any shipped item', () => {
    const changed = REGISTER_ITEMS
      .map(i => [i.key, shippedDiffers(i, asStoredRow(i))])
      .filter(([, diff]) => diff.length);
    expect(changed).toEqual([]);
  });

  // The other half: it must still SEE a real change, or it is not a check.
  it('still notices a column the shipped version disagrees about', () => {
    const e = STATUTORY_TEMPLATE[0];
    const row = { ...asStoredRow(e), name: 'something else entirely' };
    expect(shippedDiffers(e, row)).toContain('name');
  });

  it('treats null and an absent field as the same absence', () => {
    const e = STATUTORY_TEMPLATE.find(x => x.suggestedScope === undefined) ?? STATUTORY_TEMPLATE[0];
    const row = { ...asStoredRow(e), suggested_scope: null };
    expect(shippedDiffers(e, row)).not.toContain('suggested_scope');
  });
});
