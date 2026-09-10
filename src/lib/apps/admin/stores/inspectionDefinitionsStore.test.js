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
    upsert: vi.fn(() => Promise.resolve()),
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
  it('reads statutory_obligations ordered by presentation_order and clears loading', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'd1', name: 'Doors', presentation_order: 0 }]);
    await defs.load();
    expect(h.api.get).toHaveBeenCalledWith('statutory_obligations', { orderBy: 'presentation_order' });
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
    expect(h.api.create.mock.calls[0][0]).toBe('statutory_obligations');
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
      evidenced_by: 'bogus',
      checklist_attr_ids: 'not-an-array',
      frequency_days: '',
    }));
    const row = h.api.create.mock.calls[0][1];
    expect(row).toMatchObject({
      mode:               'standard',
      checklist_mode:     'type_driven',
      pass_fail_rule:     'manual',
      link_source:        'component_links',
      evidenced_by:       'inspection',    // unknown route → the pre-203 default
      checklist_attr_ids: [],
      frequency_days:     null,           // empty string → null
    });
  });

  // G3 (migration 167). The modal has always collected these two; toRow never
  // wrote them, so a typed statutory reference vanished on save and the
  // inspections report printed nothing. Regression-pinned here.
  it('persists the G3 statutory reference and test type', async () => {
    await defs.create(form({ statutory_ref: '  BS 5266-1  ', test_type: '  Duration  ' }));
    expect(h.api.create.mock.calls[0][1]).toMatchObject({
      statutory_ref: 'BS 5266-1',
      test_type: 'Duration',
    });
  });

  it('nulls a blank statutory reference rather than storing an empty string', async () => {
    await defs.create(form({ statutory_ref: '   ', test_type: '' }));
    expect(h.api.create.mock.calls[0][1]).toMatchObject({ statutory_ref: null, test_type: null });
  });

  // EXT-10.R1 statutory detail (migration 203). All optional: an untouched
  // field must persist as null ("not recorded"), never as '' or 0.
  it('normalises the statutory-detail fields, blanks to null', async () => {
    await defs.create(form({
      evidenced_by: 'maintenance_job',
      max_interval_days: '180',
      retention_period_months: '',
      responsible_party: '  Principal Accountable Person  ',
      competency_required: '',
      evidence_required: '  Signed certificate  ',
    }));
    const row = h.api.create.mock.calls[0][1];
    expect(row).toMatchObject({
      evidenced_by:            'maintenance_job',
      max_interval_days:       180,        // string coerced
      retention_period_months: null,       // blank → null, not 0
      responsible_party:       'Principal Accountable Person',
      competency_required:     null,
      evidence_required:       'Signed certificate',
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
      'statutory_obligations', 'd2',
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

    expect(h.api.delete).toHaveBeenCalledWith('statutory_obligations', 'd1');
    expect(get(defs).definitions).toHaveLength(0);
    expect(h.logAudit).toHaveBeenCalledWith(
      'delete', 'inspection_definition', 'd1', 'Emergency Lighting',
      expect.objectContaining({ appId: 'admin', severity: 'warning' }),
    );
  });
});

// ── M4 · the statutory template ────────────────────────────────────────────
// The gap report is only as trustworthy as the link between an obligation and
// a template entry, so these pin how that link is written and unwritten.

describe('applyTemplate', () => {
  // The store is a module singleton, so definitions carry over between tests.
  // Load an empty list first, then clear the call log, so each test below sees
  // an empty library and can index into the mock calls from zero.
  beforeEach(async () => {
    h.api.get.mockResolvedValueOnce([]);
    await defs.load();
    vi.clearAllMocks();
  });

  it('creates one obligation per key, carrying the template key and statutory detail', async () => {
    const { created, failed } = await defs.applyTemplate(['gas_safety_check']);
    expect(failed).toEqual([]);
    expect(created).toHaveLength(1);

    const row = h.api.create.mock.calls[0][1];
    expect(h.api.create.mock.calls[0][0]).toBe('statutory_obligations');
    expect(row).toMatchObject({
      name: 'Gas safety check',
      template_key: 'gas_safety_check',
      frequency_days: 365,
      evidenced_by: 'maintenance_job',
      created_by: 'u1',
      updated_by: 'u1',
    });
    expect(row.statutory_ref).toMatch(/Gas Safety/);
  });

  it('applies in template order regardless of the order asked for, and ignores unknown keys', async () => {
    await defs.applyTemplate(['gas_safety_check', 'fser_communal_fire_doors', 'not_a_key']);
    const keys = h.api.create.mock.calls.map(c => c[1].template_key);
    expect(keys).toEqual(['fser_communal_fire_doors', 'gas_safety_check']);
  });

  // One failing entry must not take the rest of the template with it.
  it('reports a partial apply rather than failing the whole batch', async () => {
    h.api.create
      .mockRejectedValueOnce(new Error('duplicate name'))
      .mockResolvedValueOnce({ id: 'd2', name: 'Gas safety check' });

    const { created, failed } = await defs.applyTemplate(['fser_communal_fire_doors', 'gas_safety_check']);
    expect(created).toHaveLength(1);
    expect(failed).toEqual([
      expect.objectContaining({ key: 'fser_communal_fire_doors', message: 'duplicate name' }),
    ]);
    expect(get(defs).definitions).toHaveLength(1);
  });

  it('orders applied entries below anything already ordered by hand', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'd1', name: 'Existing', presentation_order: 7 }]);
    await defs.load();
    await defs.applyTemplate(['gas_safety_check']);
    expect(h.api.create.mock.calls[0][1].presentation_order).toBe(8);
  });

  it('audits each creation with the template key', async () => {
    await defs.applyTemplate(['gas_safety_check']);
    expect(h.logAudit).toHaveBeenCalledWith(
      'create', 'inspection_definition', expect.any(String), 'Gas safety check',
      expect.objectContaining({ afterData: expect.objectContaining({ template_key: 'gas_safety_check' }) }),
    );
  });
});

describe('linkToTemplate', () => {
  it('writes the key onto an existing obligation', async () => {
    await defs.linkToTemplate('d1', 'gas_safety_check');
    expect(h.api.update).toHaveBeenCalledWith('statutory_obligations', 'd1',
      { template_key: 'gas_safety_check', updated_by: 'u1' });
  });

  it('unlinks with null', async () => {
    await defs.linkToTemplate('d1', null);
    expect(h.api.update.mock.calls[0][2].template_key).toBeNull();
  });
});

// The edit modal carries no template field. If save() defaulted the column to
// null, editing a covered obligation would silently reopen a statutory gap.
describe('save must not disturb an existing template link', () => {
  it('omits template_key entirely when the caller did not supply one', async () => {
    await defs.save('d1', form());
    expect(h.api.update.mock.calls[0][2]).not.toHaveProperty('template_key');
  });

  it('still writes it when a caller does supply one', async () => {
    await defs.save('d1', form({ template_key: 'gas_safety_check' }));
    expect(h.api.update.mock.calls[0][2].template_key).toBe('gas_safety_check');
  });
});

describe('exclusion decisions', () => {
  // The store is a module singleton, so decisions carry over between tests.
  // Start each one from an empty log.
  beforeEach(async () => {
    h.api.get.mockResolvedValueOnce([]);
    await defs.loadExclusions();
    vi.clearAllMocks();
  });

  it('reads the whole append-only log and reduces it to the current position', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: '2', template_key: 'lift_maintenance', decision: 'applicable',     reason: 'lift fitted', decided_at: '2026-06-01T00:00:00Z' },
      { id: '1', template_key: 'lift_maintenance', decision: 'not_applicable', reason: 'no lift',     decided_at: '2026-01-01T00:00:00Z' },
      { id: '3', template_key: 'gas_safety_check', decision: 'not_applicable', reason: 'all electric', decided_at: '2026-02-01T00:00:00Z' },
    ]);
    const rows = await defs.loadExclusions();
    expect(h.api.get).toHaveBeenCalledWith('statutory_exclusions',
      { orderBy: 'decided_at', ascending: false });
    expect(rows).toHaveLength(3);
    // A reinstated key is no longer excluded, but its history is still held.
    expect(get(defs).dismissedKeys).toEqual(['gas_safety_check']);
    expect(get(defs).exclusions).toHaveLength(3);
  });

  // Without them the register asks about everything, which is the safe way to
  // fail: over-asking beats silently hiding statutory checks.
  it('degrades to an empty list rather than throwing', async () => {
    h.api.get.mockRejectedValueOnce(new Error('offline'));
    await expect(defs.loadExclusions()).resolves.toEqual([]);
  });

  it('inserts a decision with the reason, decider and timestamp', async () => {
    h.api.create.mockResolvedValueOnce({ id: 'x1', template_key: 'lift_maintenance', decision: 'not_applicable' });
    await defs.recordExclusionDecision('lift_maintenance', 'not_applicable', '  No lift — four storeys  ');
    expect(h.api.create).toHaveBeenCalledWith('statutory_exclusions', {
      template_key: 'lift_maintenance',
      decision: 'not_applicable',
      reason: 'No lift — four storeys',
      review_due: null,
      decided_by: 'u1',
      created_by: 'u1',
    });
    expect(get(defs).dismissedKeys).toEqual(['lift_maintenance']);
  });

  it('carries an optional review date', async () => {
    await defs.recordExclusionDecision('eicr_dwellings', 'not_applicable', 'All long leases', { reviewDue: '2027-04-01' });
    expect(h.api.create.mock.calls[0][1].review_due).toBe('2027-04-01');
  });

  // The reason is what an assessor is shown. A blank one is not a decision, and
  // the check is here as well as at the database so the user hears it first.
  it('refuses a decision with no real reason, without touching the database', async () => {
    await expect(defs.recordExclusionDecision('lift_maintenance', 'not_applicable', '   '))
      .rejects.toThrow(/reason is required/i);
    expect(h.api.create).not.toHaveBeenCalled();
  });

  it('refuses a key that is not in the register', async () => {
    await expect(defs.recordExclusionDecision('invented', 'not_applicable', 'because'))
      .rejects.toThrow(/Unknown register entry/);
    expect(h.api.create).not.toHaveBeenCalled();
  });

  // Reversing a decision appends beside it — the original must survive.
  it('records a reinstatement without erasing the exclusion', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: '1', template_key: 'lift_maintenance', decision: 'not_applicable', reason: 'no lift', decided_at: '2026-01-01T00:00:00Z' },
    ]);
    await defs.loadExclusions();
    h.api.create.mockResolvedValueOnce({
      id: '2', template_key: 'lift_maintenance', decision: 'applicable',
      reason: 'lift installed', decided_at: '2026-06-01T00:00:00Z',
    });
    await defs.recordExclusionDecision('lift_maintenance', 'applicable', 'lift installed');

    expect(h.api.delete).not.toHaveBeenCalled();
    expect(h.api.update).not.toHaveBeenCalled();
    expect(get(defs).exclusions).toHaveLength(2);
    expect(get(defs).dismissedKeys).toEqual([]);
  });

  // Declaring a legal requirement inapplicable is a decision someone may later
  // have to justify, so it is not logged as routine config noise.
  it('audits an exclusion as a warning, with the reason and the basis', async () => {
    h.api.create.mockResolvedValueOnce({ id: 'x9' });
    await defs.recordExclusionDecision('gas_safety_check', 'not_applicable', 'Building is all electric');
    expect(h.logAudit).toHaveBeenCalledWith(
      'create', 'statutory_exclusion', 'x9', 'Gas safety check',
      expect.objectContaining({
        severity: 'warning',
        afterData: expect.objectContaining({
          template_key: 'gas_safety_check',
          decision: 'not_applicable',
          reason: 'Building is all electric',
          basis: 'statute',
        }),
      }),
    );
  });

  it('audits a reinstatement as ordinary information, not a warning', async () => {
    h.api.create.mockResolvedValueOnce({ id: 'x8' });
    await defs.recordExclusionDecision('gas_safety_check', 'applicable', 'Communal boiler installed');
    expect(h.logAudit).toHaveBeenCalledWith(
      'create', 'statutory_exclusion', 'x8', 'Gas safety check',
      expect.objectContaining({ severity: 'info' }),
    );
  });
});
