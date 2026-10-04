// src/lib/apps/parking/utils/parkingReports.test.js
import { describe, it, expect, vi } from 'vitest';

vi.mock('#lib/utils/authHeaders.js', () => ({ authHeaders: async () => ({}) }));
vi.mock('#lib/utils/download.js', () => ({ downloadResponse: vi.fn() }));

const {
  annualFee, bayRegisterSheet, agreementsSheet, waitingListSheet, devicesOutSheet,
  REPORTS, reportSummary,
} = await import('./parkingReports.js');

const holders = [{ id: 'h1', holder_type: 'leaseholder', display_name: 'Alice Example' }];
const bays = [{ bay_id: 'b1', space_id: 's1', ref: 'L/PK/22', size: 'Car', state: 'allocated',
  tenure: 'licensable', in_service: true, measured: { width: 2.4, length: 4.8 },
  current: { id: 'a1', reference: 'PA-0001', holder_id: 'h1' }, space: { label: 'space 22' } }];
const agreements = [
  { id: 'a1', reference: 'PA-0001', bay_id: 'b1', holder_id: 'h1', basis: 'licence', status: 'active',
    starts_on: '2026-01-01', ends_on: null, fee_amount: 60, fee_period: 'month', vat_treatment: 'standard' },
  { id: 'a2', reference: 'PA-0002', bay_id: 'b1', holder_id: 'h1', basis: 'licence', status: 'ended',
    starts_on: '2025-01-01', ends_on: '2025-12-31', fee_amount: 10, fee_period: 'week' },
];

describe('the income figures', () => {
  it('turns a fee into a yearly figure', () => {
    expect(annualFee({ fee_amount: 60, fee_period: 'month' })).toBe(720);
    expect(annualFee({ fee_amount: 10, fee_period: 'week' })).toBe(520);
    expect(annualFee({ fee_amount: null, fee_period: 'month' })).toBeNull();
  });
  it('totals only agreements that are active or under notice', () => {
    expect(agreementsSheet({ agreements, holders, bays }).total).toBe(720);
  });
});

describe('the sheets', () => {
  // A row with a different number of cells from the header is a column of the
  // wrong values under the wrong heading — exactly the report that reads right
  // and says something untrue.
  it('every row has exactly as many cells as the header, in every report', () => {
    const state = { bays, holders, agreements, vehicles: [], devices: [{ agreement_id: 'a2', device_type: 'fob',
      serial: 'F-1', issued_on: '2025-01-01', returned_on: null }],
      applications: [{ id: 'w1', holder_id: 'h1', wanted_size: 'Car', joined_on: '2026-02-01', status: 'waiting' }] };
    for (const key of Object.keys(REPORTS)) {
      const sheet = REPORTS[key].build(state);
      expect(sheet.rows.length, key).toBeGreaterThan(0);
      for (const row of sheet.rows) expect(row.length, key).toBe(sheet.headers.length);
      for (const row of sheet.rows) for (const cell of row) expect(typeof cell, key).toBe('string');
    }
  });
  it('the bay register shows who holds each bay today, and its measured size', () => {
    const row = bayRegisterSheet({ bays, holders }).rows[0];
    expect(row).toContain('L/PK/22');
    expect(row).toContain('Alice Example');
    expect(row).toContain('2.40');
  });
  it('the device report lists only devices out after an ended agreement', () => {
    const rows = devicesOutSheet({ agreements, holders, bays,
      devices: [{ agreement_id: 'a2', device_type: 'fob', serial: 'F-1', issued_on: '2025-01-01', returned_on: null },
                { agreement_id: 'a1', device_type: 'fob', serial: 'F-2', issued_on: '2026-01-01', returned_on: null }] }).rows;
    expect(rows.map(r => r[1])).toEqual(['F-1']);
  });
  it('the waiting list is in queue order', () => {
    const rows = waitingListSheet({ holders, bays, applications: [
      { id: 'late', holder_id: 'h1', wanted_size: 'Car', joined_on: '2026-03-01', status: 'waiting' },
      { id: 'early', holder_id: 'h1', wanted_size: 'Bicycle', joined_on: '2026-01-01', status: 'waiting' },
    ] }).rows;
    expect(rows.map(r => r[3])).toEqual(['Bicycle', 'Car']);
  });
});

// ⚠ These files leave the one place the `parking` grant protects.
describe('a report that names people says so', () => {
  it('every report carries the personal-data warning in its header line', () => {
    for (const key of Object.keys(REPORTS)) {
      const summary = reportSummary(key, { rows: [], total: 0 });
      expect(summary, key).toMatch(/personal data/);
    }
  });
});
