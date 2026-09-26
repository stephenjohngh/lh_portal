// src/lib/apps/parking/utils/tariffModel.js
// The price list, by bay size. docs/requirements/unbuilt/Parking_App_Design.md §5.7.
// Mirrors migration 225, which enforces the same rules.
//
// ⭐ A price change is a NEW ROW from a date, never an edit: an old agreement
// must still show what it was priced at. Adding a price closes the one it
// replaces the day before.
// ⛔ An agreement COPIES the fee when it is made. `tariff_id` on the agreement
// says which price it came from, and only while the fee still matches it.
// ⚠ No accessibility dimension: an accessible bay costs what its size costs.

import { PARKING_BAY_TYPES } from '$lib/apps/building_assets/utils/spaceTypeOptions.js';
import { FEE_PERIODS, VAT_TREATMENTS, DEFAULT_VAT, addDaysISO } from './agreementModel.js';

export const HOLDER_CLASSES = [
  { value: 'all',      label: 'Everyone' },
  { value: 'resident', label: 'Residents (leaseholders and occupiers)' },
  { value: 'external', label: 'External holders' },
];
export const HOLDER_CLASS_LABEL = Object.fromEntries(HOLDER_CLASSES.map(c => [c.value, c.label]));

/** A holder's price class: residents and external holders may pay differently. */
export function holderClass(holderType) {
  if (holderType === 'leaseholder' || holderType === 'occupier') return 'resident';
  if (holderType === 'external_individual' || holderType === 'external_company') return 'external';
  return null;
}

/** Does the price apply on this ISO date? */
export function tariffCovers(t, iso) {
  return t.effective_from <= iso && (!t.effective_to || iso <= t.effective_to);
}

/**
 * The price for a bay of this size, for this holder, on this date. A price set
 * for the holder's class wins over one for everyone. Null when there is none —
 * never a guess.
 */
export function tariffFor(tariffs, size, holderType, iso) {
  if (!size || !iso) return null;
  const live = (tariffs ?? []).filter(t => t.bay_size === size && tariffCovers(t, iso));
  const cls = holderClass(holderType);
  return (cls && live.find(t => t.holder_class === cls)) ?? live.find(t => t.holder_class === 'all') ?? null;
}

const money = v => (v === '' || v == null ? null : Number(v));

/** Do an agreement's terms still carry this price? */
export function matchesTariff(terms, t) {
  if (!t) return false;
  return money(terms.fee_amount) === Number(t.amount) && terms.fee_period === t.period;
}

/** The terms a price fills in on a new agreement. */
export function termsFromTariff(t) {
  return {
    fee_amount: Number(t.amount).toFixed(2),
    fee_period: t.period,
    vat_treatment: t.vat_treatment,
    deposit_amount: t.deposit_amount == null ? '' : Number(t.deposit_amount).toFixed(2),
  };
}

/** "£60.00 a month". */
export function priceLabel(t) {
  if (!t) return '';
  return `£${Number(t.amount).toFixed(2)} a ${t.period}`;
}

function isISO(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

/**
 * The problem with a new price, or null. Mirrors 225: the size, a sum and a
 * period, a start date, and one price per size and class on any day. A new
 * price may start after the current one (which it then closes); it may not
 * start on or before it, or inside a closed one.
 */
export function validateTariff(t, existing = []) {
  if (!PARKING_BAY_TYPES.includes(t.bay_size)) return 'Choose the bay size.';
  if (!HOLDER_CLASSES.some(c => c.value === (t.holder_class || 'all'))) return 'Choose who the price is for.';
  const amount = money(t.amount);
  if (amount == null || !Number.isFinite(amount) || amount < 0) return 'Enter the price, in pounds.';
  if (Math.round(amount * 100) !== amount * 100) return 'A price has at most two decimal places.';
  if (!FEE_PERIODS.includes(t.period)) return 'Choose what the price is per.';
  if (!VAT_TREATMENTS.some(v => v.value === (t.vat_treatment || DEFAULT_VAT))) return 'Choose the VAT treatment.';
  const dep = money(t.deposit_amount);
  if (dep != null && (!Number.isFinite(dep) || dep < 0)) return 'The deposit must be a sum of money, or blank.';
  if (!isISO(t.effective_from)) return 'Enter the date the price starts.';
  const cls = t.holder_class || 'all';
  for (const o of existing) {
    if (o.bay_size !== t.bay_size || o.holder_class !== cls) continue;
    if (!o.effective_to && t.effective_from <= o.effective_from) {
      return `The current ${t.bay_size} price started on ${o.effective_from}. A new price must start after that.`;
    }
    if (o.effective_to && t.effective_from <= o.effective_to) {
      return `A ${t.bay_size} price already applies up to ${o.effective_to}. Start the new one after that.`;
    }
  }
  return null;
}

/**
 * The price a removed one had closed, which removing it should reopen: same
 * size and class, ending the day before it started. Null when there is none.
 */
export function reopenedBy(tariffs, removed) {
  if (!removed) return null;
  const dayBefore = addDaysISO(removed.effective_from, -1);
  return (tariffs ?? []).find(t => t.id !== removed.id && t.bay_size === removed.bay_size
    && t.holder_class === removed.holder_class && t.effective_to === dayBefore) ?? null;
}

/** The row to insert. */
export function tariffRow(t) {
  return {
    bay_size: t.bay_size,
    holder_class: t.holder_class || 'all',
    amount: money(t.amount),
    period: t.period,
    vat_treatment: t.vat_treatment || DEFAULT_VAT,
    deposit_amount: money(t.deposit_amount),
    effective_from: t.effective_from,
    notes: String(t.notes ?? '').trim() || null,
  };
}

/**
 * The price list as it stands on a date: one line per size, with whatever is
 * current for each class, then the prices that have ended and the ones not yet
 * started. A size with no price says so rather than being left out.
 */
export function priceList(tariffs, iso) {
  return PARKING_BAY_TYPES.map(size => {
    const rows = (tariffs ?? []).filter(t => t.bay_size === size);
    return {
      size,
      current: rows.filter(t => tariffCovers(t, iso))
        .sort((a, b) => a.holder_class.localeCompare(b.holder_class)),
      upcoming: rows.filter(t => t.effective_from > iso)
        .sort((a, b) => a.effective_from.localeCompare(b.effective_from)),
      past: rows.filter(t => t.effective_to && t.effective_to < iso)
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
    };
  });
}
