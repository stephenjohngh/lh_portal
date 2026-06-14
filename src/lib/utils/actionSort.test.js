// src/lib/utils/actionSort.test.js
// sortActions: status (in-progress → pending → completed), then deadline
// (earliest first, nulls last), then created_at. Pure, non-mutating.

import { describe, it, expect } from 'vitest';
import { sortActions } from './actionSort.js';

describe('sortActions', () => {
  it('orders by status priority first', () => {
    const out = sortActions([
      { id: 'c', status: 'completed',   created_at: '2026-01-01' },
      { id: 'p', status: 'pending',     created_at: '2026-01-01' },
      { id: 'i', status: 'in-progress', created_at: '2026-01-01' },
    ]);
    expect(out.map(a => a.id)).toEqual(['i', 'p', 'c']);
  });

  it('within a status, earliest deadline first and nulls last', () => {
    const out = sortActions([
      { id: 'none', status: 'pending', date_deadline: null,         created_at: '2026-01-01' },
      { id: 'late', status: 'pending', date_deadline: '2026-12-01', created_at: '2026-01-01' },
      { id: 'soon', status: 'pending', date_deadline: '2026-02-01', created_at: '2026-01-01' },
    ]);
    expect(out.map(a => a.id)).toEqual(['soon', 'late', 'none']);
  });

  it('falls back to created_at as the final tiebreaker', () => {
    const out = sortActions([
      { id: 'newer', status: 'pending', date_deadline: '2026-02-01', created_at: '2026-01-10' },
      { id: 'older', status: 'pending', date_deadline: '2026-02-01', created_at: '2026-01-01' },
    ]);
    expect(out.map(a => a.id)).toEqual(['older', 'newer']);
  });

  it('does not mutate the input array', () => {
    const input = [{ id: 'b', status: 'completed', created_at: '2026-01-01' }, { id: 'a', status: 'pending', created_at: '2026-01-01' }];
    const copy  = [...input];
    sortActions(input);
    expect(input).toEqual(copy);
  });

  it('returns [] for non-array input', () => {
    expect(sortActions(null)).toEqual([]);
    expect(sortActions(undefined)).toEqual([]);
  });

  it('sorts unknown statuses to the bottom', () => {
    const out = sortActions([
      { id: 'weird', status: 'archived',    created_at: '2026-01-01' },
      { id: 'prog',  status: 'in-progress', created_at: '2026-01-01' },
    ]);
    expect(out.map(a => a.id)).toEqual(['prog', 'weird']);
  });
});
