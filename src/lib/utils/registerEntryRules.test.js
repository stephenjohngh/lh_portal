// src/lib/utils/registerEntryRules.test.js
//
// TYPE-1. These are the invariants that SHIP, as distinct from the 173 claims
// in check:register which guard the seed at build time and are gitignored.
//
// ⚠ The strongest assertion here is the last one: every one of the 116 seeded
// entries must pass these rules. A rule the standard register itself breaks is
// a wrong rule, and this is what says so.

import { describe, it, expect } from 'vitest';
import { STATUTORY_TEMPLATE } from './statutoryTemplate.js';
import { validateRegisterEntry, problemsByField, suggestKey } from './registerEntryRules.js';

/** A well-formed minimum, to vary one field at a time from. */
const ok = (over = {}) => ({
  key: 'new_requirement', name: 'A new requirement',
  description: 'What it involves.', group: 'fire_safety', basis: 'statute',
  statutoryRef: 'Some Act 2027, s.1', appliesWhen: 'Always',
  evidencedBy: 'maintenance_job', frequencyDays: 365, ...over,
});

const fieldsFailing = (entry, ctx) =>
  validateRegisterEntry(entry, ctx).map(p => p.field);

describe('a well-formed entry', () => {
  it('passes', () => {
    expect(validateRegisterEntry(ok())).toEqual([]);
  });
});

describe('identity', () => {
  it('requires a key, and one shaped like a key', () => {
    expect(fieldsFailing(ok({ key: '' }))).toContain('key');
    expect(fieldsFailing(ok({ key: 'Not A Key' }))).toContain('key');
    expect(fieldsFailing(ok({ key: 'ab' }))).toContain('key');
    expect(fieldsFailing(ok({ key: '9lives' }))).toContain('key');
    expect(fieldsFailing(ok({ key: 'fine_key_9' }))).not.toContain('key');
  });

  it('refuses a key already in the register, but only for a NEW entry', () => {
    const taken = { existingKeys: new Set(['fser_communal_fire_doors']) };
    expect(fieldsFailing(ok({ key: 'fser_communal_fire_doors' }), { ...taken, isNew: true }))
      .toContain('key');
    // Editing the row that already owns the key is not a clash.
    expect(fieldsFailing(ok({ key: 'fser_communal_fire_doors' }), { ...taken, isNew: false }))
      .not.toContain('key');
  });

  it('requires a name, a description, a group and a basis', () => {
    expect(fieldsFailing(ok({ name: '  ' }))).toContain('name');
    expect(fieldsFailing(ok({ description: '' }))).toContain('description');
    expect(fieldsFailing(ok({ group: 'invented' }))).toContain('group');
    expect(fieldsFailing(ok({ basis: '' }))).toContain('basis');
  });
});

describe('⛔ a citation is required', () => {
  it('refuses an entry that cannot say what requires it', () => {
    // An entry with no reference is a note, not a register entry. The whole
    // discipline is that a reader can tell law from convention.
    expect(fieldsFailing(ok({ statutoryRef: '' }))).toContain('statutoryRef');
  });
});

describe('applicability', () => {
  it('requires a stated condition — "Always" counts, empty does not', () => {
    // The catalogue rule is "condition, do not assert". An empty box claims it
    // always applies without saying so.
    expect(fieldsFailing(ok({ appliesWhen: '' }))).toContain('appliesWhen');
    expect(fieldsFailing(ok({ appliesWhen: 'Always' }))).not.toContain('appliesWhen');
  });
});

describe('cadence', () => {
  it('⚠ refuses a schedulable row that can never fall due', () => {
    // It would read "never run" for ever. The register's own tests found this
    // on the BAC row, and the fix there was to stop it being schedulable.
    expect(fieldsFailing(ok({ frequencyDays: null }))).toContain('frequencyDays');
    // ...unless it is event-driven, which is a legitimate way to fall due.
    expect(fieldsFailing(ok({ frequencyDays: null, trigger: 'On a significant change' })))
      .not.toContain('frequencyDays');
    // ...and a row nothing schedules needs neither.
    expect(fieldsFailing(ok({ frequencyDays: null, evidencedBy: null })))
      .not.toContain('frequencyDays');
  });

  it('⛔ refuses a bare day ceiling — the round-14 rule, generalised', () => {
    // No instrument anywhere says "366 days"; that is our arithmetic on the
    // word "annual". A ceiling must say which it is.
    expect(fieldsFailing(ok({ maxIntervalDays: 366 }))).toContain('maxIntervalDays');

    expect(fieldsFailing(ok({ maxIntervalDays: 366, sourceIntervalWords: 'annually' })))
      .not.toContain('maxIntervalDays');
    expect(fieldsFailing(ok({ maxIntervalDays: 366, maxIsSchedulingTolerance: true })))
      .not.toContain('maxIntervalDays');
  });

  it('refuses a frequency looser than the row’s own ceiling', () => {
    expect(fieldsFailing(ok({
      maxIntervalDays: 89, sourceIntervalWords: 'at least every 3 months', frequencyDays: 90,
    }))).toContain('frequencyDays');
  });
});

describe('problemsByField', () => {
  it('gives a form one problem per field', () => {
    const map = problemsByField(ok({ name: '', statutoryRef: '' }));
    expect(Object.keys(map).sort()).toEqual(['name', 'statutoryRef']);
    expect(map.name).toBeTruthy();
  });
});

describe('suggestKey', () => {
  it('slugs a name into a usable key', () => {
    expect(suggestKey('Fire alarm — weekly test')).toBe('fire_alarm_weekly_test');
    expect(suggestKey('EWS1 / external wall')).toBe('ews1_external_wall');
    expect(suggestKey('2026 review')).toBe('r2026_review');   // must start with a letter
  });
});

describe('⭐ the rules do not contradict the standard register', () => {
  it('every one of the 116 seeded entries is well-formed', () => {
    // A rule the standard register itself breaks is a wrong rule. This is the
    // assertion that says so, and it is why the rules were written against the
    // register rather than from first principles.
    const broken = STATUTORY_TEMPLATE
      .map(e => ({ key: e.key, problems: validateRegisterEntry(e) }))
      .filter(r => r.problems.length > 0);

    expect(broken.map(b => `${b.key}: ${b.problems.map(p => p.field).join(', ')}`))
      .toEqual([]);
  });
});
