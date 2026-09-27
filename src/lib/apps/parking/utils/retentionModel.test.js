// src/lib/apps/parking/utils/retentionModel.test.js
import { describe, it, expect } from 'vitest';
import { retentionRules, retentionSummary, retentionParts } from './retentionModel.js';

const periods = { agreement_years: 6, vehicle_months: 12, device_months: 12, holder_months: 12, application_grace_days: 30 };

describe('retention words', () => {
  // The periods come from the database function: the screen prints what it is
  // given, so it cannot state a period the job does not apply.
  it('states each rule with the periods it was given', () => {
    const rules = retentionRules({ ...periods, agreement_years: 7 }).join('\n');
    expect(rules).toMatch(/7 years after it ended/);
    expect(rules).toMatch(/12 months after it came off/);
    expect(rules).toMatch(/30 days after it closed/);
    expect(retentionRules(null)).toEqual([]);
  });
  // Nothing is removed on a timetable since migration 230 (user, 2026-09-27).
  // A period only makes a record DUE; a rule that says a record "is removed"
  // after it would tell the reader something happens by itself that does not.
  it('says a period makes a record due, never that it is removed by itself', () => {
    const timed = retentionRules(periods).filter(r => /\d+ (years?|months?|days?) after/.test(r));
    expect(timed.length).toBe(5);
    for (const r of timed) {
      expect(r).toMatch(/becomes due/);
      expect(r).not.toMatch(/\bis removed\b|automatic|nightly|every night/i);
    }
  });
  it('always says an unreturned device is kept', () => {
    expect(retentionRules(periods).some(r => /never returned is never removed/.test(r))).toBe(true);
  });
  it('summarises what is due, and says so when nothing is', () => {
    expect(retentionSummary({ agreements: 1, vehicles: 2, devices: 0, applications: 0, holders: 1 }, { due: true }))
      .toBe('Due for removal: 1 ended agreement, 2 vehicles, 1 holder.');
    expect(retentionSummary({ agreements: 0 }, { due: true })).toBe('Nothing is due for removal.');
    expect(retentionSummary({ agreements: 0 })).toBe('Nothing was removed.');
  });
  it('reports agreements held back because a device is still out', () => {
    expect(retentionSummary({ held_back_device_out: 2 })).toMatch(/2 agreements past their period are kept because a device is still out/);
  });
  it('never counts the periods as something removed', () => {
    expect(retentionParts({ periods, agreements: 0 })).toEqual([]);
  });
});

describe('licence documents', () => {
  it('says an agreement is waiting for its documents, and that Remove what is due now deals with it', () => {
    expect(retentionSummary({ held_back_documents: 1 }, { due: true }))
      .toMatch(/1 agreement is also due but waiting for its licence documents to be removed: Remove what is due now does that/);
  });
  it('reports documents removed and any that would not delete', () => {
    expect(retentionSummary({ agreements: 1, documents_removed: 2 })).toMatch(/1 ended agreement, 2 licence documents/);
    expect(retentionSummary({ documents_failed: 1, held_back_documents: 1 })).toMatch(/could not be deleted, so its agreement stays/);
  });
});
