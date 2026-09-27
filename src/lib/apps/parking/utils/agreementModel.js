// src/lib/apps/parking/utils/agreementModel.js
// Parking, phase 1 — holders, agreements and vehicles, as pure functions.
// docs/requirements/app_designs/Parking_App_Design.md §3, §5.2–5.4.
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
// D4 (user, 2026-09-27): no VAT is charged on parking at present, so that is
// the default for every new agreement and price (migration 228). Change it
// only on the accountant's advice.
export const DEFAULT_VAT = 'not_charged';
export const VAT_TREATMENTS = [
  { value: 'not_charged',   label: 'No VAT charged' },
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
  // Nobody can be given a bay they cannot park in (migration 229). A record of
  // who holds a demised bay is a fact about the lease, and is still allowed.
  if (allocating && bay.in_service === false && basis.tenure === 'licensable') {
    return `${bay.ref ?? 'This bay'} is out of use. Bring it back into use before allocating it.`;
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
    vat_treatment:  a.vat_treatment || DEFAULT_VAT,
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

/**
 * A licence that holds the bay without covering today: a DRAFT (whatever its
 * start date — it holds the bay against overlap until activated or deleted),
 * or an active one that STARTS LATER. The earliest, or null. Only a licence:
 * a demised bay's record is about the lease, and the bay already reads as
 * belonging to a flat.
 */
export function reservingAgreement(bayId, agreements, today) {
  return (agreements ?? [])
    .filter(a => a.bay_id === bayId && (a.basis === 'licence' || a.basis === 'adjustment')
      && (a.status === 'draft'
        || ((a.status === 'active' || a.status === 'notice_given') && a.starts_on > today)))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] ?? null;
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
 * Where a vehicle stands TODAY. `authorised` only when the vehicle is on an
 * active agreement (or one under notice) that covers today, and the vehicle's
 * own dates do too. A draft, or an agreement or vehicle that starts later, is
 * `pending` — not yet allowed to park, which is what the old "authorised"
 * claimed. Everything else is `ended`.
 * @returns {'authorised'|'pending'|'ended'}
 */
export function vehicleStanding(v, agreement, today) {
  if (!agreement) return 'ended';
  if (v.to_date && v.to_date < today) return 'ended';
  if (agreement.status === 'draft') return 'pending';
  if (agreement.status !== 'active' && agreement.status !== 'notice_given') return 'ended';
  if (agreement.ends_on && agreement.ends_on < today) return 'ended';
  if (agreement.starts_on > today || (v.from_date && v.from_date > today)) return 'pending';
  return 'authorised';
}

const STANDING_ORDER = { authorised: 0, pending: 1, ended: 2 };

/**
 * "Whose car is this?" — every vehicle whose registration contains the
 * search, with its agreement, holder and bay, and where it stands today.
 * Authorised first.
 */
export function findByRegistration(q, { vehicles, agreements, holders, bays }, today = todayISO()) {
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
        standing: vehicleStanding(v, agreement, today),
      };
    })
    .sort((a, b) => STANDING_ORDER[a.standing] - STANDING_ORDER[b.standing]
      || a.vehicle.registration.localeCompare(b.vehicle.registration));
}

/**
 * The problem with ending or terminating an agreement on a date, or null.
 * Checked BEFORE anything is written: ending stops each current vehicle on the
 * same date, and a vehicle whose authorisation starts after that date cannot
 * be given an end before its start — which used to fail half way, with the
 * agreement already ended and the vehicles not.
 */
export function endingProblem(agreement, endDate, vehicles = []) {
  if (!endDate) return 'Enter the date it ended.';
  if (endDate < agreement.starts_on) return 'The end date is before the start date.';
  const later = vehicles.filter(v => v.agreement_id === agreement.id && !v.to_date
    && v.from_date && v.from_date > endDate);
  if (later.length) {
    return `${later.map(v => v.registration).join(', ')} ${later.length === 1 ? 'is' : 'are'} only authorised from `
      + `${later.map(v => v.from_date).sort()[0]}, after that end date. Remove ${later.length === 1 ? 'it' : 'them'} `
      + 'from the agreement first, or choose a later end date.';
  }
  return null;
}

// ── Notice (P2) ────────────────────────────────────────────────────────────

/** Add days to a YYYY-MM-DD date, in UTC so no clock change moves it. */
export function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

/**
 * The end date notice produces: served date plus the notice period, unless
 * the agreement already ends sooner. Null when there is no notice period to
 * count from — then the person must say when it ends.
 */
export function noticeEndDate(agreement, servedOn) {
  if (!servedOn || agreement?.notice_days == null) return null;
  const byNotice = addDaysISO(servedOn, agreement.notice_days);
  return agreement.ends_on && agreement.ends_on < byNotice ? agreement.ends_on : byNotice;
}

/** The problem with serving notice, or null. Mirrors migration 223. */
export function validateNotice(agreement, { served_on, served_by, ends_on }) {
  if (agreement?.status !== 'active') return 'Notice can only be served on an active agreement.';
  if (!served_on) return 'Enter the date notice was served.';
  if (served_by !== 'licensor' && served_by !== 'holder') return 'Say who served notice.';
  if (!ends_on) return 'Enter the date the agreement ends under the notice.';
  if (served_on < agreement.starts_on) return 'Notice cannot be served before the agreement started.';
  if (ends_on < served_on) return 'The agreement cannot end before notice was served.';
  return null;
}

// ── Access devices (P2) ────────────────────────────────────────────────────

export const DEVICE_TYPES = [
  { value: 'fob',    label: 'Fob' },
  { value: 'remote', label: 'Gate remote' },
  { value: 'card',   label: 'Card' },
  { value: 'key',    label: 'Key' },
];
export const DEVICE_LABEL = Object.fromEntries(DEVICE_TYPES.map(d => [d.value, d.label]));

const serialKey = (type, serial) => `${type}|${String(serial ?? '').trim().toUpperCase()}`;

/**
 * The problem with issuing a device, or null. ⛔ The same serial cannot be
 * out twice: an unreturned device still opens the gate. Mirrors the
 * live-serial index in migration 223, and names who holds it.
 */
export function validateDevice(dev, devices = [], agreements = []) {
  if (!DEVICE_TYPES.some(t => t.value === dev.device_type)) return 'Choose the kind of device.';
  if (!String(dev.serial ?? '').trim()) return 'Enter its serial or number.';
  const key = serialKey(dev.device_type, dev.serial);
  const out = devices.find(d => !d.returned_on && serialKey(d.device_type, d.serial) === key);
  if (out) {
    const ref = agreements.find(a => a.id === out.agreement_id)?.reference ?? 'another agreement';
    return `That ${DEVICE_LABEL[dev.device_type].toLowerCase()} is still out, on ${ref}. Record it returned first.`;
  }
  return null;
}

/** Devices on an agreement that have not come back. */
export function outstandingDevices(agreementId, devices = []) {
  return devices.filter(d => d.agreement_id === agreementId && !d.returned_on);
}

/**
 * Whether the deposit can be marked refunded, and if not, why. ⛔ Not while a
 * device it secures is still out — mirrors the trigger.
 */
export function depositRefundProblem(agreement, devices = [], agreements = []) {
  if (!agreement?.deposit_amount) return 'There is no deposit on this agreement.';
  if (agreement.deposit_refunded_on) return 'The deposit has already been refunded.';
  // A move carries the deposit to the new agreement (migration 229).
  if (agreement.deposit_transferred_to) {
    const to = agreements.find(a => a.id === agreement.deposit_transferred_to)?.reference ?? 'the new agreement';
    return `The deposit moved to ${to} with the holder; refund it from there.`;
  }
  const out = outstandingDevices(agreement.id, devices);
  if (out.length) return `${out.length} device${out.length === 1 ? ' has' : 's have'} not been returned.`;
  return null;
}

/**
 * Ended or terminated agreements with a device still out — a security issue,
 * not only a lost deposit, because the device still opens the gate.
 */
export function unreturnedAfterEnd(agreements = [], devices = []) {
  return agreements.filter(a =>
    (a.status === 'ended' || a.status === 'terminated') && outstandingDevices(a.id, devices).length > 0);
}

// ── Moving to another bay (P2) ─────────────────────────────────────────────

/**
 * The problem with moving an agreement to another bay on a date, or null.
 * Mirrors parking_move_to_bay in migration 223, which does the move in one
 * transaction: the old agreement ends the day before, a new one starts on the
 * new bay with the same holder and terms, and vehicles and devices go across.
 */
export function validateMove(agreement, newBay, onDate, holder, agreements = [], applications = []) {
  if (agreement?.status !== 'active') return 'Only an active agreement can be moved to another bay.';
  if (agreement.basis !== 'licence' && agreement.basis !== 'adjustment') {
    return 'Only a licence can be moved; a demised bay belongs to its flat.';
  }
  if (!newBay) return 'Choose the bay to move to.';
  if (newBay.bay_id && newBay.bay_id === agreement.bay_id) return 'That is the same bay.';
  if (!onDate) return 'Enter the date of the move.';
  if (onDate <= agreement.starts_on) return 'The move must be after the agreement started.';
  if (agreement.ends_on && onDate > agreement.ends_on) return 'The agreement ends before that date.';
  if (newBay.in_service === false) return `${newBay.ref} is out of use.`;
  // A bay under offer is held for the person offered it (migration 229).
  const offer = (applications ?? []).find(a => a.status === 'offered' && newBay.bay_id
    && a.offered_bay_id === newBay.bay_id && a.holder_id !== agreement.holder_id);
  if (offer) return `${newBay.ref} is under offer to someone on the waiting list.`;
  return validateAgreement({ ...agreement, id: undefined, starts_on: onDate }, newBay, holder, agreements);
}

// ── The timeline (P2) ─────────────────────────────────────────────────────

/** What each timeline entry says, in words. */
export const EVENT_LABEL = {
  created:          'Agreement drawn up',
  activated:        'Activated',
  notice_served:    'Notice served',
  notice_withdrawn: 'Notice withdrawn',
  ended:            'Ended',
  terminated:       'Terminated',
  terms_changed:    'Terms changed',
  deposit_refunded: 'Deposit refunded',
  vehicle_added:    'Vehicle added',
  vehicle_removed:  'Vehicle no longer authorised',
  device_issued:    'Device issued',
  device_returned:  'Device returned',
  bay_out_of_use:   'Bay out of use',
  bay_back_in_use:  'Bay back in use',
  deposit_transferred: 'Deposit transferred',
  // Waiting-list entries that name this bay (migration 224, 229).
  application_joined:    'Joined the waiting list',
  offer_made:            'Bay offered from the waiting list',
  offer_accepted:        'Offer accepted',
  offer_declined:        'Offer declined',
  offer_lapsed:          'Offer lapsed',
  offer_returned:        'Offer returned to the queue',
  offer_reopened:        'Offer reopened (its draft was deleted)',
  application_withdrawn: 'Application withdrawn',
};

/** One line of detail for a timeline entry. */
export function eventSummary(e) {
  const d = e.detail ?? {};
  switch (e.event_type) {
    case 'notice_served':    return `by the ${d.notice_served_by ?? '?'} on ${d.notice_served_on ?? '?'}, ending ${d.ends_on ?? '?'}`;
    case 'ended':
    case 'terminated':       return [d.ends_on && `on ${d.ends_on}`, d.ended_reason].filter(Boolean).join(' — ');
    case 'vehicle_added':    return d.registration ?? '';
    case 'vehicle_removed':  return `${d.registration ?? ''} from ${d.on ?? '?'}`;
    case 'device_issued':
    case 'device_returned':  return `${DEVICE_LABEL[d.type] ?? d.type} ${d.serial ?? ''}`;
    case 'deposit_refunded': return d.amount != null ? `£${Number(d.amount).toFixed(2)}` : '';
    case 'deposit_transferred': return [d.amount != null && `£${Number(d.amount).toFixed(2)}`, d.to && `to ${d.to}`].filter(Boolean).join(' ');
    case 'offer_made':
    case 'offer_reopened':   return d.expires_on ? `open until ${d.expires_on}` : '';
    case 'terms_changed':    return Object.entries(d).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v?.from ?? '—'} → ${v?.to ?? '—'}`).join(' · ');
    case 'bay_out_of_use':   return [d.reason, d.until && `until ${d.until}`].filter(Boolean).join(' — ');
    default:                 return '';
  }
}
