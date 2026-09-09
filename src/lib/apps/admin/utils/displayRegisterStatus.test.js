// src/lib/apps/admin/utils/displayRegisterStatus.test.js
import { describe, it, expect } from 'vitest';
import { daysBetween, attentionReason, attentionLabel } from './displayRegisterStatus.js';

describe('daysBetween', () => {
  it('counts whole calendar days, signed', () => {
    expect(daysBetween('2026-06-29', '2026-06-29')).toBe(0);
    expect(daysBetween('2026-06-29', '2026-07-09')).toBe(10);
    expect(daysBetween('2026-06-29', '2026-06-19')).toBe(-10);
  });
});

describe('attentionReason', () => {
  const today = '2026-09-09';

  it('is null for a non-displayed item — the admin already flagged it manually', () => {
    expect(attentionReason(
      { status: 'damaged', review_date: '2026-01-01' },
      { todayISO: today }
    )).toBeNull();
  });

  it('is null when nothing is due and nothing linked changed', () => {
    expect(attentionReason(
      { status: 'displayed', review_date: '2027-01-01', last_refreshed_at: '2026-09-01T00:00:00Z' },
      { todayISO: today }
    )).toBeNull();
  });

  it('flags document_updated when the linked GT document changed after the last refresh', () => {
    expect(attentionReason(
      { status: 'displayed', last_refreshed_at: '2026-08-01T00:00:00Z' },
      { todayISO: today, linkedDocUpdatedAt: '2026-08-15T00:00:00Z' }
    )).toBe('document_updated');
  });

  it('flags document_updated when linked and never refreshed at all', () => {
    expect(attentionReason(
      { status: 'displayed', last_refreshed_at: null },
      { todayISO: today, linkedDocUpdatedAt: '2026-08-15T00:00:00Z' }
    )).toBe('document_updated');
  });

  it('does not flag when the linked document changed BEFORE the last refresh', () => {
    expect(attentionReason(
      { status: 'displayed', last_refreshed_at: '2026-09-01T00:00:00Z' },
      { todayISO: today, linkedDocUpdatedAt: '2026-08-15T00:00:00Z' }
    )).toBeNull();
  });

  it('flags review_overdue / review_due by band, review_date only', () => {
    expect(attentionReason({ status: 'displayed', review_date: '2026-09-01' }, { todayISO: today }))
      .toBe('review_overdue');
    expect(attentionReason({ status: 'displayed', review_date: '2026-09-30' }, { todayISO: today }))
      .toBe('review_due');
    expect(attentionReason({ status: 'displayed', review_date: '2026-12-01' }, { todayISO: today }))
      .toBeNull();
  });

  it('document_updated takes priority over a review date that is also due', () => {
    expect(attentionReason(
      { status: 'displayed', review_date: '2026-09-01', last_refreshed_at: '2026-08-01T00:00:00Z' },
      { todayISO: today, linkedDocUpdatedAt: '2026-08-20T00:00:00Z' }
    )).toBe('document_updated');
  });
});

describe('attentionLabel', () => {
  it('maps every reason to a label, and null to null', () => {
    expect(attentionLabel('document_updated')).toMatch(/refresh/i);
    expect(attentionLabel('review_overdue')).toMatch(/overdue/i);
    expect(attentionLabel('review_due')).toMatch(/due/i);
    expect(attentionLabel(null)).toBeNull();
  });
});
