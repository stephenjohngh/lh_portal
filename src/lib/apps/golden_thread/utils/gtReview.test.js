// src/lib/apps/golden_thread/utils/gtReview.test.js
// Type-1 pure-logic tests for the review-due bands + the review-tick rollup.

import { describe, it, expect } from 'vitest';
import { daysBetween, reviewBand, daysToReview, computeReviewTick } from './gtReview.js';

describe('daysBetween', () => {
  it('counts whole calendar days, signed', () => {
    expect(daysBetween('2026-06-29', '2026-06-29')).toBe(0);
    expect(daysBetween('2026-06-29', '2026-07-09')).toBe(10);
    expect(daysBetween('2026-06-29', '2026-06-19')).toBe(-10);
  });
});

describe('reviewBand', () => {
  it('bands at overdue / 30 / 60 / 90, null beyond', () => {
    expect(reviewBand(-1)).toBe('overdue');
    expect(reviewBand(0)).toBe('due_30');
    expect(reviewBand(30)).toBe('due_30');
    expect(reviewBand(31)).toBe('due_60');
    expect(reviewBand(60)).toBe('due_60');
    expect(reviewBand(61)).toBe('due_90');
    expect(reviewBand(90)).toBe('due_90');
    expect(reviewBand(91)).toBeNull();
    expect(reviewBand(null)).toBeNull();
  });
});

describe('daysToReview', () => {
  it('is null without a review date', () => {
    expect(daysToReview({ review_due: null }, '2026-06-29')).toBeNull();
  });
  it('is review_due - today', () => {
    expect(daysToReview({ review_due: '2026-07-29' }, '2026-06-29')).toBe(30);
  });
});

describe('computeReviewTick', () => {
  const today = '2026-06-29';
  const docs = [
    { status: 'current',      review_due: '2026-06-19' }, // overdue (-10)
    { status: 'current',      review_due: '2026-07-09' }, // due_30 (+10)
    { status: 'current',      review_due: '2026-08-20' }, // due_60 (+52)
    { status: 'current',      review_due: '2027-01-01' }, // >90 → not counted
    { status: 'current',      review_due: null },         // no review date → skipped
    { status: 'draft',        review_due: '2026-07-01' }, // not current → skipped
    { status: 'under_review', review_due: '2026-07-01' }  // not current → skipped
  ];

  it('counts only current docs with a review date that are within 90 days', () => {
    const r = computeReviewTick(docs, today);
    expect(r.checked).toBe(4);          // 4 current docs WITH a review_due
    expect(r.overdue).toBe(1);
    expect(r.dueSoon).toBe(2);          // due_30 + due_60 (the >90 one isn't due soon)
    expect(r.byBand).toEqual({ overdue: 1, due_30: 1, due_60: 1, due_90: 0 });
  });

  it('is empty for an empty register', () => {
    expect(computeReviewTick([], today)).toEqual({
      checked: 0, dueSoon: 0, overdue: 0, byBand: { overdue: 0, due_30: 0, due_60: 0, due_90: 0 }
    });
  });
});
