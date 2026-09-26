// src/lib/apps/parking/utils/tariffModel.test.js
// The price list, by bay size (design §5.7, migration 225).
import { describe, it, expect } from 'vitest';
import {
  holderClass, tariffFor, matchesTariff, termsFromTariff, validateTariff, reopenedBy, priceList, tariffRow,
} from './tariffModel.js';
import { PARKING_BAY_TYPES } from '$lib/apps/building_assets/utils/spaceTypeOptions.js';

const t = (o) => ({ id: o.id, bay_size: 'Car', holder_class: 'all', amount: 60, period: 'month',
  vat_treatment: 'not_decided', deposit_amount: null, effective_from: '2026-01-01', effective_to: null, ...o });

const tariffs = [
  t({ id: 'old', amount: 50, effective_to: '2026-03-31' }),
  t({ id: 'car', effective_from: '2026-04-01' }),
  t({ id: 'car-ext', holder_class: 'external', amount: 80, effective_from: '2026-04-01' }),
  t({ id: 'bike', bay_size: 'Bicycle', amount: 5 }),
];

describe('holderClass', () => {
  it('puts leaseholders and occupiers with residents, the rest with external holders', () => {
    expect(holderClass('leaseholder')).toBe('resident');
    expect(holderClass('occupier')).toBe('resident');
    expect(holderClass('external_individual')).toBe('external');
    expect(holderClass('external_company')).toBe('external');
    expect(holderClass(undefined)).toBeNull();
  });
});

describe('tariffFor', () => {
  it('prices by size on the date, the old price before it changed', () => {
    expect(tariffFor(tariffs, 'Car', 'leaseholder', '2026-02-01').id).toBe('old');
    expect(tariffFor(tariffs, 'Car', 'leaseholder', '2026-06-01').id).toBe('car');
    expect(tariffFor(tariffs, 'Bicycle', 'occupier', '2026-06-01').id).toBe('bike');
  });
  it("a price for the holder's class wins over one for everyone", () => {
    expect(tariffFor(tariffs, 'Car', 'external_company', '2026-06-01').id).toBe('car-ext');
    // An external holder before the external price existed pays the general one.
    expect(tariffFor(tariffs, 'Car', 'external_company', '2026-02-01').id).toBe('old');
  });
  it('says nothing rather than guess: no size, no price, no date', () => {
    expect(tariffFor(tariffs, null, 'leaseholder', '2026-06-01')).toBeNull();
    expect(tariffFor(tariffs, 'Motorcycle', 'leaseholder', '2026-06-01')).toBeNull();
    expect(tariffFor(tariffs, 'Car', 'leaseholder', '2025-01-01')).toBeNull();
    expect(tariffFor(tariffs, 'Car', 'leaseholder', '')).toBeNull();
  });
});

describe('an agreement copies the price', () => {
  it('fills the fee, period, VAT and deposit from the price', () => {
    const terms = termsFromTariff(t({ id: 'x', amount: 60, deposit_amount: 25, vat_treatment: 'exempt' }));
    expect(terms).toEqual({ fee_amount: '60.00', fee_period: 'month', vat_treatment: 'exempt', deposit_amount: '25.00' });
    expect(matchesTariff(terms, t({ id: 'x', amount: 60 }))).toBe(true);
  });
  it('a fee changed by hand is no longer the list price', () => {
    const price = t({ id: 'x' });
    expect(matchesTariff({ fee_amount: '55', fee_period: 'month' }, price)).toBe(false);
    expect(matchesTariff({ fee_amount: '60', fee_period: 'week' }, price)).toBe(false);
    expect(matchesTariff({ fee_amount: '', fee_period: 'month' }, price)).toBe(false);
    expect(matchesTariff({ fee_amount: '60', fee_period: 'month' }, null)).toBe(false);
  });
});

describe('validateTariff', () => {
  const ok = { bay_size: 'Car', holder_class: 'all', amount: '65', period: 'month', effective_from: '2026-10-01' };
  it('accepts a new price after the current one', () => {
    expect(validateTariff(ok, tariffs)).toBeNull();
  });
  it('refuses a price that would overlap: on or before the current one, or inside a closed one', () => {
    expect(validateTariff({ ...ok, effective_from: '2026-04-01' }, tariffs)).toMatch(/after that/);
    expect(validateTariff({ ...ok, effective_from: '2026-03-01' }, tariffs)).toMatch(/after that/);
  });
  it('treats each holder class separately', () => {
    expect(validateTariff({ ...ok, holder_class: 'resident', effective_from: '2026-01-01' }, tariffs)).toBeNull();
  });
  it('refuses a missing size, sum, period or date', () => {
    expect(validateTariff({ ...ok, bay_size: 'Lorry' }, [])).toMatch(/size/);
    expect(validateTariff({ ...ok, amount: '' }, [])).toMatch(/price/);
    expect(validateTariff({ ...ok, amount: '-1' }, [])).toMatch(/price/);
    expect(validateTariff({ ...ok, amount: '1.234' }, [])).toMatch(/two decimal/);
    expect(validateTariff({ ...ok, period: 'fortnight' }, [])).toMatch(/per/);
    expect(validateTariff({ ...ok, effective_from: '' }, [])).toMatch(/date/);
    expect(validateTariff({ ...ok, deposit_amount: 'x' }, [])).toMatch(/deposit/);
  });
  it('has no accessibility dimension: an accessible bay costs what its size costs', () => {
    expect(Object.keys(tariffRow(ok)).some(k => /access/i.test(k))).toBe(false);
  });
});

describe('reopenedBy', () => {
  it('removing a price reopens the one it closed the day before', () => {
    const closed = t({ id: 'a', effective_to: '2026-09-30' });
    const added = t({ id: 'b', effective_from: '2026-10-01' });
    expect(reopenedBy([closed, added], added)?.id).toBe('a');
    expect(reopenedBy([closed, added], t({ id: 'c', holder_class: 'external', effective_from: '2026-10-01' }))).toBeNull();
  });
});

describe('priceList', () => {
  it('lists every size, even one with no price, and splits current, upcoming and past', () => {
    const list = priceList([...tariffs, t({ id: 'next', amount: 70, effective_from: '2027-01-01' })], '2026-06-01');
    expect(list.map(r => r.size)).toEqual(PARKING_BAY_TYPES);
    const car = list.find(r => r.size === 'Car');
    expect(car.current.map(x => x.id).sort()).toEqual(['car', 'car-ext']);
    expect(car.upcoming.map(x => x.id)).toEqual(['next']);
    expect(car.past.map(x => x.id)).toEqual(['old']);
    expect(list.find(r => r.size === 'Motorcycle').current).toEqual([]);
  });
});

describe('VAT (decision D4, 2026-09-27)', () => {
  // No VAT is charged on parking at present, so a price or agreement that says
  // nothing about VAT records that, not "ask the accountant".
  it('defaults a new price and a new agreement to "No VAT charged"', async () => {
    const { agreementRow, VAT_TREATMENTS, DEFAULT_VAT } = await import('./agreementModel.js');
    expect(DEFAULT_VAT).toBe('not_charged');
    expect(VAT_TREATMENTS[0]).toEqual({ value: 'not_charged', label: 'No VAT charged' });
    expect(tariffRow({ bay_size: 'Car', amount: '5', period: 'month', effective_from: '2026-10-01' }).vat_treatment).toBe('not_charged');
    expect(agreementRow({ basis: 'licence', starts_on: '2026-10-01' }).vat_treatment).toBe('not_charged');
  });
});
