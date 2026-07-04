// src/lib/apps/inspection/utils/checklistRules.test.js
import { describe, it, expect } from 'vitest';
import { applyChecklistMode, deriveChecklistOutcome } from './checklistRules.js';

const defs = [
  { id: 'a1', name: 'Door gap' },
  { id: 'a2', name: 'Closer working' },
  { id: 'a3', name: 'Signage' },
];

describe('applyChecklistMode', () => {
  it('passes through unchanged with no definition (ad-hoc / repair)', () => {
    expect(applyChecklistMode(defs, null)).toBe(defs);
    expect(applyChecklistMode(defs, undefined)).toBe(defs);
  });

  it("passes through unchanged for checklist_mode='type_driven'", () => {
    expect(applyChecklistMode(defs, { checklist_mode: 'type_driven', checklist_attr_ids: ['a1'] })).toBe(defs);
  });

  it("'explicit' keeps only the named attrs", () => {
    const out = applyChecklistMode(defs, { checklist_mode: 'explicit', checklist_attr_ids: ['a2', 'a3'] });
    expect(out.map(d => d.id)).toEqual(['a2', 'a3']);
  });

  it("'explicit' with ids not on this type yields their intersection", () => {
    const out = applyChecklistMode(defs, { checklist_mode: 'explicit', checklist_attr_ids: ['a1', 'other-type-attr'] });
    expect(out.map(d => d.id)).toEqual(['a1']);
  });

  it("'explicit' with an empty (or missing) id list yields an empty checklist", () => {
    expect(applyChecklistMode(defs, { checklist_mode: 'explicit', checklist_attr_ids: [] })).toEqual([]);
    expect(applyChecklistMode(defs, { checklist_mode: 'explicit' })).toEqual([]);
  });
});

describe('deriveChecklistOutcome', () => {
  it('any fail → failed, with the failed names, even with checks unanswered', () => {
    const o = deriveChecklistOutcome(defs, { a1: false }, 'manual');
    expect(o.result).toBe('failed');
    expect(o.anyFail).toBe(true);
    expect(o.failedNames).toEqual(['Door gap']);
  });

  it('all pass → ok', () => {
    const o = deriveChecklistOutcome(defs, { a1: true, a2: true, a3: true }, 'manual');
    expect(o.result).toBe('ok');
    expect(o.allPass).toBe(true);
    expect(o.failedNames).toEqual([]);
  });

  it('partially answered, no fails → undetermined (null)', () => {
    const o = deriveChecklistOutcome(defs, { a1: true }, 'manual');
    expect(o.result).toBeNull();
    expect(o.anyFail).toBe(false);
    expect(o.allPass).toBe(false);
  });

  it('no checks at all → undetermined, never ok', () => {
    const o = deriveChecklistOutcome([], {}, 'manual');
    expect(o.result).toBeNull();
    expect(o.allPass).toBe(false);
  });

  it("enforced only under 'all_checks_pass' AND with checks present", () => {
    expect(deriveChecklistOutcome(defs, {}, 'manual').enforced).toBe(false);
    expect(deriveChecklistOutcome(defs, {}, 'all_checks_pass').enforced).toBe(true);
    // no pass/fail checks → falls back to manual (otherwise unsavable)
    expect(deriveChecklistOutcome([], {}, 'all_checks_pass').enforced).toBe(false);
  });

  it('multiple fails list every failed name in checklist order', () => {
    const o = deriveChecklistOutcome(defs, { a1: false, a2: true, a3: false }, 'all_checks_pass');
    expect(o.result).toBe('failed');
    expect(o.failedNames).toEqual(['Door gap', 'Signage']);
  });
});
