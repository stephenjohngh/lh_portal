// src/lib/apps/mor/public.test.js
// MOR cross-app interface — the `api` seam is mocked.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  api: { get: vi.fn(), getById: vi.fn() },
}));
vi.mock('$lib/utils/api', () => ({ api: h.api }));

const { listCases, getCase, morCaseLabel } = await import('./public.js');

beforeEach(() => vi.clearAllMocks());

describe('morCaseLabel', () => {
  it('reference + description', () => {
    expect(morCaseLabel({ reference: 'MOR-000001', description: 'Fire door failed to self-close' }))
      .toBe('MOR-000001 — Fire door failed to self-close');
  });

  it('falls back to location, then mechanism', () => {
    expect(morCaseLabel({ reference: 'MOR-2', location_text: 'Core A stair' })).toBe('MOR-2 — Core A stair');
    expect(morCaseLabel({ reference: 'MOR-3', mechanism: 'structural' })).toBe('MOR-3 — structural');
  });

  it('reference only when there is no detail', () => {
    expect(morCaseLabel({ reference: 'MOR-4' })).toBe('MOR-4');
  });

  it('truncates long detail to 57 chars + ellipsis', () => {
    const out = morCaseLabel({ reference: 'MOR-5', description: 'x'.repeat(80) });
    expect(out).toBe(`MOR-5 — ${'x'.repeat(57)}…`);
  });

  it('handles a null case', () => {
    expect(morCaseLabel(null)).toBe('Unknown case');
  });
});

describe('listCases', () => {
  it('queries mor_cases newest first as lightweight refs', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'm1', reference: 'MOR-1' }]);
    const res = await listCases();
    expect(h.api.get).toHaveBeenCalledWith('mor_cases', expect.objectContaining({
      orderBy: 'identification_date',
      ascending: false,
    }));
    expect(res).toEqual([{ id: 'm1', reference: 'MOR-1' }]);
  });
});

describe('getCase', () => {
  it('fetches a single case by id', async () => {
    h.api.getById.mockResolvedValueOnce({ id: 'm1', reference: 'MOR-1', status: 'triage' });
    const res = await getCase('m1');
    expect(h.api.getById).toHaveBeenCalledWith('mor_cases', 'm1', expect.any(String));
    expect(res).toMatchObject({ reference: 'MOR-1' });
  });
});
