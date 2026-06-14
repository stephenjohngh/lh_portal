// src/lib/stores/profiles.test.js
// The shared profile cache. The contract worth pinning: load() is idempotent
// (only hits the DB the first time; force re-fetches), and assigneeOptions is a
// derived store that stays in sync with the cache. Seam mocked: api.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => ({ api: { get: vi.fn(() => Promise.resolve([])) } }));

vi.mock('$lib/utils/api',    () => ({ api: h.api }));
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));

const { profiles, profilesStore } = await import('./profiles.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.api.get.mockResolvedValue([{ id: 'u1', full_name: 'Alice' }, { id: 'u2', full_name: 'Bob' }]);
});

describe('load', () => {
  it('fetches once and caches; a second call does not hit the DB again', async () => {
    await profilesStore.load();
    await profilesStore.load();
    expect(h.api.get).toHaveBeenCalledTimes(1);
    expect(get(profiles).list).toHaveLength(2);
    expect(get(profiles).loaded).toBe(true);
  });

  it('re-fetches when forced (and is otherwise a no-op once cached)', async () => {
    await profilesStore.load();           // ensure cache is warm (may already be, store is a singleton)
    h.api.get.mockClear();
    await profilesStore.load();           // cached → no DB hit
    expect(h.api.get).not.toHaveBeenCalled();
    await profilesStore.load({ force: true });
    expect(h.api.get).toHaveBeenCalledTimes(1);
  });

  it('records the error and leaves an empty list on failure', async () => {
    h.api.get.mockReset();
    h.api.get.mockRejectedValueOnce(new Error('db down'));
    await profilesStore.load({ force: true });
    expect(get(profiles).error).toBe('db down');
    expect(get(profiles).list).toEqual([]);
  });
});

describe('assigneeOptions', () => {
  it('builds {value,label} options from full_name, with a blank first and extras last', async () => {
    await profilesStore.load({ force: true });
    const opts = get(profilesStore.assigneeOptions());
    expect(opts[0]).toEqual({ value: '', label: '' });
    expect(opts).toContainEqual({ value: 'Alice', label: 'Alice' });
    expect(opts.at(-1)).toEqual({ value: 'External', label: 'External' });   // default extra
  });

  it('accepts custom extras', async () => {
    await profilesStore.load({ force: true });
    const opts = get(profilesStore.assigneeOptions([{ value: 'Contractor', label: 'Contractor' }]));
    expect(opts.at(-1)).toEqual({ value: 'Contractor', label: 'Contractor' });
  });
});
