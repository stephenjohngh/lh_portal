// src/lib/apps/maintenance/utils/maintenanceHelpers.js
// Pure helpers for RAG status, display labels, and date arithmetic.

import { DUE_SOON_DAYS, dueBandOf } from '../../../utils/dueWindows.js';
import { daysUntil } from '../../../utils/dates.js';

// -- RAG / status --------------------------------------------------------------

/**
 * Compute RAG status for a job based on scheduled_date (or hard_expiry_date) and status.
 * If hard_expiry_date is set and is earlier than scheduled_date, it is used for the
 * overdue / due-soon calculation (regulatory / insurance deadlines take priority).
 * Returns: 'overdue' | 'due_soon' | 'in_progress' | 'scheduled' | 'completed' | 'cancelled'
 */
export function jobRag(job) {
  if (job.status === 'completed')   return 'completed';
  if (job.status === 'cancelled')   return 'cancelled';
  if (job.status === 'in_progress') return 'in_progress';
  // Effective due date: use the earlier of scheduled_date and hard_expiry_date (when set).
  // Calendar days in London (dates.js) — it used to count from LOCAL midnight.
  const scheduled = job.scheduled_date;
  const hard      = job.hard_expiry_date;
  const due       = (hard && hard < scheduled) ? hard : scheduled;

  const band = dueBandOf(due, DUE_SOON_DAYS.maintenanceJob);
  if (band === 'overdue')  return 'overdue';
  if (band === 'due_soon') return 'due_soon';
  return 'scheduled';
}

/** Style config for each RAG state. */
export function ragConfig(rag) {
  const cfg = {
    overdue:     { label: 'Overdue',     dot: 'bg-red-500',    badge: 'bg-red-900/40 text-red-300 border border-red-800/50',       row: 'border-red-800/20 bg-red-900/5'     },
    due_soon:    { label: 'Due Soon',    dot: 'bg-amber-400',  badge: 'bg-amber-900/40 text-amber-300 border border-amber-800/50', row: 'border-amber-800/20 bg-amber-900/5' },
    in_progress: { label: 'In Progress', dot: 'bg-blue-400',   badge: 'bg-blue-900/40 text-blue-300 border border-blue-800/50',   row: 'border-blue-800/20 bg-blue-900/5'   },
    scheduled:   { label: 'Scheduled',   dot: 'bg-green-500',  badge: 'bg-green-900/40 text-green-300 border border-green-800/50', row: 'border-slate-700/40 bg-transparent' },
    completed:   { label: 'Completed',   dot: 'bg-slate-400',  badge: 'bg-slate-700 text-slate-400 border border-slate-600',       row: 'border-slate-700/20 bg-transparent' },
    cancelled:   { label: 'Cancelled',   dot: 'bg-slate-600',  badge: 'bg-slate-800 text-slate-500 border border-slate-700',       row: 'border-slate-700/20 bg-transparent' },
  };
  return cfg[rag] ?? cfg.scheduled;
}

/** Style config for job result. */
export function resultConfig(result) {
  const cfg = {
    pass:    { label: 'Pass',    badge: 'bg-green-900/40 text-green-300 border border-green-800/50'  },
    fail:    { label: 'Fail',    badge: 'bg-red-900/40 text-red-300 border border-red-800/50'        },
    partial: { label: 'Partial', badge: 'bg-amber-900/40 text-amber-300 border border-amber-800/50' },
    n_a:     { label: 'N/A',     badge: 'bg-slate-700 text-slate-400 border border-slate-600'        },
  };
  return cfg[result] ?? null;
}

// -- Labels -------------------------------------------------------------------

export function frequencyLabel(days) {
  const map = {
    30: 'Monthly',    31: 'Monthly',
    60: '2-Monthly',
    90: 'Quarterly',  91: 'Quarterly',
    180: '6-Monthly', 182: '6-Monthly', 183: '6-Monthly',
    365: 'Annual',    366: 'Annual',
    730: '2-Yearly',
    1825: '5-Yearly',
  };
  return map[days] ?? `Every ${days} days`;
}

export function scopeTypeLabel(t) {
  return { building: 'Building', system: 'System', type: 'Type', component: 'Component' }[t] ?? t;
}

export function docTypeLabel(t) {
  return { certificate: 'Certificate', report: 'Report', photo: 'Photo', invoice: 'Invoice', other: 'Other' }[t] ?? t;
}

export function docTypeIcon(t) {
  return { certificate: '🏅', report: '📄', photo: '🖼', invoice: '🧾', other: '📎' }[t] ?? '📎';
}

// -- Date helpers -------------------------------------------------------------

/** Human-readable relative date string. */
export function daysRelative(dateStr) {
  const diff  = daysUntil(dateStr);
  if (diff < -1)  return `${Math.abs(diff)} days overdue`;
  if (diff === -1) return '1 day overdue';
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due in ${diff} days`;
}

// Date helpers — single source of truth lives in $lib/utils/dates.js.
// Re-exported here so existing maintenance code keeps working.
export { addDays, addDaysISO, toDateString, today } from '$lib/utils/dates';

/** Format bytes as human-readable string. */
export function fmtBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Is an expiry date past or within N days? */
export function expiryRag(dateStr, warningDays = DUE_SOON_DAYS.certificateExpiry) {
  if (!dateStr) return null;
  const band = dueBandOf(dateStr, warningDays);
  if (band === 'overdue')  return 'expired';
  if (band === 'due_soon') return 'expiring';
  return 'valid';
}

// -- Certificate expiry (Maintenance review, M5) -------------------------------
//
// Expiry was recorded and badged on the Documents tab, and fed nothing: a lift
// examination report expiring in ten days was invisible everywhere a person
// actually looks for work. These two make it visible on the Due work tab and the stats bar.
//
// ⚠ Read-only, and that is a DECISION, not a stopping point (2026-09-11).
// An expiring certificate does NOT move a job's due date: `expiry_date` and
// `maintenance_jobs.hard_expiry_date` stay separate and both are shown.
// Arbitrating between them would silently re-date work a person scheduled, and
// a certificate filed against the wrong job would move the wrong date. Same
// rule as the capital plan's R0 — derivation assists, the person decides.
// Do not "finish" this by wiring expiry into the scheduler.

/**
 * Certificates that are expired or expiring, soonest first.
 *
 * @param {Array<{expiry_date?: string|null}>} docs
 * @param {{ warningDays?: number }} [opts]
 * @returns {Array<object & { expiryState: 'expired'|'expiring' }>}
 */
export function expiringCertificates(docs, opts = {}) {
  const warningDays = opts.warningDays ?? DUE_SOON_DAYS.certificateExpiry;
  return (docs ?? [])
    .filter(d => d?.expiry_date)
    .map(d => ({ ...d, expiryState: expiryRag(d.expiry_date, warningDays) }))
    .filter(d => d.expiryState === 'expired' || d.expiryState === 'expiring')
    .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));
}

/**
 * The one-line position on certificate expiry.
 *
 * `tracked` is the count of documents that carry an expiry date at all, and it
 * is the reason this returns a summary rather than a number. **Zero expiring
 * out of zero tracked is not good news** — it means no certificate in the
 * building has an expiry date recorded, which should never render like a clean
 * bill of health. The caller is expected to say "none held" rather than "0".
 *
 * @param {Array<{expiry_date?: string|null}>} docs
 * @param {{ warningDays?: number }} [opts]
 */
export function certificateExpirySummary(docs, opts = {}) {
  const flagged = expiringCertificates(docs, opts);
  const expired  = flagged.filter(d => d.expiryState === 'expired').length;
  const expiring = flagged.length - expired;
  const tracked  = (docs ?? []).filter(d => d?.expiry_date).length;
  return { tracked, expired, expiring, attention: flagged.length, flagged };
}
