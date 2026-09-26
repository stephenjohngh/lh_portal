// src/lib/apps/parking/utils/parkingDue.test.js
import { describe, it, expect } from 'vitest';
import { parkingDueItems } from './parkingDue.js';

const today = '2026-09-26';
const bayRefs = new Map([['b1', 'L/PK/22'], ['b2', 'L/PK/23']]);
const ag = (over) => ({ id: 'a1', reference: 'PA-0001', bay_id: 'b1', status: 'active',
  starts_on: '2026-01-01', ends_on: null, ...over });

describe('parkingDueItems', () => {
  it('dates an agreement ending, and calls it overdue once past and not ended', () => {
    const [i] = parkingDueItems({ agreements: [ag({ ends_on: '2026-10-31' })], bayRefs }, today);
    expect(i).toMatchObject({ kind: 'ending', date: '2026-10-31', overdue: false,
      title: 'Agreement ends: PA-0001 · L/PK/22' });
    const [late] = parkingDueItems({ agreements: [ag({ ends_on: '2026-09-01' })], bayRefs }, today);
    expect(late.overdue).toBe(true);
  });

  it('says notice runs out for an agreement under notice', () => {
    const [i] = parkingDueItems({ agreements: [ag({ status: 'notice_given', ends_on: '2026-10-20' })], bayRefs }, today);
    expect(i.title).toBe('Notice runs out: PA-0001 · L/PK/22');
  });

  it('a rolling agreement has nothing to date', () => {
    expect(parkingDueItems({ agreements: [ag()], bayRefs }, today)).toEqual([]);
  });

  it('flags a draft whose start has come without being activated', () => {
    const [i] = parkingDueItems({ agreements: [ag({ status: 'draft', starts_on: '2026-09-20' })], bayRefs }, today);
    expect(i).toMatchObject({ kind: 'draft', needsArranging: true, date: today });
  });

  // ⛔ An unreturned device on an ended agreement still opens the gate.
  it('flags devices still out after an agreement ended, as overdue', () => {
    const [i] = parkingDueItems({
      agreements: [ag({ status: 'ended', ends_on: '2026-08-31' })],
      devices: [{ agreement_id: 'a1', returned_on: null }, { agreement_id: 'a1', returned_on: '2026-09-01' }],
      bayRefs }, today);
    expect(i).toMatchObject({ kind: 'device', overdue: true, title: '1 device not returned: PA-0001' });
  });

  it('dates an offer by its expiry, overdue once lapsed', () => {
    const [i] = parkingDueItems({ applications: [{ id: 'w1', status: 'offered', offered_bay_id: 'b2',
      offer_expires_on: '2026-09-20' }], bayRefs }, today);
    expect(i).toMatchObject({ kind: 'offer', title: 'Offer expires: L/PK/23', overdue: true });
  });

  it('dates a bay due back in use', () => {
    const [i] = parkingDueItems({ bays: [{ id: 'b1', in_service: false, out_of_use_until: '2026-10-05',
      out_of_use_reason: 'Leak' }], bayRefs }, today);
    expect(i).toMatchObject({ kind: 'bay_back', title: 'Due back in use: L/PK/22', detail: 'Leak' });
  });

  it('leaves out anything after the window, but never anything overdue before it', () => {
    const agreements = [ag({ id: 'x', ends_on: '2026-01-01' }), ag({ id: 'y', ends_on: '2027-06-01' })];
    expect(parkingDueItems({ agreements, bayRefs }, today, '2026-12-31').map(i => i.id)).toEqual(['end:x']);
  });

  // ⛔ The Planner shows these beside other apps' work, and is granted
  // separately from Parking. A row names a licence and a bay, never a person.
  it('never puts personal data in a row', () => {
    const items = parkingDueItems({
      agreements: [ag({ ends_on: '2026-10-31', holder_id: 'h1', notes: 'Alice Example, 07700 900000' })],
      applications: [{ id: 'w1', status: 'offered', offered_bay_id: 'b2', offer_expires_on: '2026-10-01', holder_id: 'h2' }],
      bayRefs }, today);
    const text = JSON.stringify(items);
    for (const s of ['Alice', '07700', 'h1', 'h2', 'holder']) expect(text).not.toContain(s);
  });
});
