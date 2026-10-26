// src/lib/apps/complaints/utils/complaintActions.js
// Words and the one rule for a complaint's follow-up actions. Pure.

const LABEL = { open: 'Open', in_progress: 'In progress', complete: 'Done' };

/** Never blank at a render site. */
export const actionStatusLabel = (status) => LABEL[status] ?? (status || 'Open');

/** Past its target date and not done. `todayISO` is a London calendar date. */
export function isActionOverdue(action, todayISO) {
  return Boolean(action?.target_date) && action.status !== 'complete' && action.target_date < todayISO;
}
