// src/lib/utils/statutoryTemplate.test.js
import { describe, it, expect } from 'vitest';
import {
  STATUTORY_TEMPLATE, TEMPLATE_KEYS, templateEntry, intervalNote,
  templateToObligation, templateCoverage, suggestMatches,
  BASIS, BASIS_LABEL, BASIS_DESCRIPTION, BASIS_RANK, GROUPS, GROUP_LABEL,
  HANDLED_BY_LABEL, isSchedulable, isRecurring, isUnhomed,
  isSuperseded, supersededNote, registerByGroup, basisTally,
} from './statutoryTemplate.js';
import { EVIDENCE_ROUTES } from './obligationEvidence.js';

// The register is data a person will act on, so its own shape is worth pinning:
// a malformed entry becomes a wrong obligation in a compliance register.
describe('the register itself', () => {
  it('has unique, identifier-safe keys', () => {
    expect(new Set(TEMPLATE_KEYS).size).toBe(STATUTORY_TEMPLATE.length);
    for (const k of TEMPLATE_KEYS) expect(k).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('gives every entry the fields that make it legible', () => {
    for (const e of STATUTORY_TEMPLATE) {
      expect(e.name, e.key).toBeTruthy();
      expect(e.description, e.key).toBeTruthy();
      expect(e.statutoryRef, e.key).toBeTruthy();
      expect(e.appliesWhen, e.key).toBeTruthy();
      expect(e.evidenceRequired, e.key).toBeTruthy();
      expect(e.responsibleParty, e.key).toBeTruthy();
      expect(BASIS, e.key).toContain(e.basis);
      expect(GROUPS, e.key).toContain(e.group);
      expect(['stated', 'practice'], e.key).toContain(e.intervalBasis);
      expect(Object.keys(HANDLED_BY_LABEL), e.key).toContain(e.handledBy);
    }
  });

  // Every entry is either on a clock or fired by a named event. One with
  // neither would sit in the register saying nothing about when it happens.
  it('every entry has either a frequency or a trigger', () => {
    for (const e of STATUTORY_TEMPLATE) {
      if (isRecurring(e)) expect(e.frequencyDays, e.key).toBeGreaterThan(0);
      else expect(e.trigger, e.key).toBeTruthy();
    }
  });

  it('only schedules entries that recur, and gives them a valid route', () => {
    for (const e of STATUTORY_TEMPLATE) {
      if (!isSchedulable(e)) continue;
      expect(EVIDENCE_ROUTES, e.key).toContain(e.evidencedBy);
      expect(isRecurring(e), `${e.key} is scheduled but has no frequency`).toBe(true);
    }
  });

  // planExceedsCeiling() flags an obligation whose plan is looser than its
  // legal ceiling. A register that shipped one would flag itself on creation.
  it('never plans looser than its own stated ceiling', () => {
    for (const e of STATUTORY_TEMPLATE) {
      if (e.maxIntervalDays == null) continue;
      expect(e.frequencyDays, e.key).toBeLessThanOrEqual(e.maxIntervalDays);
    }
  });

  it('looks entries up by key and returns null for anything else', () => {
    expect(templateEntry('gas_safety_check')?.name).toBe('Gas safety check');
    expect(templateEntry('nope')).toBeNull();
    expect(templateEntry(undefined)).toBeNull();
  });
});

// The four-way basis is the answer to "where did this check come from, and how
// much choice do I have about it". Collapsing any pair would lose that.
describe('basis — where the requirement comes from', () => {
  it('carries all four kinds, each labelled and explained', () => {
    expect(BASIS).toEqual(['statute', 'standard', 'contract', 'management']);
    for (const b of BASIS) {
      expect(BASIS_LABEL[b]).toBeTruthy();
      expect(BASIS_DESCRIPTION[b].length).toBeGreaterThan(30);
      expect(BASIS_RANK[b]).toBeTypeOf('number');
    }
  });

  it('ranks legislation as the least discretionary and our own choice as the most', () => {
    expect(BASIS_RANK.statute).toBeLessThan(BASIS_RANK.standard);
    expect(BASIS_RANK.standard).toBeLessThan(BASIS_RANK.contract);
    expect(BASIS_RANK.contract).toBeLessThan(BASIS_RANK.management);
  });

  it('uses every one of the four, so the badge is information and not decoration', () => {
    const tally = basisTally();
    for (const b of BASIS) expect(tally[b], b).toBeGreaterThan(0);
  });

  // A BS number is not an Act. Getting this backwards in a compliance tool
  // teaches the user something false about their own legal position.
  it('never claims legislation for a bare British Standard reference', () => {
    for (const e of STATUTORY_TEMPLATE) {
      if (/^BS /.test(e.statutoryRef)) expect(e.basis, e.key).toBe('standard');
    }
  });

  // "Self-imposed" only means anything if it is honest about having no external
  // source — these must not cite an instrument as though one required them.
  it('marks a management decision as self-imposed rather than citing a duty', () => {
    const mgmt = STATUTORY_TEMPLATE.filter(e => e.basis === 'management');
    for (const e of mgmt) expect(e.statutoryRef, e.key).toMatch(/self-imposed|insurer|no statutory/i);
  });
});

describe('grouping and display', () => {
  it('groups every entry, ordered least-discretionary first within a group', () => {
    const grouped = registerByGroup();
    const total = [...grouped.values()].reduce((n, es) => n + es.length, 0);
    expect(total).toBe(STATUTORY_TEMPLATE.length);
    for (const [g, entries] of grouped) {
      expect(GROUP_LABEL[g]).toBeTruthy();
      const ranks = entries.map(e => BASIS_RANK[e.basis]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });
});

describe('intervalNote', () => {
  it('distinguishes a stated interval from established practice', () => {
    expect(intervalNote(templateEntry('gas_safety_check'))).toMatch(/set by the reference/i);
    expect(intervalNote(templateEntry('fra_refresh'))).toMatch(/established practice/i);
    expect(intervalNote(null)).toBe('');
  });

  it('names the trigger for an event-driven entry instead of an interval', () => {
    const note = intervalNote(templateEntry('asbestos_register_on_works'));
    expect(note).toMatch(/^Triggered by:/);
    expect(note).toMatch(/works order|disturbance/i);
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

  // Golden Thread already computes a per-document review date; creating an
  // obligation for it would put a second, competing due date on the same thing.
  it('refuses to build an obligation for an entry another app already cycles', () => {
    expect(templateToObligation(templateEntry('gt_cyclical_document_review'))).toBeNull();
    expect(templateToObligation(templateEntry('scr_review'))).toBeNull();
    expect(templateToObligation(null)).toBeNull();
  });
});

describe('templateCoverage', () => {
  const schedulable = STATUTORY_TEMPLATE.filter(isSchedulable).length;

  it('measures only what this library is responsible for', () => {
    const c = templateCoverage([]);
    expect(c.applicableCount).toBe(schedulable);
    expect(c.missing).toHaveLength(schedulable);
    expect(c.percent).toBe(0);
    // Everything else is accounted for, not silently dropped.
    const seen = c.covered.length + c.missing.length + c.notApplicable.length
      + c.elsewhere.length + c.unhomed.length;
    expect(seen).toBe(STATUTORY_TEMPLATE.length);
  });

  it('reports entries another app owns separately, naming that app', () => {
    const c = templateCoverage([]);
    const keys = c.elsewhere.map(e => e.entry.key);
    expect(keys).toContain('scr_review');
    expect(c.elsewhere.every(e => e.entry.handledBy !== 'none')).toBe(true);
  });

  // The most useful output in the whole report: statutory duties with nothing
  // anywhere in the portal dealing with them.
  it('reports entries nothing in the portal deals with', () => {
    const c = templateCoverage([]);
    expect(c.unhomed.length).toBeGreaterThan(0);
    expect(c.unhomed.every(e => e.entry.handledBy === 'none')).toBe(true);
    expect(c.unhomed.map(e => e.entry.key)).toContain('res_consultation');
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
    expect(c.missing.find(m => m.entry.key === 'gas_safety_check').inactiveOnly).toBe(true);
  });

  it('ignores a template_key that is not in the register', () => {
    const c = templateCoverage([{ template_key: 'invented_key', active: true }]);
    expect(c.coveredCount).toBe(0);
    expect(c.applicableCount).toBe(schedulable);
  });

  // A building with no lift must be able to reach 100%, or the report is
  // permanently red and gets ignored.
  it('removes a dismissed entry from the denominator rather than failing it', () => {
    const dismissedKeys = STATUTORY_TEMPLATE.filter(isSchedulable)
      .map(e => e.key).filter(k => k !== 'gas_safety_check');
    const c = templateCoverage([{ template_key: 'gas_safety_check', active: true }], { dismissedKeys });
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
    expect(templateCoverage(null).missing).toHaveLength(schedulable);
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

  it('never suggests against an entry the library does not schedule', () => {
    const s = suggestMatches([{ id: 'x', name: 'Safety case report review', evidenced_by: 'inspection' }]);
    expect(s.has('scr_review')).toBe(false);
  });

  it('ranks an exact reference above a name match', () => {
    const s = suggestMatches([
      { id: 'weak', name: 'Gas safety check', evidenced_by: 'maintenance_job' },
      { id: 'strong', name: 'CP12', statutory_ref: 'Gas Safety (Installation and Use) Regulations 1998, reg 36(3)' },
    ]);
    expect(s.get('gas_safety_check').map(c => c.obligation.id)).toEqual(['strong', 'weak']);
  });

  // These five are the obligations actually in the live database (migration
  // 153's seeds). Substring matching offered NOTHING for three of them, which
  // is how the name matcher came to be token-based.
  describe('against the real seeded obligations', () => {
    const live = [
      { id: '1', name: 'Emergency Lighting',    evidenced_by: 'inspection' },
      { id: '2', name: 'Fire Doors',            evidenced_by: 'inspection' },
      { id: '3', name: 'Apartment Doors',       evidenced_by: 'inspection' },
      { id: '4', name: 'Wayfinding Sign Check', evidenced_by: 'inspection' },
      { id: '5', name: 'Every Component',       evidenced_by: 'inspection' },
    ];
    const s = suggestMatches(live);
    const names = key => (s.get(key) ?? []).map(c => c.obligation.name);

    it('matches a short existing name to the fuller register name', () => {
      expect(names('fser_communal_fire_doors')).toContain('Fire Doors');
    });

    it('treats apartment and flat as the same thing', () => {
      expect(names('fser_flat_entrance_doors')).toContain('Apartment Doors');
    });

    it('treats sign and signage as the same thing', () => {
      expect(names('fser_wayfinding_signage')).toEqual(['Wayfinding Sign Check']);
    });

    it('offers an inspection-route obligation only against inspection entries', () => {
      expect(names('emergency_lighting_monthly')).toEqual(['Emergency Lighting']);
      expect(names('emergency_lighting_annual')).toEqual([]);
    });

    it('matches nothing for an obligation that describes nothing statutory', () => {
      for (const [, cands] of s) {
        expect(cands.map(c => c.obligation.name)).not.toContain('Every Component');
      }
    });
  });

  it('does not match on a shared word alone', () => {
    const s = suggestMatches([{ id: 'x', name: 'Riser cupboard doors', evidenced_by: 'inspection' }]);
    expect(s.has('fser_communal_fire_doors')).toBe(false);
  });

  it('never suggests an obligation that is already linked, or for no input', () => {
    expect(suggestMatches([{ id: 'x', name: 'Gas safety check', template_key: 'gas_safety_check' }]).size).toBe(0);
    expect(suggestMatches([]).size).toBe(0);
    expect(suggestMatches(null).size).toBe(0);
  });
});


// A repealed requirement is FLAGGED, never removed. Work done under it before
// the repeal is still evidence, and an assessor reading a 2027 report of 2026
// work needs the requirement to still exist for it to make sense.
describe('withdrawal', () => {
  const withdrawn = { supersededOn: '2027-03-01', supersededBy: 'gas_safety_check', supersededNote: 'Repealed by SI 2027/9' };

  it('is date-aware — a requirement repealed later was still live before it', () => {
    expect(isSuperseded(withdrawn, '2026-09-10')).toBe(false);
    expect(isSuperseded(withdrawn, '2027-02-28')).toBe(false);
    expect(isSuperseded(withdrawn, '2027-03-01')).toBe(true);
    expect(isSuperseded(withdrawn, '2028-01-01')).toBe(true);
  });

  // Review finding: the Admin panel rendered NONE of these — no "No longer
  // required" section, and its own statusOf() had no withdrawal branch — so a
  // repealed requirement read "Not covered" and sat in the gaps list as though
  // the building were failing it. The bucket is the panel's contract: it must
  // exist, and every entry must land in exactly one bucket, or a requirement
  // disappears from the register entirely the day it is withdrawn.
  it('exposes a superseded bucket, and loses no entry out of the accounting', () => {
    const c = templateCoverage([]);
    expect(Array.isArray(c.superseded)).toBe(true);

    const counted = [...c.covered, ...c.missing, ...c.notApplicable,
                     ...c.elsewhere, ...c.unhomed, ...c.superseded];
    expect(counted).toHaveLength(STATUTORY_TEMPLATE.length);
    expect(new Set(counted.map(x => x.entry.key)).size).toBe(STATUTORY_TEMPLATE.length);
  });

  // The date-awareness the report depends on: last year's position must treat a
  // requirement repealed this March as having been live at the time.
  it('only counts a withdrawal once its date has passed', () => {
    const entry = { ...STATUTORY_TEMPLATE[0], supersededOn: '2026-03-01' };
    expect(isSuperseded(entry, '2026-09-11')).toBe(true);
    expect(isSuperseded(entry, '2025-09-11')).toBe(false);
  });

  it('treats an entry with no withdrawal date as live', () => {
    expect(isSuperseded({}, '2030-01-01')).toBe(false);
    expect(isSuperseded(null)).toBe(false);
  });

  it('describes the withdrawal, naming the successor', () => {
    const note = supersededNote(withdrawn);
    expect(note).toMatch(/No longer required from 2027-03-01/);
    expect(note).toMatch(/Repealed by SI 2027\/9/);
    expect(note).toMatch(/Replaced by: Gas safety check/);
    expect(supersededNote({})).toBe('');
  });

  // Nothing in the shipped register is withdrawn yet; this pins that the
  // machinery is wired, not that the data uses it.
  it('reports none withdrawn today, and keeps the bucket', () => {
    const c = templateCoverage([]);
    expect(c.superseded).toEqual([]);
    const seen = c.covered.length + c.missing.length + c.notApplicable.length
      + c.elsewhere.length + c.unhomed.length + c.superseded.length;
    expect(seen).toBe(STATUTORY_TEMPLATE.length);
  });
});

// ⛔ Decided: resident personal data stays out of this portal, and a PEEP is
// special-category health data about a named person. The Lancaster register
// lists them; ours must not, and a test is cheaper than remembering.
describe('the PEEP exclusion', () => {
  it('holds no PEEP or PCFRA entry', () => {
    for (const e of STATUTORY_TEMPLATE) {
      expect(`${e.key} ${e.name} ${e.description}`.toLowerCase(), e.key).not.toMatch(/\bpeep|pcfra/);
    }
  });
});
