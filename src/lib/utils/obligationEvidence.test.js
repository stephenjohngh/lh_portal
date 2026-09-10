// src/lib/utils/obligationEvidence.test.js
import { describe, it, expect } from 'vitest';
import {
  evidenceRoute, isWalkEvidenced, isJobEvidenced, EVIDENCE_ROUTE_LABEL,
} from './obligationEvidence.js';

describe('evidenceRoute', () => {
  it('returns the stored route', () => {
    expect(evidenceRoute({ evidenced_by: 'maintenance_job' })).toBe('maintenance_job');
    expect(evidenceRoute({ evidenced_by: 'either' })).toBe('either');
  });

  // The reason this default exists: the mobile app caches definitions in
  // IndexedDB, so a payload cached before migration 203 has no evidenced_by.
  it('defaults to inspection when the column is absent, null or unrecognised', () => {
    expect(evidenceRoute({})).toBe('inspection');
    expect(evidenceRoute({ evidenced_by: null })).toBe('inspection');
    expect(evidenceRoute({ evidenced_by: 'nonsense' })).toBe('inspection');
    expect(evidenceRoute(undefined)).toBe('inspection');
  });
});

describe('isWalkEvidenced / isJobEvidenced', () => {
  it('routes an inspection obligation to walks only', () => {
    const o = { evidenced_by: 'inspection' };
    expect(isWalkEvidenced(o)).toBe(true);
    expect(isJobEvidenced(o)).toBe(false);
  });

  it('routes a contractor obligation to jobs only', () => {
    const o = { evidenced_by: 'maintenance_job' };
    expect(isWalkEvidenced(o)).toBe(false);
    expect(isJobEvidenced(o)).toBe(true);
  });

  it('routes "either" to both', () => {
    const o = { evidenced_by: 'either' };
    expect(isWalkEvidenced(o)).toBe(true);
    expect(isJobEvidenced(o)).toBe(true);
  });

  // The regression this whole flag exists to prevent: a pre-203 cached row must
  // stay walkable, and a contractor obligation must never reach the walk list.
  it('keeps legacy rows walkable and keeps contractor work out of the walk list', () => {
    expect(isWalkEvidenced({ name: 'Fire Doors' })).toBe(true);
    expect(isWalkEvidenced({ name: 'Alarm service', evidenced_by: 'maintenance_job' })).toBe(false);
  });
});

describe('EVIDENCE_ROUTE_LABEL', () => {
  it('labels every route', () => {
    expect(Object.keys(EVIDENCE_ROUTE_LABEL).sort())
      .toEqual(['either', 'inspection', 'maintenance_job']);
  });
});
