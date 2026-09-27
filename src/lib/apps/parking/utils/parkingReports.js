// src/lib/apps/parking/utils/parkingReports.js
// Parking's Excel reports, as pure sheet builders plus one download.
// docs/requirements/unbuilt/Parking_App_Design.md §6 (Reports).
//
// The rows are built HERE from what the screen already holds, and
// /api/generate-xlsx only styles them — the same arrangement as the
// compliance register export, so a workbook cannot disagree with the screen.
//
// ⚠ Three of the four reports name people. A spreadsheet leaves the one place
// the `parking` grant protects, so each of those carries a line in its header
// saying it contains personal data, and the filename says PARKING. That is the
// control this portal has: it cannot follow a file once downloaded.

import { authHeaders } from '$lib/utils/authHeaders';
import { downloadResponse } from '$lib/utils/download.js';
import { fmtGenerated, fmtDate } from '$lib/utils/dates.js';
import { BAY_STATE, TENURE_LABEL } from './bayModel.js';
import {
  STATUS_LABEL, BASIS_LABEL, HOLDER_TYPE_LABEL, VAT_TREATMENTS, LIVE,
  DEVICE_LABEL, outstandingDevices, unreturnedAfterEnd,
} from './agreementModel.js';
import { queue, positionOf, APPLICATION_STATUS_LABEL, ANY_SIZE, OPEN } from './waitingListModel.js';

const PERSONAL = 'Contains personal data about parking holders. Keep it within the parking team and delete it when no longer needed.';

const d = (iso) => (iso ? fmtDate(iso) : '');
const money = (n) => (n == null || n === '' ? '' : Number(n).toFixed(2));
const name = (h) => (h ? (h.company_name ? `${h.company_name} — ${h.display_name}` : h.display_name) : '');
const PER_YEAR = { week: 52, month: 12, quarter: 4, year: 1 };

/** A fee as a yearly figure, for comparing and totalling. Null if not set. */
export function annualFee(a) {
  if (a?.fee_amount == null || !PER_YEAR[a.fee_period]) return null;
  return Math.round(Number(a.fee_amount) * PER_YEAR[a.fee_period] * 100) / 100;
}

/** Every bay: where, what size, its state, how held, and who holds it today. */
export function bayRegisterSheet({ bays = [], holders = [], vehicles = [] }) {
  const hById = new Map(holders.map(h => [h.id, h]));
  return {
    headers: ['Bay', 'Name', 'Size', 'Width (m)', 'Length (m)', 'State', 'Held as', 'Lease of',
      'Accessible', 'Tandem', 'Residents only', 'Out of use because', 'Back in use',
      'Agreement', 'Holder', 'Vehicles', 'Headroom (m)', 'Notes'],
    rows: bays.map(b => [
      b.ref, b.space?.label || b.space?.name || '', b.size ?? 'Not set',
      b.measured ? b.measured.width.toFixed(2) : '', b.measured ? b.measured.length.toFixed(2) : '',
      BAY_STATE[b.state]?.label ?? b.state, TENURE_LABEL[b.tenure] ?? b.tenure, b.unit_ref ?? '',
      b.is_accessible ? 'Yes' : '', b.is_tandem ? 'Yes' : '', b.planning_restricted ? 'Yes' : '',
      b.in_service === false ? (b.out_of_use_reason ?? '') : '', b.in_service === false ? d(b.out_of_use_until) : '',
      // A reserved bay names the draft or later licence holding it.
      (b.current ?? b.reserved)?.reference ?? '', name(hById.get((b.current ?? b.reserved)?.holder_id)),
      vehicles.filter(v => v.agreement_id === b.current?.id && !v.to_date).map(v => v.registration).join(', '),
      b.max_height_m != null ? String(b.max_height_m) : '', b.notes ?? '',
    ]),
  };
}

/**
 * Agreements with their terms and a yearly value. ⚠ An income SCHEDULE — the
 * terms agreed — not a ledger: the money is taken and accounted for elsewhere
 * (design §8, option A).
 */
export function agreementsSheet({ agreements = [], holders = [], bays = [] }, { liveOnly = false } = {}) {
  const hById = new Map(holders.map(h => [h.id, h]));
  const bayRef = (id) => bays.find(b => b.bay_id === id)?.ref ?? '';
  const vat = Object.fromEntries(VAT_TREATMENTS.map(v => [v.value, v.label]));
  const refOf = (id) => agreements.find(x => x.id === id)?.reference ?? 'another agreement';
  const list = agreements.filter(a => !liveOnly || LIVE.has(a.status))
    .sort((a, b) => a.reference.localeCompare(b.reference));
  const rows = list.map(a => [
    a.reference, bayRef(a.bay_id), name(hById.get(a.holder_id)),
    HOLDER_TYPE_LABEL[hById.get(a.holder_id)?.holder_type] ?? '', BASIS_LABEL[a.basis] ?? a.basis,
    STATUS_LABEL[a.status] ?? a.status, d(a.starts_on), a.ends_on ? d(a.ends_on) : 'Rolling',
    a.notice_days != null ? String(a.notice_days) : '', money(a.fee_amount), a.fee_period ?? '',
    annualFee(a) != null ? annualFee(a).toFixed(2) : '', vat[a.vat_treatment] ?? '',
    a.tariff_id ? 'List price' : 'Set by hand',
    // A deposit moved with the holder is not owed back from this agreement.
    money(a.deposit_amount),
    a.deposit_refunded_on ? d(a.deposit_refunded_on) : a.deposit_transferred_to ? `Moved to ${refOf(a.deposit_transferred_to)}` : '',
    a.ended_reason ?? '',
  ]);
  const live = list.filter(a => a.status === 'active' || a.status === 'notice_given');
  const total = live.reduce((t, a) => t + (annualFee(a) ?? 0), 0);
  return {
    headers: ['Reference', 'Bay', 'Holder', 'Kind of holder', 'Basis', 'Status', 'Starts', 'Ends',
      'Notice (days)', 'Fee (£)', 'Per', 'A year (£)', 'VAT', 'Fee source', 'Deposit (£)', 'Deposit refunded', 'Ended because'],
    rows,
    total,
  };
}

/** The waiting list in queue order, open first. */
export function waitingListSheet({ applications = [], holders = [], bays = [] }) {
  const hById = new Map(holders.map(h => [h.id, h]));
  const bayRef = (id) => bays.find(b => b.bay_id === id)?.ref ?? '';
  const offered = applications.filter(a => a.status === 'offered').sort((a, b) => a.joined_on.localeCompare(b.joined_on));
  const closed = applications.filter(a => !OPEN.has(a.status));
  return {
    headers: ['Place', 'Applicant', 'Kind', 'Wants', 'Joined', 'Status', 'Offered bay', 'Offer expires', 'Offers declined'],
    rows: [...offered, ...queue(applications), ...closed].map(a => [
      String(positionOf(a, applications) ?? ''), name(hById.get(a.holder_id)),
      HOLDER_TYPE_LABEL[hById.get(a.holder_id)?.holder_type] ?? '',
      a.wanted_size === ANY_SIZE ? 'Any size' : a.wanted_size, d(a.joined_on),
      APPLICATION_STATUS_LABEL[a.status] ?? a.status, bayRef(a.offered_bay_id), d(a.offer_expires_on),
      String(a.offers_declined ?? 0),
    ]),
  };
}

/** ⛔ Devices still out after their agreement ended — each still opens the gate. */
export function devicesOutSheet({ agreements = [], devices = [], holders = [], bays = [] }) {
  const hById = new Map(holders.map(h => [h.id, h]));
  const bayRef = (id) => bays.find(b => b.bay_id === id)?.ref ?? '';
  const rows = [];
  for (const a of unreturnedAfterEnd(agreements, devices)) {
    for (const dev of outstandingDevices(a.id, devices)) {
      rows.push([DEVICE_LABEL[dev.device_type] ?? dev.device_type, dev.serial, d(dev.issued_on),
        a.reference, bayRef(a.bay_id), name(hById.get(a.holder_id)), STATUS_LABEL[a.status], d(a.ends_on)]);
    }
  }
  return {
    headers: ['Device', 'Serial', 'Issued', 'Agreement', 'Bay', 'Holder', 'Status', 'Ended'],
    rows,
  };
}

export const REPORTS = {
  bays:       { label: 'Bay register',            build: bayRegisterSheet, sheetName: 'Bays',         stem: 'Parking_Bays',         personal: true },
  agreements: { label: 'Agreements and income',   build: agreementsSheet,  sheetName: 'Agreements',   stem: 'Parking_Agreements',   personal: true },
  waiting:    { label: 'Waiting list',            build: waitingListSheet, sheetName: 'Waiting list', stem: 'Parking_Waiting_List', personal: true },
  devices:    { label: 'Devices not returned',    build: devicesOutSheet,  sheetName: 'Devices out',  stem: 'Parking_Devices_Out',  personal: true },
};

/** The header line of a report: what it is, how many rows, and the warning. */
export function reportSummary(key, sheet) {
  const r = REPORTS[key];
  const parts = [`${r.label} — ${sheet.rows.length} row${sheet.rows.length === 1 ? '' : 's'}`];
  if (key === 'agreements') parts.push(`active and under notice: £${sheet.total.toFixed(2)} a year`);
  if (r.personal) parts.push(PERSONAL);
  return parts.join('  ·  ');
}

/** Build a report from the store's state and download it as Excel. */
export async function downloadParkingReport(key, state, { building = 'Lancaster House' } = {}) {
  const r = REPORTS[key];
  if (!r) throw new Error(`No such report: ${key}`);
  const sheet = r.build(state);
  const res = await fetch('/api/generate-xlsx', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      building,
      filterSummary: reportSummary(key, sheet),
      generatedAt: fmtGenerated(),
      detail: { headers: sheet.headers, rows: sheet.rows },
      sheetName: r.sheetName,
      reportTitle: `Parking — ${r.label}`,
      filenameStem: r.stem,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }
  const filename = `${r.stem}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  await downloadResponse(res, filename);
  return { filename, rows: sheet.rows.length };
}
