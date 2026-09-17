// src/lib/utils/registerRowMapping.test.js
//
// TYPE-1. The round trip is the whole point: a field quietly missing from a
// 35-field mapping is invisible — the row saves, the screen renders, and one
// piece of information is gone. This asserts every one of the 116 seed entries
// survives entry → row → entry unchanged.

import { describe, it, expect } from 'vitest';
import { STATUTORY_TEMPLATE } from './statutoryTemplate.js';
import { toRow, fromRow, toColumn, toField, REGISTER_COLUMNS } from './registerRowMapping.js';

describe('column naming', () => {
  it('renames only the three that cannot take their own name', () => {
    // `group` and `trigger` are SQL reserved words; `key` is the identity the
    // obligation and exclusion tables already link on.
    expect(toColumn('key')).toBe('template_key');
    expect(toColumn('group')).toBe('group_key');
    expect(toColumn('trigger')).toBe('trigger_event');
  });

  it('converts everything else mechanically', () => {
    expect(toColumn('statutoryRef')).toBe('statutory_ref');
    expect(toColumn('maxIsSchedulingTolerance')).toBe('max_is_scheduling_tolerance');
    expect(toColumn('citationVerifiedAgainst')).toBe('citation_verified_against');
    expect(toColumn('name')).toBe('name');
  });

  it('round-trips every name in the register', () => {
    const fields = new Set(STATUTORY_TEMPLATE.flatMap(e => Object.keys(e)));
    for (const f of fields) expect(toField(toColumn(f)), f).toBe(f);
  });
});

describe('entry → row → entry', () => {
  it('⛔ loses nothing, for all 116 entries', () => {
    // The guard this file exists for. If a field is added to the register and
    // the mapping cannot carry it, this fails rather than the information
    // disappearing silently.
    for (const entry of STATUTORY_TEMPLATE) {
      expect(fromRow(toRow(entry)), entry.key).toEqual(entry);
    }
  });

  it('keeps an explicit null distinct from an absent field', () => {
    // ⚠ The distinction the provenance model rests on: a row whose citation was
    // never individually checked has NO citationVerifiedAgainst. A null would
    // make that indistinguishable from "checked and found nothing".
    const unchecked = STATUTORY_TEMPLATE.find(e => !e.citationVerifiedAgainst);
    const checked   = STATUTORY_TEMPLATE.find(e => e.citationVerifiedAgainst);
    expect(unchecked).toBeDefined();
    expect(checked).toBeDefined();

    expect('citationVerifiedAgainst' in fromRow(toRow(unchecked))).toBe(false);
    expect(fromRow(toRow(checked)).citationVerifiedAgainst).toBe(checked.citationVerifiedAgainst);

    // ...while a field the seed sets to null explicitly keeps its null.
    const withNullTrigger = STATUTORY_TEMPLATE.find(e => e.trigger === null);
    expect(fromRow(toRow(withNullTrigger)).trigger).toBeNull();
  });

  it('drops the columns the database owns', () => {
    const row = { ...toRow(STATUTORY_TEMPLATE[0]),
      origin: 'seed', active: true, created_at: 'x', created_by: 'y',
      updated_at: 'z', updated_by: 'w', seed_modified_at: null };
    const back = fromRow(row);
    for (const k of ['origin', 'active', 'createdAt', 'createdBy',
                     'updatedAt', 'updatedBy', 'seedModifiedAt']) {
      expect(k in back, k).toBe(false);
    }
  });

  it('carries the structured fields, not just the strings', () => {
    const scoped = STATUTORY_TEMPLATE.find(e => e.suggestedScope);
    expect(scoped).toBeDefined();
    expect(fromRow(toRow(scoped)).suggestedScope).toEqual(scoped.suggestedScope);

    const numeric = STATUTORY_TEMPLATE.find(e => typeof e.frequencyDays === 'number');
    expect(fromRow(toRow(numeric)).frequencyDays).toBe(numeric.frequencyDays);

    const flagged = STATUTORY_TEMPLATE.find(e => e.maxIsSchedulingTolerance);
    expect(fromRow(toRow(flagged)).maxIsSchedulingTolerance).toBe(true);
  });

  it('⛔ emits EXACTLY the declared column set — the guard the schema needed', () => {
    // The round trip above passed while `handling_note` had no column in
    // migration 211: it proves the mapping is self-consistent, not that the
    // schema can hold it. This is the list a new DDL gets diffed against, and a
    // new register field fails here until it is added — which is the prompt to
    // write the migration.
    const emitted = new Set(STATUTORY_TEMPLATE.flatMap(e => Object.keys(toRow(e))));
    const declared = new Set(REGISTER_COLUMNS);
    expect([...emitted].filter(c => !declared.has(c)), 'emitted but not declared').toEqual([]);
    expect([...declared].filter(c => !emitted.has(c)), 'declared but never emitted').toEqual([]);
  });

  it('every register field has a column, and no column is invented', () => {
    // Belt and braces on the round trip: name every column the mapping emits,
    // so a reviewer of migration 211 can diff this list against the DDL.
    const columns = new Set(STATUTORY_TEMPLATE.flatMap(e => Object.keys(toRow(e))));
    expect(columns.has('template_key')).toBe(true);
    expect(columns.has('group_key')).toBe(true);
    expect(columns.has('trigger_event')).toBe(true);
    expect(columns.has('key')).toBe(false);
    expect(columns.has('group')).toBe(false);
    expect(columns.has('trigger')).toBe(false);
    expect(columns.size).toBe(new Set(STATUTORY_TEMPLATE.flatMap(e => Object.keys(e))).size);
  });
});
