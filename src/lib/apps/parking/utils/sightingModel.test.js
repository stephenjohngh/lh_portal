import { describe, it, expect } from 'vitest';
import { validateSighting, sightingsOf, SIGHTING_PLACES } from './sightingModel.js';

describe('unauthorised parking — the rules before saving (migration 245)', () => {
  it('needs a registration and a place from the list', () => {
    expect(validateSighting({ registration: '', place: 'road' })).toMatch(/registration/);
    expect(validateSighting({ registration: 'AB12 CDE', place: '' })).toMatch(/where/);
    expect(validateSighting({ registration: 'AB12 CDE', place: 'garden' })).toMatch(/where/);
    expect(validateSighting({ registration: 'ab12 cde', place: 'car_park' })).toBeNull();
    expect(Object.keys(SIGHTING_PLACES)).toEqual(['car_park', 'road']);
  });
  it('earlier sightings are of the whole registration only, newest first', () => {
    const all = [
      { id: '1', registration: 'XCVB675', seen_at: '2026-10-01T10:00:00Z' },
      { id: '2', registration: 'XCVB675', seen_at: '2026-10-05T10:00:00Z' },
      { id: '3', registration: 'XCVB6750', seen_at: '2026-10-06T10:00:00Z' },
    ];
    expect(sightingsOf('xcvb 675', all).map((s) => s.id)).toEqual(['2', '1']);
    expect(sightingsOf('XC', all)).toEqual([]);
  });
});
