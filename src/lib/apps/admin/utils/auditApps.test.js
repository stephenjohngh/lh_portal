import { describe, it, expect } from 'vitest';
import { auditApps, auditAppOptions, auditAppBadge } from './auditApps.js';
import { AVAILABLE_APPS } from '#lib/apps/apps.js';

describe('auditApps', () => {
  it('offers every app in the registry (home aside), so none can be seen but not filtered', () => {
    const ids = auditApps().map((a) => a.id);
    for (const a of AVAILABLE_APPS.filter((x) => x.id !== 'home')) expect(ids).toContain(a.id);
  });
  it('keeps the legacy values older rows carry, once each', () => {
    const ids = auditApps().map((a) => a.id);
    expect(ids).toContain('users');
    expect(ids).toContain('plans');
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('starts the options with the "all" choice', () => {
    expect(auditAppOptions('All apps')[0]).toEqual({ value: null, label: 'All apps' });
  });
  it('gives a badge to an app with no colour of its own, and to one it does not know', () => {
    expect(auditAppBadge('parking').label).toBe('Parking');
    expect(auditAppBadge('parking').color).toBeTruthy();
    expect(auditAppBadge('something_new').label).toBe('something_new');
    expect(auditAppBadge(null)).toBeNull();
  });
});
