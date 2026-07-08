// src/lib/apps/golden_thread/utils/gtCompetence.test.js
import { describe, it, expect } from 'vitest';
import { requiredCompetenceForDoc, competenceExpired, assessCompetence } from './gtCompetence.js';

describe('requiredCompetenceForDoc', () => {
  it('maps document types to a competence', () => {
    expect(requiredCompetenceForDoc('Fire door inspection report')).toBe('fire_door');
    expect(requiredCompetenceForDoc('External wall system (EWS1) assessment')).toBe('facade_cladding');
    expect(requiredCompetenceForDoc('Electrical installation condition report (EICR)')).toBe('electrical');
    expect(requiredCompetenceForDoc('Lift inspection report (LOLER)')).toBe('lifts');
    expect(requiredCompetenceForDoc('Fire strategy')).toBe('fire');
    expect(requiredCompetenceForDoc('Structural assessment')).toBe('structural');
  });
  it('returns null when no specific competence applies', () => {
    expect(requiredCompetenceForDoc('Complaints procedure')).toBeNull();
    expect(requiredCompetenceForDoc('')).toBeNull();
  });
});

describe('competenceExpired', () => {
  it('true only when expiry is in the past', () => {
    expect(competenceExpired({ competence_expiry: '2025-01-01' }, '2026-07-07')).toBe(true);
    expect(competenceExpired({ competence_expiry: '2027-01-01' }, '2026-07-07')).toBe(false);
    expect(competenceExpired({ competence_expiry: null }, '2026-07-07')).toBe(false);
    expect(competenceExpired(null, '2026-07-07')).toBe(false);
  });
});

describe('assessCompetence', () => {
  const TODAY = '2026-07-07';
  it('ok when the person holds the required competence', () => {
    const v = assessCompetence({ competencies: ['fire', 'fire_door'] }, 'Fire door inspection report', TODAY);
    expect(v).toMatchObject({ ok: true, required: 'fire_door', missing: false, expired: false });
  });
  it('missing when the required competence is not held', () => {
    const v = assessCompetence({ competencies: ['electrical'] }, 'Fire strategy', TODAY);
    expect(v).toMatchObject({ ok: false, required: 'fire', missing: true });
  });
  it("'general' competence satisfies any requirement", () => {
    const v = assessCompetence({ competencies: ['general'] }, 'Structural assessment', TODAY);
    expect(v.ok).toBe(true);
    expect(v.missing).toBe(false);
  });
  it('expired competence fails even if held', () => {
    const v = assessCompetence({ competencies: ['fire'], competence_expiry: '2025-01-01' }, 'Fire strategy', TODAY);
    expect(v).toMatchObject({ ok: false, expired: true });
  });
  it('no requirement → ok regardless', () => {
    const v = assessCompetence({ competencies: [] }, 'Complaints procedure', TODAY);
    expect(v).toEqual({ ok: true, required: null, missing: false, expired: false });
  });
  it('no person → ok (soft)', () => {
    expect(assessCompetence(null, 'Fire strategy', TODAY).ok).toBe(true);
  });
});
