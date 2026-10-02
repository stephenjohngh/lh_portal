// src/lib/utils/dueWindows.test.js
// One rule for overdue / due soon, and every app's window in one list.

import { describe, it, expect } from 'vitest';
import { DUE_SOON_DAYS, dueBand, dueBandOf } from './dueWindows.js';
import { getExpiryStatus } from './documentUtils.js';
import { expiryRag, jobRag } from '$lib/apps/maintenance/utils/maintenanceHelpers.js';
import { addDaysISO, today } from './dates.js';

describe('dueBand', () => {
  it('is overdue the day after, due soon up to and including the date', () => {
    expect(dueBand(-1, 30)).toBe('overdue');
    expect(dueBand(0, 30)).toBe('due_soon');
    expect(dueBand(30, 30)).toBe('due_soon');
    expect(dueBand(31, 30)).toBe('ok');
  });
  it('has no band without a number', () => {
    expect(dueBand(null, 30)).toBeNull();
    expect(dueBand(NaN, 30)).toBeNull();
    expect(dueBandOf(null, 30)).toBeNull();
  });
  it('counts London calendar days from a given today', () => {
    expect(dueBandOf('2026-10-16', 14, '2026-10-02')).toBe('due_soon');
    expect(dueBandOf('2026-10-17', 14, '2026-10-02')).toBe('ok');
    expect(dueBandOf('2026-10-01', 14, '2026-10-02')).toBe('overdue');
  });
});

// The windows were gathered as each app had them; harmonising them is a
// decision, so this pins them until somebody makes it on purpose.
describe('DUE_SOON_DAYS', () => {
  it('holds each app’s window as it was', () => {
    expect(DUE_SOON_DAYS).toMatchObject({
      maintenanceJob: 30, certificateExpiry: 60, documentExpiry: 30,
      plannedObligation: 14, exclusionReview: 30, displayItemReview: 30,
      dossierLinkExpiry: 14, plannerArranging: 60, plannerWalk: 14,
      plannerDefaultNotice: 30, plannerCompetenceExpiry: 60,
      plannerBsrDeadline: 10, capitalRenewal: 365,
    });
  });
  it('cannot be changed by accident at run time', () => {
    expect(Object.isFrozen(DUE_SOON_DAYS)).toBe(true);
  });
});

// The apps now share the rule, so a certificate reads the same everywhere.
describe('the apps agree', () => {
  const t = today();
  it('a document and a certificate are both valid THROUGH their expiry date', () => {
    expect(getExpiryStatus(t)).toBe('expiring-soon');
    expect(expiryRag(t)).toBe('expiring');
    expect(getExpiryStatus(addDaysISO(t, -1))).toBe('expired');
    expect(expiryRag(addDaysISO(t, -1))).toBe('expired');
  });
  it('a maintenance job uses the maintenance window', () => {
    const d = (n) => ({ status: 'scheduled', scheduled_date: addDaysISO(t, n) });
    expect(jobRag(d(DUE_SOON_DAYS.maintenanceJob))).toBe('due_soon');
    expect(jobRag(d(DUE_SOON_DAYS.maintenanceJob + 1))).toBe('scheduled');
    expect(jobRag(d(-1))).toBe('overdue');
  });
});
