import { describe, it, expect } from 'vitest';
import {
  STEP_KINDS, LIMITS, LINK_TARGETS, stepProblems, publishProblems, renumber, moveStep,
  specificity, linkApplies, matchGuides, stepsFor, diffVersions, hasUnpublishedChanges,
} from './guideModel.js';

const guides = {
  g1: { id: 'g1', title: 'Emergency lighting overview' },
  g2: { id: 'g2', title: 'Testing a luminaire' },
  g3: { id: 'g3', title: 'Door gap' },
  g4: { id: 'g4', title: 'Alarm panel test mode' },
};
const L = (o) => ({ guide_id: 'g1', step_ids: null, ...o });

describe('steps', () => {
  it('a good step has no problems', () => {
    expect(stepProblems({ kind: 'step', title: 'Open the door', body: 'Use the key', photos: [] })).toEqual([]);
  });
  it('needs a title and a known kind', () => {
    expect(stepProblems({ kind: 'step', title: '  ' })).toHaveLength(1);
    expect(stepProblems({ kind: 'nonsense', title: 'x' })[0]).toMatch(/not one of the options/);
  });
  it('a stop step must say who to call', () => {
    expect(stepProblems({ kind: 'stop', title: 'Stop', body: '' })[0]).toMatch(/who to call/);
    expect(stepProblems({ kind: 'stop', title: 'Stop', body: 'Call the office' })).toEqual([]);
  });
  it('keeps text short and photos to four', () => {
    expect(stepProblems({ title: 'x', body: 'a'.repeat(LIMITS.bodyChars + 1) })[0]).toMatch(/split it/);
    expect(stepProblems({ title: 'x'.repeat(LIMITS.titleChars + 1) })[0]).toMatch(/title/);
    expect(stepProblems({ title: 'x', photos: [1, 2, 3, 4, 5] })[0]).toMatch(/at most 4 photos/);
    expect(stepProblems({ title: 'x', photos: [1, 2, 3, 4] })).toEqual([]);
  });
  it('every kind the database accepts is a kind here', () => {
    expect(STEP_KINDS).toEqual(['step', 'caution', 'stop', 'good', 'bad']);
  });
});

describe('publishProblems — the same list guide_publish() enforces', () => {
  const ok = { kind: 'step', title: 'One' };
  it('a titled guide with a good step can be published', () => {
    expect(publishProblems({ title: 'Bins', status: 'draft' }, [ok])).toEqual([]);
  });
  it('needs a title and at least one step', () => {
    expect(publishProblems({ title: '' }, [ok])[0]).toMatch(/title/);
    expect(publishProblems({ title: 'x' }, [])[0]).toMatch(/at least one step/);
  });
  it('a retired guide cannot be republished', () => {
    expect(publishProblems({ title: 'x', status: 'retired' }, [ok])[0]).toMatch(/retired/);
  });
  it('names the step that is wrong', () => {
    const p = publishProblems({ title: 'x' }, [ok, { kind: 'stop', title: 'Stop' }]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^Step 2:/);
  });
  it('how long it takes is a whole number of minutes in range', () => {
    expect(publishProblems({ title: 'x', minutes: 0 }, [ok])).toHaveLength(1);
    expect(publishProblems({ title: 'x', minutes: 1.5 }, [ok])).toHaveLength(1);
    expect(publishProblems({ title: 'x', minutes: 20 }, [ok])).toEqual([]);
  });
});

describe('ordering', () => {
  const s = [{ id: 'a', position: 3 }, { id: 'b', position: 1 }, { id: 'c', position: 2 }];
  it('renumbers 1..n with no gaps', () => {
    expect(renumber(s).map((x) => [x.id, x.position])).toEqual([['b', 1], ['c', 2], ['a', 3]]);
    expect(renumber([{ id: 'x', position: 9 }, { id: 'y', position: 40 }]).map((x) => x.position)).toEqual([1, 2]);
  });
  it('moves a step up or down and renumbers', () => {
    const r = renumber(s);
    expect(moveStep(r, 2, -1).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(moveStep(r, 0, 1).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(moveStep(r, 0, 1).map((x) => x.position)).toEqual([1, 2, 3]);
  });
  it('does nothing past either end', () => {
    const r = renumber(s);
    expect(moveStep(r, 0, -1).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(moveStep(r, 2, 1).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('which guide applies — the right part at the right place', () => {
  const ctxLuminaire = { obligation_id: 'ob-el', component_type_id: 'ty-lum', component_id: 'c-14' };

  it('a link applies only when every target it sets matches', () => {
    expect(linkApplies(L({ obligation_id: 'ob-el' }), ctxLuminaire)).toBe(true);
    expect(linkApplies(L({ obligation_id: 'ob-el', component_type_id: 'ty-lum' }), ctxLuminaire)).toBe(true);
    expect(linkApplies(L({ obligation_id: 'ob-el', component_type_id: 'ty-door' }), ctxLuminaire)).toBe(false);
    expect(linkApplies(L({ obligation_id: 'other' }), ctxLuminaire)).toBe(false);
  });
  it('a link that sets nothing never applies, and a missing context value never matches', () => {
    expect(linkApplies(L({}), ctxLuminaire)).toBe(false);
    expect(linkApplies(L({ type_attribute_id: 'at-gap' }), ctxLuminaire)).toBe(false);
  });
  it('compares ids as text, so a number and its string agree', () => {
    expect(linkApplies(L({ space_id: 7 }), { space_id: '7' })).toBe(true);
  });
  it('specificity counts the targets set', () => {
    expect(specificity(L({}))).toBe(0);
    expect(specificity(L({ obligation_id: 'a' }))).toBe(1);
    expect(specificity(L({ obligation_id: 'a', component_type_id: 'b', type_attribute_id: 'c' }))).toBe(3);
  });

  it('at the walk start only the obligation-level guide shows', () => {
    const links = [
      L({ guide_id: 'g1', obligation_id: 'ob-el' }),
      L({ guide_id: 'g2', obligation_id: 'ob-el', component_type_id: 'ty-lum' }),
    ];
    const m = matchGuides(links, { obligation_id: 'ob-el' }, guides);
    expect(m.map((x) => x.guideId)).toEqual(['g1']);
  });
  it('at a component the more specific guide comes first', () => {
    const links = [
      L({ guide_id: 'g1', obligation_id: 'ob-el' }),
      L({ guide_id: 'g2', obligation_id: 'ob-el', component_type_id: 'ty-lum' }),
      L({ guide_id: 'g4', component_id: 'c-14' }),
    ];
    const m = matchGuides(links, ctxLuminaire, guides);
    expect(m.map((x) => x.guideId)).toEqual(['g2', 'g4', 'g1']);
    // g2 (2 targets) first; the two 1-target ones by title (Alarm… before Emergency…)
    expect(m[0].specificity).toBe(2);
  });
  it('at a single check, the check-level guide is found', () => {
    const links = [L({ guide_id: 'g3', type_attribute_id: 'at-gap' })];
    expect(matchGuides(links, { ...ctxLuminaire, type_attribute_id: 'at-gap' }, guides).map((x) => x.guideId)).toEqual(['g3']);
    expect(matchGuides(links, ctxLuminaire, guides)).toEqual([]);
  });
  it('a link to a guide that is not readable is dropped, not an error', () => {
    const links = [L({ guide_id: 'gone', obligation_id: 'ob-el' }), L({ guide_id: 'g1', obligation_id: 'ob-el' })];
    expect(matchGuides(links, { obligation_id: 'ob-el' }, guides).map((x) => x.guideId)).toEqual(['g1']);
  });
  it('one guide matched twice appears once, at its most specific match', () => {
    const links = [
      L({ guide_id: 'g1', obligation_id: 'ob-el' }),
      L({ guide_id: 'g1', obligation_id: 'ob-el', component_type_id: 'ty-lum' }),
    ];
    const m = matchGuides(links, ctxLuminaire, guides);
    expect(m).toHaveLength(1);
    expect(m[0].specificity).toBe(2);
  });
  it('the steps named by several links are united; a link naming none means the whole guide', () => {
    const part = (ids, o = {}) => L({ guide_id: 'g1', step_ids: ids, obligation_id: 'ob-el', ...o });
    expect(matchGuides([part(['s1']), part(['s2'], { component_type_id: 'ty-lum' })], ctxLuminaire, guides)[0].stepIds.sort())
      .toEqual(['s1', 's2']);
    expect(matchGuides([part(['s1']), part(null, { component_type_id: 'ty-lum' })], ctxLuminaire, guides)[0].stepIds).toBeNull();
  });
  it('works with a Map of guides as well as an object', () => {
    const map = new Map(Object.entries(guides));
    expect(matchGuides([L({ guide_id: 'g1', obligation_id: 'ob-el' })], { obligation_id: 'ob-el' }, map)).toHaveLength(1);
  });
  it('every context key is a link target (the two vocabularies cannot drift)', () => {
    expect(LINK_TARGETS).toEqual(['obligation_id', 'component_type_id', 'type_attribute_id',
      'component_id', 'space_id', 'planner_series_id', 'workflow_key']);
  });
});

describe('the steps a match shows', () => {
  const snap = { steps: [{ id: 's3', position: 3 }, { id: 's1', position: 1 }, { id: 's2', position: 2 }] };
  it('all steps in order, or only those named', () => {
    expect(stepsFor(snap, null).map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(stepsFor(snap, ['s3', 's1']).map((s) => s.id)).toEqual(['s1', 's3']);
  });
  it('a step the version no longer has is ignored', () => {
    expect(stepsFor(snap, ['s2', 'gone']).map((s) => s.id)).toEqual(['s2']);
  });
  it('an empty or missing snapshot shows nothing', () => {
    expect(stepsFor({}, null)).toEqual([]);
    expect(stepsFor(undefined, ['x'])).toEqual([]);
  });
});

describe('what changed between versions', () => {
  const v1 = { title: 'Bins', steps: [{ id: 'a', title: 'Open', body: 'x', kind: 'step', photos: [] }, { id: 'b', title: 'Wheel', body: '', kind: 'step', photos: [] }] };
  it('is empty for identical copies', () => {
    expect(diffVersions(v1, v1)).toEqual({ added: [], removed: [], changed: [], titleChanged: false });
  });
  it('finds added, removed and changed steps and a new title', () => {
    const v2 = { title: 'Bins 2', steps: [{ id: 'a', title: 'Open', body: 'CHANGED', kind: 'step', photos: [] }, { id: 'c', title: 'New', body: '', kind: 'step', photos: [] }] };
    expect(diffVersions(v1, v2)).toEqual({ added: ['New'], removed: ['Wheel'], changed: ['Open'], titleChanged: true });
  });
  it('a photo added counts as a change', () => {
    const v2 = { ...v1, steps: [{ ...v1.steps[0], photos: [{}] }, v1.steps[1]] };
    expect(diffVersions(v1, v2).changed).toEqual(['Open']);
  });
});

describe('unpublished changes', () => {
  it('a never-published guide always has them', () => {
    expect(hasUnpublishedChanges({ updated_at: '2026-10-30T10:00:00Z' }, null)).toBe(true);
  });
  it('edits after publishing do; the publish write itself does not', () => {
    const v = { published_at: '2026-10-30T10:00:00.000Z' };
    expect(hasUnpublishedChanges({ updated_at: '2026-10-30T10:00:00.400Z' }, v)).toBe(false);
    expect(hasUnpublishedChanges({ updated_at: '2026-10-30T10:05:00Z' }, v)).toBe(true);
  });
});
