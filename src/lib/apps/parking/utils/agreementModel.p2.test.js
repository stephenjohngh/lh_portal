// src/lib/apps/parking/utils/agreementModel.p2.test.js
// Phase 2: notice, access devices, moving to another bay, the timeline.
import { describe, it, expect } from 'vitest';
import {
  addDaysISO, noticeEndDate, validateNotice,
  validateDevice, outstandingDevices, depositRefundProblem, unreturnedAfterEnd,
  validateMove, EVENT_LABEL, eventSummary,
} from './agreementModel.js';

const active = { id: 'a1', reference: 'PA-0001', bay_id: 'b1', basis: 'licence', status: 'active',
  starts_on: '2026-01-01', ends_on: null, notice_days: 28 };

describe('notice', () => {
  it('counts the notice period in whole days, across a clock change', () => {
    expect(addDaysISO('2026-10-20', 28)).toBe('2026-11-17');   // spans the end of BST
    expect(addDaysISO('2026-03-20', 14)).toBe('2026-04-03');   // spans the start
  });
  it('ends notice days after service, unless the agreement ends sooner', () => {
    expect(noticeEndDate(active, '2026-10-01')).toBe('2026-10-29');
    expect(noticeEndDate({ ...active, ends_on: '2026-10-15' }, '2026-10-01')).toBe('2026-10-15');
    expect(noticeEndDate({ ...active, notice_days: null }, '2026-10-01')).toBeNull();
  });
  it('needs an active agreement, a date, who served it, and an end on or after service', () => {
    const ok = { served_on: '2026-10-01', served_by: 'holder', ends_on: '2026-10-29' };
    expect(validateNotice(active, ok)).toBeNull();
    expect(validateNotice({ ...active, status: 'draft' }, ok)).toMatch(/active/);
    expect(validateNotice(active, { ...ok, served_by: '' })).toMatch(/who/);
    expect(validateNotice(active, { ...ok, ends_on: '2026-09-01' })).toMatch(/before notice/);
    expect(validateNotice(active, { ...ok, served_on: '2025-12-01' })).toMatch(/before the agreement/);
  });
});

describe('access devices', () => {
  const devices = [{ id: 'd1', agreement_id: 'a1', device_type: 'fob', serial: 'F-100', returned_on: null }];
  const agreements = [active];

  // ⛔ An unreturned device still opens the gate: the same serial cannot be out twice.
  it('refuses a serial that is still out, however it is typed, and names who has it', () => {
    expect(validateDevice({ device_type: 'fob', serial: ' f-100 ' }, devices, agreements)).toMatch(/still out, on PA-0001/);
    expect(validateDevice({ device_type: 'remote', serial: 'F-100' }, devices, agreements)).toBeNull();   // a different kind
    expect(validateDevice({ device_type: 'fob', serial: 'F-100' },
      [{ ...devices[0], returned_on: '2026-09-01' }], agreements)).toBeNull();                         // it came back
    expect(validateDevice({ device_type: 'fob', serial: '' }, [], [])).toMatch(/serial/);
  });

  it('will not mark a deposit refunded while a device is out', () => {
    const withDeposit = { ...active, deposit_amount: 25 };
    expect(depositRefundProblem(withDeposit, devices)).toMatch(/not been returned/);
    expect(depositRefundProblem(withDeposit, [])).toBeNull();
    expect(depositRefundProblem(active, [])).toMatch(/no deposit/);
  });

  it('lists ended agreements with a device still out', () => {
    const ended = { ...active, status: 'ended', ends_on: '2026-09-01' };
    expect(unreturnedAfterEnd([ended], devices).map(a => a.id)).toEqual(['a1']);
    expect(unreturnedAfterEnd([active], devices)).toEqual([]);          // still live: not a problem yet
    expect(outstandingDevices('a1', devices)).toHaveLength(1);
  });
});

describe('moving to another bay', () => {
  const to = { bay_id: 'b2', ref: 'L/PK/23', tenure: 'licensable', in_service: true };
  const holder = { holder_type: 'leaseholder' };
  it('allows an active licence to move to a free licensable bay after it started', () => {
    expect(validateMove(active, to, '2026-10-01', holder, [active])).toBeNull();
  });
  it('refuses the same bay, a move on the first day, an out-of-use bay, and a record', () => {
    expect(validateMove(active, { ...to, bay_id: 'b1' }, '2026-10-01', holder)).toMatch(/same bay/);
    expect(validateMove(active, to, '2026-01-01', holder)).toMatch(/after the agreement started/);
    expect(validateMove(active, { ...to, in_service: false }, '2026-10-01', holder)).toMatch(/out of use/);
    expect(validateMove({ ...active, basis: 'demise_record' }, to, '2026-10-01', holder)).toMatch(/Only a licence/);
  });
  it('refuses a bay somebody else already holds on that date', () => {
    const other = { id: 'x', reference: 'PA-0009', bay_id: 'b2', status: 'active', starts_on: '2026-01-01', ends_on: null };
    expect(validateMove(active, to, '2026-10-01', holder, [active, other])).toMatch(/PA-0009/);
  });
});

describe('the timeline', () => {
  it('has words for every event the database writes', () => {
    for (const t of ['created', 'activated', 'notice_served', 'notice_withdrawn', 'ended', 'terminated',
      'terms_changed', 'deposit_refunded', 'vehicle_added', 'vehicle_removed', 'device_issued',
      'device_returned', 'bay_out_of_use', 'bay_back_in_use']) {
      expect(EVENT_LABEL[t], t).toBeTruthy();
    }
  });
  it('summarises an entry in one line', () => {
    expect(eventSummary({ event_type: 'device_issued', detail: { type: 'fob', serial: 'F-1' } })).toBe('Fob F-1');
    expect(eventSummary({ event_type: 'terms_changed', detail: { fee_amount: { from: 50, to: 60 } } }))
      .toBe('fee amount: 50 → 60');
  });
});
