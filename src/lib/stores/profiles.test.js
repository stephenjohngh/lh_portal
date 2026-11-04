// src/lib/stores/profiles.test.js
// The shared profile cache. The contract worth pinning: load() is idempotent
// (only hits the DB the first time; force re-fetches), and assigneeOptions is a
// derived store that stays in sync with the cache. Seam mocked: api.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => ({ api: { get: vi.fn(() => Promise.resolve([])) } }));

vi.mock('#lib/utils/api.js',    () => ({ api: h.api }));
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));

const { profiles, profilesStore, pickerLabel, shortLabel, withShortName, assigneeChoices } = await import('./profiles.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.api.get.mockResolvedValue([{ id: 'u1', full_name: 'Alice', short_name: 'AL' }, { id: 'u2', full_name: 'Bob', short_name: null }]);
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
  it('offers only people with a short name, as "AL (Alice)", with a blank first and extras last', async () => {
    await profilesStore.load({ force: true });
    const opts = get(profilesStore.assigneeOptions());
    expect(opts[0]).toEqual({ value: '', label: '' });
    expect(opts).toContainEqual({ value: 'AL', label: 'AL (Alice)' });
    expect(opts.some((o) => o.label.includes('Bob'))).toBe(false);
    expect(opts.at(-1)).toEqual({ value: 'External', label: 'External' });   // default extra
  });

  it('accepts custom extras', async () => {
    await profilesStore.load({ force: true });
    const opts = get(profilesStore.assigneeOptions([{ value: 'Contractor', label: 'Contractor' }]));
    expect(opts.at(-1)).toEqual({ value: 'Contractor', label: 'Contractor' });
  });
});

const people = [
  { id: 'a', full_name: 'Jane Smith', short_name: 'JS' },
  { id: 'b', full_name: 'Chloe K', short_name: 'CK' },
  { id: 'c', full_name: 'No Initials', short_name: null },
];

describe('how Management names people', () => {
  it('offers "JS (Jane Smith)" and shows "JS" once chosen', () => {
    expect(pickerLabel(people[0])).toBe('JS (Jane Smith)');
    expect(shortLabel(people[0])).toBe('JS');
    expect(shortLabel(people[2])).toBe('No Initials');
  });
  it('offers only people with a short name, in short-name order', () => {
    expect(withShortName(people).map((p) => p.short_name)).toEqual(['CK', 'JS']);
  });
  it('assignee options store the short name, and keep an old recorded name', () => {
    const opts = assigneeChoices(people);
    expect(opts.map((o) => o.value)).toEqual(['', 'CK', 'JS', 'External']);
    expect(opts.find((o) => o.value === 'JS').label).toBe('JS (Jane Smith)');
    expect(assigneeChoices(people, undefined, 'Chloe').map((o) => o.value)).toContain('Chloe');
  });
});
