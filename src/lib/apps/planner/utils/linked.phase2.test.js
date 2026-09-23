// src/lib/apps/planner/utils/linked.phase2.test.js
//
// Phase 2 Planner sources (2026-09-23): the other dated duties. Each date is
// computed by the owning app's public.js; these pin how the Planner presents it.
import { describe, it, expect } from 'vitest';
import {
  SOURCES, visibleSources, linkedOccurrences,
  fromCertificate, fromBsrDeadline, fromComplianceReview, fromRiskReview, fromCompetenceExpiry,
} from './linked.js';
import { bucketOf } from './agenda.js';

const TODAY = '2026-09-23';
const bucket = (item) => bucketOf(item, TODAY);

describe('phase 2 sources', () => {
  it('each is governed by its owning app', () => {
    expect(SOURCES.certificate.appId).toBe('maintenance');
    expect(SOURCES.mor_bsr.appId).toBe('mor');
    expect(SOURCES.gt_risk.appId).toBe('golden_thread');
    expect(SOURCES.gt_competence.appId).toBe('golden_thread');
    expect(SOURCES.compliance_review.appId).toBe('compliance');
  });

  // Every register tab is admin-only, so their review dates are too.
  it('keeps compliance review dates from a non-admin with the Compliance grant', () => {
    const visible = visibleSources({
      isAdmin: false,
      appPermissions: { compliance: { hasAccess: true }, mor: { hasAccess: true } },
    });
    expect(visible.has('compliance_review')).toBe(false);
    expect(visible.has('mor_bsr')).toBe(true);
  });

  // Whether a renewal is booked cannot be told from a certificate, so it must
  // never claim "nothing booked" by landing in Needs arranging.
  it('never puts a certificate in Needs arranging', () => {
    const item = fromCertificate({ id: 'c1', filename: 'EICR.pdf', expiry_date: '2026-10-20' });
    expect(item.needsArranging).toBe(false);
    expect(bucket(item)).toBe('due_soon');
  });

  it('shows an expired certificate as overdue', () => {
    expect(bucket(fromCertificate({ id: 'c1', filename: 'EICR.pdf', expiry_date: '2026-09-01' }))).toBe('overdue');
  });

  it('says when a BSR deadline applies only if the case is reportable', () => {
    const undecided = fromBsrDeadline({ id: 'm1', reference: 'MOR-1', deadline: '2026-09-30', decided: false });
    expect(undecided.note).toMatch(/if the case is reportable/i);
    expect(bucket(undecided)).toBe('due_soon');
    const decided = fromBsrDeadline({ id: 'm1', deadline: '2026-09-30', decided: true });
    expect(decided.note).toMatch(/decided reportable/i);
  });

  it('carries risk reviews, competence expiries and compliance reviews on their dates', () => {
    expect(fromRiskReview({ id: 'r1', reference: 'R-4', title: 'Cladding', review_due: '2026-09-01' }).series.title)
      .toBe('Risk review: R-4 Cladding');
    expect(fromCompetenceExpiry({ id: 'p1', full_name: 'A Person', competence_expiry: '2026-10-01' }).date)
      .toBe('2026-10-01');
    expect(fromComplianceReview({ id: 'x', title: 'Review display: BAC', date: '2026-09-10' }).date)
      .toBe('2026-09-10');
  });

  it('all come through linkedOccurrences', () => {
    const items = linkedOccurrences({
      certificates: [{ id: 'c', filename: 'f', expiry_date: '2026-10-01' }],
      bsrDeadlines: [{ id: 'm', deadline: '2026-10-01' }],
      complianceReviews: [{ id: 'x', title: 't', date: '2026-10-01' }],
      riskReviews: [{ id: 'r', title: 't', review_due: '2026-10-01' }],
      competences: [{ id: 'p', full_name: 'n', competence_expiry: '2026-10-01' }],
    }, TODAY);
    expect(items.map((i) => i.source).sort())
      .toEqual(['certificate', 'compliance_review', 'gt_competence', 'gt_risk', 'mor_bsr']);
  });
});
