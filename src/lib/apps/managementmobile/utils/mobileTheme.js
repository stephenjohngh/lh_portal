// src/lib/apps/managementmobile/utils/mobileTheme.js
//
// This app's colours for priorities and action statuses — ONE copy (2026-10-02).
// They were written out separately in the issue list, the issue screen and the
// meeting screen. The colours are this app's own (its dark theme, not Tailwind);
// the WORDS are the portal's, from $lib/utils/constants.js (getPriorityLabel,
// getActionStatusLabel), so the phone cannot call a priority something the
// desktop does not.

/** Priority 1–6 → colour. */
export const PRIORITY_COLOR = {
  1: '#ef4444',   // red    — Top Priority
  2: '#f59e0b',   // amber  — Major Project
  3: '#818cf8',   // violet — Important (app accent)
  4: '#64748b',   // slate  — Minor
  5: '#475569',   // dark slate — Admin
  6: '#334155',   // darker slate — Pending
};

/** A priority's colour; an unknown priority shows as Minor's. */
export function priorityColor(p) {
  return PRIORITY_COLOR[p] ?? PRIORITY_COLOR[4];
}

/** Action status → colour. */
export const ACTION_STATUS_COLOR = {
  'in-progress': '#818cf8',
  pending:       '#64748b',
  completed:     '#34d399',
};

/** An action status's colour; an unknown status shows as pending's. */
export function actionStatusColor(s) {
  return ACTION_STATUS_COLOR[s] ?? ACTION_STATUS_COLOR.pending;
}
