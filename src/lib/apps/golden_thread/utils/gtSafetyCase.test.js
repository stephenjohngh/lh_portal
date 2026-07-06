// src/lib/apps/golden_thread/utils/gtSafetyCase.test.js
import { describe, it, expect } from 'vitest';
import { buildSafetyCaseModel } from './gtSafetyCase.js';

const TODAY = '2026-07-06T10:00:00.000Z';

const documents = [
  { reference: 'GT-1', title: 'Fire strategy', document_type: 'Fire strategy', schedule1_category: 6,
    status: 'current', effective_from: '2026-01-01', review_due: '2025-01-01', safety_critical: true },   // overdue
  { reference: 'GT-2', title: 'FRA', document_type: 'Fire risk assessment', schedule1_category: 6,
    status: 'current', review_due: '2026-07-20', safety_critical: false },                                 // due ≤30
  { reference: 'GT-3', title: 'EICR', document_type: 'EICR', schedule1_category: 10,
    status: 'current', review_due: '2030-01-01', safety_critical: false },                                 // not due
  { reference: 'GT-4', title: 'Old fire strategy', document_type: 'Fire strategy', schedule1_category: 6,
    status: 'superseded', review_due: '2025-01-01', safety_critical: true },                               // excluded
];
const completeness = [
  { code: 6,  name: 'Fire safety', currentCount: 2, satisfied: true },
  { code: 10, name: 'Maintenance', currentCount: 1, satisfied: true },
  { code: 12, name: 'MOR info',    currentCount: 0, satisfied: false },
];
const morCases = [
  { reference: 'MOR-1', status: 'open' },
  { reference: 'MOR-2', status: 'open' },
  { reference: 'MOR-3', status: 'closed' },
];

describe('buildSafetyCaseModel', () => {
  const m = buildSafetyCaseModel({ documents, completeness, morCases, generatedAt: TODAY, building: 'Lonsdale House' });

  it('summarises only current documents', () => {
    expect(m.summary.current).toBe(3);              // GT-4 superseded excluded
    expect(m.summary.safetyCritical).toBe(1);       // only GT-1 (GT-4 not current)
  });

  it('counts review bands (overdue vs due-soon)', () => {
    expect(m.summary.overdue).toBe(1);              // GT-1
    expect(m.summary.dueSoon).toBe(1);              // GT-2 (GT-3 far future → not counted)
  });

  it('reports applicable vs satisfied categories', () => {
    expect(m.summary.categoriesApplicable).toBe(3);
    expect(m.summary.categoriesSatisfied).toBe(2);
  });

  it('groups current documents by category, ascending, named from completeness', () => {
    expect(m.byCategory.map((g) => g.code)).toEqual([6, 10]);
    expect(m.byCategory[0]).toMatchObject({ code: 6, name: 'Fire safety' });
    expect(m.byCategory[0].documents.map((d) => d.reference)).toEqual(['GT-1', 'GT-2']);
  });

  it('lists safety-critical current documents with their review band', () => {
    expect(m.safetyCritical.map((d) => d.reference)).toEqual(['GT-1']);
    expect(m.safetyCritical[0].review_band).toBe('overdue');
  });

  it('summarises occurrences by status, most common first', () => {
    expect(m.summary.occurrences).toBe(3);
    expect(m.occurrences.total).toBe(3);
    expect(m.occurrences.byStatus[0]).toEqual({ status: 'open', count: 2 });
  });

  it('carries building + generatedAt through', () => {
    expect(m.building).toBe('Lonsdale House');
    expect(m.generatedAt).toBe(TODAY);
  });
});
