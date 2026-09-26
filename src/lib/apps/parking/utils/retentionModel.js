// src/lib/apps/parking/utils/retentionModel.js
// Words for the retention result (migration 226, design §3.2, decision D8).
//
// ⭐ The periods are NOT written here. The database function returns them with
// its counts, and these helpers print what they are given — so the screen can
// never state a period the job does not apply.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The rules, in plain words, from the periods the function returned. */
export function retentionRules(periods) {
  if (!periods) return [];
  const p = periods;
  return [
    `An ended agreement, with its vehicles, access devices, timeline and signed licence documents, is removed ${plural(p.agreement_years, 'year')} after it ended.`,
    'An agreement with a licence document attached waits for an administrator to press Remove now, which deletes the file first; the nightly job cannot reach stored files.',
    `A vehicle is removed ${plural(p.vehicle_months, 'month')} after it came off the agreement, or after the agreement ended. Its registration is blanked in the timeline.`,
    `A returned access device is removed ${plural(p.device_months, 'month')} after it was returned, or after the agreement ended.`,
    '⛔ An access device that was never returned is never removed, and neither is its agreement: it still opens the gate.',
    `A withdrawn or allocated waiting-list application is removed ${plural(p.application_grace_days, 'day')} after it closed.`,
    `A holder left with no agreement and no application is removed ${plural(p.holder_months, 'month')} after their record was last changed.`,
  ];
}

/** What a result removes (or would), as short phrases; empty when nothing. */
export function retentionParts(counts) {
  if (!counts) return [];
  const parts = [];
  if (counts.agreements)   parts.push(plural(counts.agreements, 'ended agreement'));
  if (counts.vehicles)     parts.push(plural(counts.vehicles, 'vehicle'));
  if (counts.devices)      parts.push(plural(counts.devices, 'returned device'));
  if (counts.applications) parts.push(plural(counts.applications, 'closed application'));
  if (counts.holders)      parts.push(plural(counts.holders, 'holder'));
  if (counts.documents_removed) parts.push(plural(counts.documents_removed, 'licence document'));
  return parts;
}

/** One sentence for a result. `due` says whether it is a forecast or done. */
export function retentionSummary(counts, { due = false } = {}) {
  const parts = retentionParts(counts);
  const held = counts?.held_back_device_out
    ? ` ${plural(counts.held_back_device_out, 'agreement')} past ${counts.held_back_device_out === 1 ? 'its' : 'their'} period ${counts.held_back_device_out === 1 ? 'is' : 'are'} kept because a device is still out.`
    : '';
  const docs = counts?.held_back_documents
    ? ` ${plural(counts.held_back_documents, 'agreement')} ${counts.held_back_documents === 1 ? 'is' : 'are'} ${due ? 'also due but waiting' : 'still waiting'} for ${counts.held_back_documents === 1 ? 'its' : 'their'} licence documents to be removed${due ? ': Remove now does that' : ''}.`
    : '';
  const failed = counts?.documents_failed
    ? ` ${plural(counts.documents_failed, 'licence document')} could not be deleted, so ${counts.documents_failed === 1 ? 'its' : 'their'} agreement stays.`
    : '';
  if (!parts.length) return (due ? 'Nothing is due for removal.' : 'Nothing was removed.') + held + docs + failed;
  return `${due ? 'Due for removal' : 'Removed'}: ${parts.join(', ')}.${held}${docs}${failed}`;
}
