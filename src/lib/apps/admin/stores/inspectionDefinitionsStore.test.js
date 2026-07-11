// src/lib/apps/admin/stores/inspectionDefinitionsStore.test.js
// CHARACTERIZATION tests for inspectionDefinitionsStore (Admin > Inspections).
// Asserts which DB calls each method makes, the persisted row shape built by
// toRow (defaults + field normalisation), and the resulting store state.
// Seams mocked: api, supabaseClient (auth.getUser), auditLogger, logger.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const h = vi.hoisted(() => {
  const api = {
    get:    vi.fn(() => Promise.resolve([])),
    create: vi.fn((t, d) => Promise.resolve({ id: 'd-new', ...d })),
    update: vi.fn((t, id, d) => Promise.resolve({ id, ...d })),
    delete: vi.fn(() => Promise.resolve()),
  };
  const supabase = { auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) } };
  const logAudit = vi.fn();
  return { api, supabase, logAudit };
});

vi.mock('$lib/utils/api',         () => ({ api: h.api }));
vi.mock('$lib/supabaseClient',    () => ({ supabase: h.supabase }));
vi.mock('$lib/utils/auditLogger', () => ({ logAudit: h.logAudit }));
vi.mock('$lib/utils/logger',      () => ({ getLogger: () => () => {} }));

const { inspectionDefinitionsStore: defs } = await import('./inspectionDefinitionsStore.js');

// Minimal valid form input; individual tests override the fields they exercise.
const form = (over = {}) => ({ name: 'Fire Doors', ...over });

beforeEach(() => { vi.clearAllMocks(); h.api.get.mockResolvedValue([]); });

describe('load', () => {
  it('reads inspection_definitions ordered by presentation_order and clears loading', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'd1', name: 'Doors', presentation_order: 0 }]);
    await defs.load();
    expect(h.api.get).toHaveBeenCalledWith('inspection_definitions', { orderBy: 'presentation_order' });
    expect(get(defs).definitions).toHaveLength(1);
    expect(get(defs).loading).toBe(false);
    expect(get(defs).error).toBe(null);
  });

  it('sorts by presentation_order then name', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: 'b', name: 'Zebra', presentation_order: 1 },
      { id: 'a', name: 'Beta',  presentation_order: 0 },
      { id: 'c', name: 'Alpha', presentation_order: 0 },
    ]);
    await defs.load();
    expect(get(defs).definitions.map(d => d.name)).toEqual(['Alpha', 'Beta', 'Zebra']);
  });

  it('records the error and rethrows on failure', async () => {
    h.api.get.mockRejectedValueOnce(new Error('boom'));
    await expect(defs.load()).rejects.toThrow('boom');
    expect(get(defs).error).toBe('boom');
    expect(get(defs).loading).toBe(false);
  });
});

describe('create', () => {
  it('trims the name, applies standard defaults, stamps created_by + updated_by', async () => {
    await defs.create(form({ name: '  Fire Doors  ' }));
    const row = h.api.create.mock.calls[0][1];
    expect(h.api.create.mock.calls[0][0]).toBe('inspection_definitions');
    expect(row).toMatchObject({
      name:               'Fire Doors',
      description:        null,
      active:             true,
      mode:               'standard',
      checklist_mode:     'type_driven',
      checklist_attr_ids: [],
      pass_fail_rule:     'manual',
      frequency_days:     null,
      link_source:        'component_links',
      presentation_order: 0,
      created_by:         'u1',
      updated_by:         'u1',
    });
  });

  it('inserts the created definition into state, sorted', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'd1', name: 'Zebra', presentation_order: 0 }]);
    await defs.load();
    h.api.create.mockResolvedValueOnce({ id: 'd2', name: 'Alpha', presentation_order: 0 });
    await defs.create(form({ name: 'Alpha' }));
    expect(get(defs).definitions.map(d => d.name)).toEqual(['Alpha', 'Zebra']);
  });

  it('fires a create audit event', async () => {
    h.api.create.mockResolvedValueOnce({ id: 'd9', name: 'Doors', mode: 'standard', frequency_days: 90 });
    await defs.create(form());
    expect(h.logAudit).toHaveBeenCalledWith(
      'create', 'inspection_definition', 'd9', 'Doors',
      expect.objectContaining({ appId: 'admin' }),
    );
  });

  it('normalises mode/checklist/pass-fail/frequency and coerces attr_ids', async () => {
    await defs.create(form({
      mode: 'rotating',
      checklist_mode: 'explicit',
      pass_fail_rule: 'all_checks_pass',
      frequency_days: '30',
      checklist_attr_ids: ['a1', 'a2'],
      link_source: 'self_only',
      link_type_filter: '  linked-door  ',
    }));
    const row = h.api.create.mock.calls[0][1];
    expect(row).toMatchObject({
      mode:               'rotating',
      checklist_mode:     'explicit',
      pass_fail_rule:     'all_checks_pass',
      frequency_days:     30,             // string coerced to number
      checklist_attr_ids: ['a1', 'a2'],
      link_source:        'self_only',
      link_type_filter:   'linked-door',  // trimmed
    });
  });

  it('rejects unknown enum values back to safe defaults', async () => {
    await defs.create(form({
      mode: 'bogus',
      checklist_mode: 'bogus',
      pass_fail_rule: 'bogus',
      link_source: 'bogus',
      checklist_attr_ids: 'not-an-array',
      frequency_days: '',
    }));
    const row = h.api.create.mock.calls[0][1];
    expect(row).toMatchObject({
      mode:               'standard',
      checklist_mode:     'type_driven',
      pass_fail_rule:     'manual',
      link_source:        'component_links',
      checklist_attr_ids: [],
      frequency_days:     null,           // empty string → null
    });
  });
});

describe('save', () => {
  it('updates the row (no created_by) and patches state in place, re-sorted', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: 'd1', name: 'Beta',  presentation_order: 0 },
      { id: 'd2', name: 'Delta', presentation_order: 0 },
    ]);
    await defs.load();
    h.api.update.mockResolvedValueOnce({ id: 'd2', name: 'Alpha', presentation_order: 0 });
    await defs.save('d2', form({ name: 'Alpha' }));

    expect(h.api.update).toHaveBeenCalledWith(
      'inspection_definitions', 'd2',
      expect.objectContaining({ name: 'Alpha', updated_by: 'u1' }),
    );
    expect(h.api.update.mock.calls[0][2]).not.toHaveProperty('created_by');
    expect(get(defs).definitions.map(d => d.name)).toEqual(['Alpha', 'Beta']);
  });

  it('fires an update audit event', async () => {
    h.api.update.mockResolvedValueOnce({ id: 'd1', name: 'Doors', mode: 'standard', frequency_days: 90, active: true });
    await defs.save('d1', form());
    expect(h.logAudit).toHaveBeenCalledWith(
      'update', 'inspection_definition', 'd1', 'Doors',
      expect.objectContaining({ appId: 'admin' }),
    );
  });
});

describe('remove', () => {
  it('deletes, drops it from state, and audits using the cached name', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'd1', name: 'Emergency Lighting', presentation_order: 0 }]);
    await defs.load();
    await defs.remove('d1');

    expect(h.api.delete).toHaveBeenCalledWith('inspection_definitions', 'd1');
    expect(get(defs).definitions).toHaveLength(0);
    expect(h.logAudit).toHaveBeenCalledWith(
      'delete', 'inspection_definition', 'd1', 'Emergency Lighting',
      expect.objectContaining({ appId: 'admin', severity: 'warning' }),
    );
  });
});
