// src/lib/apps/parking/utils/agreementModel.js
// Parking, phase 1 — holders, agreements and vehicles, as pure functions.
// docs/requirements/unbuilt/Parking_App_Design.md §3, §5.2–5.4.
//
// The database enforces the same rules (migration 222: CHECKs, the no-overlap
// exclusion and the parking_agreement_rules trigger). These exist so a person
// sees the reason BEFORE saving, in words, instead of a constraint name. Keep
// the two in step.
//
// ⭐ A HOLDER IS A PARTY TO AN AGREEMENT, NEVER "THE RESIDENT OF FLAT N"
// (design §3, a bounded exception to the portal's resident-data rule). So a
// holder row carries only what an agreement needs; see HOLDER_FIELDS.

// ── Holders ────────────────────────────────────────────────────────────────

export const HOLDER_TYPES = [
  { value: 'leaseholder',         label: 'Leaseholder' },
  { value: 'occupier',            label: 'Occupier (tenant of a flat)' },
  { value: 'external_individual', label: 'External — individual' },
  { value: 'external_company',    label: 'External — company' },
];
export const HOLDER_TYPE_LABEL = Object.fromEntries(HOLDER_TYPES.map(t => [t.value, t.label]));

export function isExternal(holderType) {
  return holderType === 'external_individual' || holderType === 'external_company';
}

/**
 * ⛔ Every field a holder row may carry. There is deliberately no flat, unit,
 * "resident of", date of birth or identity-document field: a flat appears only
 * on an AGREEMENT, as the unit a demised bay belongs to. A test asserts this
 * list never grows one.
 */
export const HOLDER_FIELDS = Object.freeze([
  'holder_type', 'display_name', 'company_name', 'email', 'phone',
  'correspondence_address', 'privacy_notice_version', 'privacy_notice_at',
]);

const blank = v => !String(v ?? '').trim();

/** The problem with a holder, or null. Mirrors migration 222's CHECKs. */
export function validateHolder(h) {
  if (!HOLDER_TYPES.some(t => t.value === h.holder_type)) return 'Choose what kind of holder this is.';
  if (blank(h.display_name)) return 'Enter a name.';
  if (h.holder_type === 'external_company' && blank(h.company_name)) return 'Enter the company name.';
  if (blank(h.email) && blank(h.correspondence_address)) {
    return 'Enter an email or a correspondence address: a licence needs somewhere to serve notice.';
  }
  if (isExternal(h.holder_type) && (blank(h.privacy_notice_version) || !h.privacy_notice_at)) {
    return 'An external holder must be given the privacy notice first. Record which version, and when.';
  }
  return null;
}

/** The row to write: only HOLDER_FIELDS, trimmed, blanks as null. */
export function holderRow(h) {
  const row = {};
  for (const k of HOLDER_FIELDS) {
    const v = h[k];
    row[k] = typeof v === 'string' ? (v.trim() || null) : (v ?? null);
  }
  return row;
}

// ── Agreements ─────────────────────────────────────────────────────────────

export const BASES = [
  { value: 'licence',            label: 'Licence',                 tenure: 'licensable' },
  { value: 'adjustment',         label: 'Licence — reasonable adjustment', tenure: 'licensable' },
  { value: 'demise_record',      label: 'Record of a demised bay', tenure: 'demised' },
  { value: 'lease_right_record', label: 'Record of a lease right', tenure: 'lease_right' },
];
export const BASIS_LABEL = Object.fromEntries(BASES.map(b => [b.value, b.label]));

/** The bases a bay of this tenure can carry. None for "not for allocation". */
export function basesForTenure(tenure) {
  return BASES.filter(b => b.tenure === tenure);
}

export const STATUSES = [
  { value: 'draft',        label: 'Draft' },
  { value: 'active',       label: 'Active' },
  { value: 'notice_given', label: 'Notice given' },
  { value: 'ended',        label: 'Ended' },
  { value: 'terminated',   label: 'Terminated' },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map(s => [s.value, s.label]));

/** Statuses that hold a bay: an offer being drawn up holds it too. */
export const LIVE = new Set(['draft', 'active', 'notice_given']);

/** The lifecycle, one way only — the same table as the trigger. */
export const TRANSITIONS = {
  draft:        ['active', 'terminated'],
  active:       ['notice_given', 'ended', 'terminated'],
  notice_given: ['active', 'ended', 'terminated'],
  ended:        [],
  terminated:   [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export const FEE_PERIODS = ['week', 'month', 'quarter', 'year'];
export const VAT_TREATMENTS = [
  { value: 'not_decided',   label: 'Not decided (ask the accountant)' },
  { value: 'standard',      label: 'Standard-rated' },
  { value: 'exempt',        label: 'Exempt' },
  { value: 'outside_scope', label: 'Outside the scope of VAT' },
];

// Two date ranges overlap, both inclusive, a missing end being open-ended.
function overlaps(aStart, aEnd, bStart, bEnd) {
  return (!bEnd || aStart <= bEnd) && (!aEnd || bStart <= aEnd);
}

/**
 * The problem with an agreement, or null. Mirrors migration 222: the
 * tenure/basis rule, residents only, the dates, the unit on a record, and the
 * no-overlap exclusion.
 * @param {object} a       the agreement being saved
 * @param {object} bay     merged bay (tenure, planning_restricted, bay_id)
 * @param {object} holder  {holder_type}
 * @param {object[]} others every agreement, to check overlap against
 * @param {{allocating?: boolean}} [opts] false when editing an existing
 *   agreement's terms: the tenure and residents-only rules are checked when an
 *   agreement is MADE, as the trigger does, or a bay whose tenure changed
 *   later could never have its old licence edited or ended.
 */
export function validateAgreement(a, bay, holder, others = [], { allocating = true } = {}) {
  const basis = BASES.find(b => b.value === a.basis);
  if (!basis) return 'Choose the basis of the agreement.';
  if (allocating && basis.tenure !== bay.tenure) {
    return bay.tenure === 'licensable'
      ? 'This bay is licensable: choose a licence.'
      : bay.tenure === 'not_for_allocation'
        ? 'This bay is not for allocation.'
        : `This bay is ${bay.tenure === 'demised' ? 'demised to a flat' : 'held under a lease right'}: it can only be recorded, not allocated.`;
  }
  if (!holder) return 'Choose or add a holder.';
  if (allocating && bay.planning_restricted && isExternal(holder.holder_type)) {
    return 'This bay is residents only and cannot go to an external holder.';
  }
  if (!a.starts_on) return 'Enter a start date.';
  if (a.ends_on && a.ends_on < a.starts_on) return 'The end date is before the start date.';
  if ((a.basis === 'demise_record' || a.basis === 'lease_right_record') && blank(a.unit_ref)) {
    return 'Say which flat’s lease this bay belongs to.';
  }
  const clash = (others ?? []).find(o =>
    o.id !== a.id && o.bay_id === bay.bay_id && bay.bay_id && LIVE.has(o.status)
    && overlaps(a.starts_on, a.ends_on || null, o.starts_on, o.ends_on || null));
  if (clash) return `The bay is already held by ${clash.reference} over those dates.`;
  return null;
}

/** The agreement row to write: terms only, blanks as null, numbers as numbers. */
export function agreementRow(a) {
  const num = v => (v === '' || v == null ? null : Number(v));
  const record = a.basis === 'demise_record' || a.basis === 'lease_right_record';
  return {
    basis:          a.basis,
    unit_ref:       record ? String(a.unit_ref ?? '').trim() || null : null,
    starts_on:      a.starts_on,
    ends_on:        a.ends_on || null,
    notice_days:    num(a.notice_days),
    fee_amount:     num(a.fee_amount),
    fee_period:     a.fee_period || null,
    vat_treatment:  a.vat_treatment || 'not_decided',
    deposit_amount: num(a.deposit_amount),
    max_vehicles:   Number(a.max_vehicles) || 1,
    notes:          String(a.notes ?? '').trim() || null,
  };
}

/** Does the agreement cover this ISO date? */
export function covers(a, iso) {
  return a.starts_on <= iso && (!a.ends_on || iso <= a.ends_on);
}

/**
 * The agreement that holds a bay TODAY: active or under notice, covering the
 * date. A draft holds the bay against overlap but does not make it allocated.
 */
export function currentAgreement(bayId, agreements, today) {
  return (agreements ?? []).find(a =>
    a.bay_id === bayId && (a.status === 'active' || a.status === 'notice_given') && covers(a, today)) ?? null;
}

/** Today as YYYY-MM-DD in local time, the date a person means. */
export function todayISO(now = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// ── Vehicles ───────────────────────────────────────────────────────────────

/** "ab12 cde" → "AB12CDE": the stored form, and the searched form. */
export function normaliseReg(s) {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The problem with a vehicle, or null. */
export function validateVehicle(v, agreement, currentVehicles = []) {
  const reg = normaliseReg(v.registration);
  if (!reg) return 'Enter the registration.';
  if (reg.length > 10) return 'That is too long for a registration.';
  const live = currentVehicles.filter(x => x.agreement_id === agreement.id && !x.to_date);
  if (live.some(x => x.registration === reg)) return `${reg} is already on this agreement.`;
  if (live.length >= (agreement.max_vehicles ?? 1)) {
    return `This agreement allows ${agreement.max_vehicles ?? 1} vehicle${(agreement.max_vehicles ?? 1) === 1 ? '' : 's'}. End one first.`;
  }
  return null;
}

/**
 * "Whose car is this?" — every vehicle whose registration contains the
 * search, with its agreement, holder and bay. Current vehicles first.
 */
export function findByRegistration(q, { vehicles, agreements, holders, bays }) {
  const needle = normaliseReg(q);
  if (needle.length < 2) return [];
  const agById = new Map((agreements ?? []).map(a => [a.id, a]));
  const hById = new Map((holders ?? []).map(h => [h.id, h]));
  const bayById = new Map((bays ?? []).filter(b => b.bay_id).map(b => [b.bay_id, b]));
  return (vehicles ?? [])
    .filter(v => v.registration.includes(needle))
    .map(v => {
      const agreement = agById.get(v.agreement_id) ?? null;
      return {
        vehicle: v,
        agreement,
        holder: agreement ? hById.get(agreement.holder_id) ?? null : null,
        bay: agreement ? bayById.get(agreement.bay_id) ?? null : null,
        current: !v.to_date && !!agreement && LIVE.has(agreement.status),
      };
    })
    .sort((a, b) => Number(b.current) - Number(a.current) || a.vehicle.registration.localeCompare(b.vehicle.registration));
}
