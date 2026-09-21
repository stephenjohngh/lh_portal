// @vitest-environment jsdom
//
// src/lib/apps/compliance/components/RegisterItemsList.test.js
//
// TYPE-2 — the three kinds that had no screen.
//
// ⭐ WHY A DOM TEST AND NOT ONLY THE PURE ONES. The fault this closes is not a
// wrong answer, it is an ABSENT one: 55 outstanding actions, 3 reasoned absences
// and 7 caveats reached the Word export and no place a person could read them.
// A pure test of the grouping cannot tell you whether anything rendered, and
// this project has now found the same shape three separate times — a field
// carried and displayed nowhere, an action built with tests and no affordance,
// a filter with no matching display. Each was found by a person using the
// screen, never by a check. So: does it reach the page?

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import RegisterItemsList from './RegisterItemsList.svelte';
import { REGISTER_ITEMS } from '$lib/utils/registerItemsData.js';
import { ofKind, ACTION_CATEGORIES } from '$lib/utils/registerKinds.js';

afterEach(cleanup);

const forKind = k => ofKind(REGISTER_ITEMS, k);

describe('every item of the kind reaches the page', () => {
  // ⚠ Reads the REAL shipped items rather than a fixture — a fixture
  // transcribing register data is what broke tests four rounds running here.
  for (const kind of ['action', 'absence', 'caveat']) {
    it(`renders all ${forKind(kind).length} ${kind}s by name`, () => {
      render(RegisterItemsList, { kind, items: REGISTER_ITEMS });
      for (const item of forKind(kind)) {
        // ⚠ An exact-string query: the names carry markdown emphasis and
        // typographic punctuation, and a normalising matcher would hide a name
        // rendered with its markers still in it.
        expect(screen.getByText(item.name, { exact: true }), item.key).toBeInTheDocument();
      }
    });
  }

  it('shows no item of another kind', () => {
    render(RegisterItemsList, { kind: 'caveat', items: REGISTER_ITEMS });
    for (const item of forKind('action')) {
      expect(screen.queryByText(item.name), item.key).not.toBeInTheDocument();
    }
  });
});

describe('an action says who must act, and what is not assigned', () => {
  it('heads each group with the category and its explanation', () => {
    render(RegisterItemsList, { kind: 'action', items: REGISTER_ITEMS });
    const used = new Set(forKind('action').map(a => a.category));
    for (const c of ACTION_CATEGORIES.filter(c => used.has(c.key))) {
      expect(screen.getByText(c.label), c.key).toBeInTheDocument();
      expect(screen.getByText(c.blurb), c.key).toBeInTheDocument();
    }
  });

  // ⛔ Round 6: "the warning itself can become permanent". An unassigned action
  // is conspicuous every time it is read; a paragraph saying several are
  // unassigned is not. Owner, technical authority and due date are empty on
  // every shipped action, and the screen must say so rather than omit the line.
  it('prints NOT ASSIGNED three times on an opened action', async () => {
    const one = forKind('action')[0];
    render(RegisterItemsList, { kind: 'action', items: REGISTER_ITEMS });
    expect(screen.queryAllByText('NOT ASSIGNED')).toHaveLength(0);
    await screen.getByText(one.name).click();
    expect(screen.getAllByText('NOT ASSIGNED').length).toBe(3);
  });

  it('does not offer an owner line on a caveat, which has no owner', async () => {
    const one = forKind('caveat')[0];
    render(RegisterItemsList, { kind: 'caveat', items: REGISTER_ITEMS });
    await screen.getByText(one.name).click();
    expect(screen.queryAllByText('NOT ASSIGNED')).toHaveLength(0);
  });
});

describe('the filter bar appears only where it earns its place', () => {
  it('offers Who must act and Priority on the actions', () => {
    render(RegisterItemsList, { kind: 'action', items: REGISTER_ITEMS });
    expect(screen.getByText('Who must act')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
  });

  // Three caveats. A filter bar over three rows is furniture.
  it('offers none on the caveats', () => {
    render(RegisterItemsList, { kind: 'caveat', items: REGISTER_ITEMS });
    expect(screen.queryByText('Who must act')).not.toBeInTheDocument();
    expect(screen.queryByText('Search')).not.toBeInTheDocument();
  });
});

describe('whether these reach the Word file', () => {
  it('shows the section switch in the state it was given', () => {
    const { unmount } = render(RegisterItemsList,
      { kind: 'action', items: REGISTER_ITEMS, included: false });
    expect(/** @type {HTMLInputElement} */ (
      screen.getByLabelText('Include these in the Word file')).checked).toBe(false);
    unmount();
    render(RegisterItemsList, { kind: 'action', items: REGISTER_ITEMS, included: true });
    expect(/** @type {HTMLInputElement} */ (
      screen.getByLabelText('Include these in the Word file')).checked).toBe(true);
  });
});

describe('⛔ a row that could not be placed is reported, never silently absent', () => {
  // The banner exists because `groupItems` drops an item with an unknown
  // category, and an absent row is indistinguishable from a group that matched
  // nothing. Proved by handing it exactly that.
  it('says so when an item has a category no group covers', () => {
    const rogue = { ...forKind('action')[0], key: 'x9', name: 'Rogue', category: 'no_such' };
    render(RegisterItemsList, { kind: 'action', items: [...REGISTER_ITEMS, rogue] });
    expect(screen.queryByText('Rogue')).not.toBeInTheDocument();
    expect(screen.getByText(/could not be shown below/)).toBeInTheDocument();
  });

  it('says nothing of the sort on the shipped items', () => {
    render(RegisterItemsList, { kind: 'action', items: REGISTER_ITEMS });
    expect(screen.queryByText(/could not be shown below/)).not.toBeInTheDocument();
  });
});
