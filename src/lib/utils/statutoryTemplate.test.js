// src/lib/utils/statutoryTemplate.test.js
import { describe, it, expect } from 'vitest';
import {
  STATUTORY_TEMPLATE, TEMPLATE_KEYS, templateEntry, intervalNote,
  templateToObligation, templateCoverage, suggestMatches,
} from './statutoryTemplate.js';
import { EVIDENCE_ROUTES } from './obligationEvidence.js';

// The template is data a person will act on, so its own shape is worth pinning:
// a malformed entry becomes a wrong obligation in a compliance register.
describe('the template itself', () => {
  it('has unique, stable keys', () => {
    expect(new Set(TEMPLATE_KEYS).size).toBe(STATUTORY_TEMPLATE.length);
    // Keys are written to the database, so they must be identifier-safe.
    for (const k of TEMPLATE_KEYS) expect(k).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('gives every entry the fields an obligation needs', () => {
    for (const e of STATUTORY_TEMPLATE) {
      expect(e.name, e.key).toBeTruthy();
      expect(e.description, e.key).toBeTruthy();
      expect(e.statutoryRef, e.key).toBeTruthy();
      expect(e.appliesWhen, e.key).toBeTruthy();
      expect(e.frequencyDays, e.key).toBeGreaterThan(0);
      expect(e.retentionPeriodMonths, e.key).toBeGreaterThan(0);
      expect(['statute', 'standard'], e.key).toContain(e.basis);
      expect(['stated', 'practice'], e.key).toContain(e.intervalBasis);
      expect(EVIDENCE_ROUTES, e.key).toContain(e.evidencedBy);
    }
  });

  // planExceedsCeiling() flags an obligation whose plan is looser than its
  // legal ceiling. A template that shipped one would flag itself on creation.
  it('never plans looser than its own stated ceiling', () => {
    for (const e of STATUTORY_TEMPLATE) {
      if (e.maxIntervalDays == null) continue;
      expect(e.frequencyDays, e.key).toBeLessThanOrEqual(e.maxIntervalDays);
    }
  });

  // The distinction the module exists to protect: a British Standard is not an
  // Act. If every entry claimed statute, the badge would be decoration.
  it('carries both kinds of basis, and never claims a statute for a BS number', () => {
    const kinds = new Set(STATUTORY_TEMPLATE.map(e => e.basis));
    expect(kinds).toEqual(new Set(['statute', 'standard']));
    for (const e of STATUTORY_TEMPLATE) {
      if (/^BS /.test(e.statutoryRef)) expect(e.basis, e.key).toBe('standard');
    }
  });

  it('looks entries up by key and returns null for anything else', () => {
    expect(templateEntry('gas_safety_check')?.name).toBe('Gas safety check');
    expect(templateEntry('nope')).toBeNull();
    expect(templateEntry(undefined)).toBeNull();
  });
});

describe('intervalNote', () => {
  it('distinguishes a stated interval from established practice', () => {
    expect(intervalNote(templateEntry('gas_safety_check'))).toMatch(/set by the reference/i);
    expect(intervalNote(templateEntry('fire_risk_assessment_review'))).toMatch(/established practice/i);
    expect(intervalNote(null)).toBe('');
  });
});

describe('templateToObligation', () => {
  const row = templateToObligation(templateEntry('lift_loler_examination'), { presentationOrder: 3 });

  it('maps the statutory detail onto the obligation columns', () => {
    expect(row).toMatchObject({
      name: 'Lift — LOLER thorough examination',
      frequency_days: 182,
      max_interval_days: 183,
      evidenced_by: 'maintenance_job',
      template_key: 'lift_loler_examination',
      presentation_order: 3,
      active: true,
    });
    expect(row.statutory_ref).toMatch(/LOLER|Lifting Operations/);
    expect(row.competency_required).toMatch(/INDEPENDENT/);
  });

  // Scope is a fact about this building, not about the statute. Empty scope
  // matches everything — over-broad and visible, rather than silently nothing.
  it('leaves scope empty rather than guessing at it', () => {
    expect(row.scope).toEqual({});
  });

  it('returns null for a missing entry', () => {
    expect(templateToObligation(null)).toBeNull();
  });
});

describe('templateCoverage', () => {
  const total = STATUTORY_TEMPLATE.length;

  it('reports everything missing for an empty library', () => {
    const c = templateCoverage([]);
    expect(c.coveredCount).toBe(0);
    expect(c.missing).toHaveLength(total);
    expect(c.percent).toBe(0);
  });

  it('counts a linked, active obligation as covering its entry', () => {
    const c = templateCoverage([{ template_key: 'gas_safety_check', active: true }]);
    expect(c.coveredCount).toBe(1);
    expect(c.covered[0].entry.key).toBe('gas_safety_check');
    expect(c.missing.some(m => m.entry.key === 'gas_safety_check')).toBe(false);
  });

  // Several obligations may satisfy one entry — two lifts, risers in two cores.
  it('accepts several obligations against one entry without double-counting', () => {
    const c = templateCoverage([
      { id: 'a', template_key: 'lift_loler_examination', active: true },
      { id: 'b', template_key: 'lift_loler_examination', active: true },
    ]);
    expect(c.coveredCount).toBe(1);
    expect(c.covered[0].activeCount).toBe(2);
  });

  // Switching an obligation off is precisely what a gap report must catch.
  it('treats an inactive obligation as a gap, and says it was switched off', () => {
    const c = templateCoverage([{ template_key: 'gas_safety_check', active: false }]);
    expect(c.coveredCount).toBe(0);
    const gap = c.missing.find(m => m.entry.key === 'gas_safety_check');
    expect(gap.inactiveOnly).toBe(true);
  });

  it('ignores a template_key that is not in the template', () => {
    const c = templateCoverage([{ template_key: 'invented_key', active: true }]);
    expect(c.coveredCount).toBe(0);
    expect(c.applicableCount).toBe(total);
  });

  // A building with no lift must be able to reach 100%, or the report is
  // permanently red and gets ignored.
  it('removes a dismissed entry from the denominator rather than failing it', () => {
    const dismissedKeys = STATUTORY_TEMPLATE.map(e => e.key).filter(k => k !== 'gas_safety_check');
    const c = templateCoverage([{ template_key: 'gas_safety_check', active: true }], { dismissedKeys });
    expect(c.notApplicable).toHaveLength(total - 1);
    expect(c.applicableCount).toBe(1);
    expect(c.percent).toBe(100);
  });

  // Coverage wins over a dismissal: something actually being done is a fact,
  // "not applicable" is only an assertion.
  it('counts an entry as covered even if it was also dismissed', () => {
    const c = templateCoverage(
      [{ template_key: 'gas_safety_check', active: true }],
      { dismissedKeys: ['gas_safety_check'] },
    );
    expect(c.coveredCount).toBe(1);
    expect(c.notApplicable).toHaveLength(0);
  });

  it('reports 100% rather than dividing by zero when everything is dismissed', () => {
    const c = templateCoverage([], { dismissedKeys: TEMPLATE_KEYS });
    expect(c.applicableCount).toBe(0);
    expect(c.percent).toBe(100);
  });

  it('tolerates junk input', () => {
    expect(templateCoverage(null).missing).toHaveLength(total);
    expect(templateCoverage([null, {}, { template_key: null }]).coveredCount).toBe(0);
  });
});

describe('suggestMatches', () => {
  it('matches on an identical statutory reference', () => {
    const s = suggestMatches([
      { id: 'x', name: 'Annual gas check', statutory_ref: 'Gas Safety (Installation and Use) Regulations 1998, reg 36(3)' },
    ]);
    expect(s.get('gas_safety_check')[0].reason).toBe('Same statutory reference');
  });

  // BS 5839-1 covers both the weekly user test and the six-monthly service,
  // so the standard alone must not decide which entry a row satisfies.
  it('uses the evidence route to separate two entries sharing one standard', () => {
    const s = suggestMatches([
      { id: 'w', name: 'Alarm call point test', statutory_ref: 'BS 5839-1 clause 44', evidenced_by: 'inspection' },
    ]);
    expect(s.get('fire_alarm_weekly_test')?.[0].reason).toBe('Same standard and evidence route');
    expect(s.has('fire_alarm_service')).toBe(false);
  });

  it('falls back to a name match when there is no reference', () => {
    const s = suggestMatches([{ id: 'n', name: 'Gas safety check' }]);
    expect(s.get('gas_safety_check')[0].reason).toBe('Similar name');
  });

  it('ranks an exact reference above a name match', () => {
    const s = suggestMatches([
      { id: 'weak', name: 'Gas safety check' },
      { id: 'strong', name: 'CP12', statutory_ref: 'Gas Safety (Installation and Use) Regulations 1998, reg 36(3)' },
    ]);
    expect(s.get('gas_safety_check').map(c => c.obligation.id)).toEqual(['strong', 'weak']);
  });

  // Already-linked rows are settled; re-suggesting them would invite duplicates.
  it('never suggests an obligation that is already linked', () => {
    const s = suggestMatches([
      { id: 'x', name: 'Gas safety check', template_key: 'gas_safety_check' },
    ]);
    expect(s.size).toBe(0);
  });

  it('returns an empty map for no input', () => {
    expect(suggestMatches([]).size).toBe(0);
    expect(suggestMatches(null).size).toBe(0);
  });
});
