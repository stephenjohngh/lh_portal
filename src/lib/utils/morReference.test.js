// src/lib/utils/morReference.test.js
// generateMorReference builds MOR-YYYY-NNNNNN from a count of this year's cases.
// It takes any Supabase client (client- or server-side) and imports no env.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateMorReference } from './morReference.js';

// A fake client whose count query resolves to a configurable result.
function fakeClient(result) {
  const builder = {
    select: vi.fn(() => builder),
    gte:    vi.fn(() => builder),
    lt:     vi.fn(() => Promise.resolve(result)),
  };
  return { from: vi.fn(() => builder), _builder: builder };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-14T00:00:00Z')); });
afterEach(()  => { vi.useRealTimers(); });

describe('generateMorReference', () => {
  it('formats the next sequential reference, zero-padded to 6 digits', async () => {
    const ref = await generateMorReference(fakeClient({ count: 41, error: null }));
    expect(ref).toBe('MOR-2026-000042');
  });

  it('starts at 000001 when there are no cases yet this year', async () => {
    expect(await generateMorReference(fakeClient({ count: 0, error: null }))).toBe('MOR-2026-000001');
    expect(await generateMorReference(fakeClient({ count: null, error: null }))).toBe('MOR-2026-000001');
  });

  it('queries within the calendar-year window', async () => {
    const client = fakeClient({ count: 0, error: null });
    await generateMorReference(client);
    expect(client.from).toHaveBeenCalledWith('mor_cases');
    expect(client._builder.gte).toHaveBeenCalledWith('created_at', '2026-01-01T00:00:00Z');
    expect(client._builder.lt).toHaveBeenCalledWith('created_at', '2027-01-01T00:00:00Z');
  });

  it('throws when the count query errors', async () => {
    await expect(generateMorReference(fakeClient({ count: null, error: new Error('rls') }))).rejects.toThrow('rls');
  });

  it('throws when no client is supplied', async () => {
    await expect(generateMorReference(null)).rejects.toThrow(/client is required/i);
  });
});
