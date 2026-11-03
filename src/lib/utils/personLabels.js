// src/lib/utils/personLabels.js
//
// How a portal user is shown when someone CHOOSES them (user, 2026-11-03):
//   · only people with a SHORT NAME are offered (Admin → Users → Edit);
//   · offered as "SP (Stephen Pallett)";
//   · shown as "SP" once chosen.
// Used by Management (attendees, action assignees) and the workflow manager
// (who an item is with, a step's escalation, a Cases "person" field).
// ⛔ Records that leave the building — an item's history, the printable
// record, sign-offs, the audit log — keep the FULL name.
// Pure: imports nothing, so pure modules may use it.

/** @typedef {{ id: string, full_name?: string|null, short_name?: string|null, email?: string|null }} Person */

/** "SP (Stephen Pallett)" — how a person is offered in a picker. @param {Person} p */
export function pickerLabel(p) {
  if (!p) return '';
  if (!p.short_name) return p.full_name ?? '';
  return p.full_name ? `${p.short_name} (${p.full_name})` : p.short_name;
}

/** "SP" — how a chosen person is shown; the full name when none is set. @param {Person|undefined|null} p */
export function shortLabel(p) {
  return p?.short_name || p?.full_name || '';
}

/** The people who may be offered: those with a short name, by short name. @param {Person[]} list */
export function withShortName(list) {
  return (list ?? []).filter((p) => p.short_name)
    .sort((a, b) => String(a.short_name).localeCompare(String(b.short_name)));
}

/** id → "SP" (or the full name when none is set). @param {Person[]} list */
export function shortLabelById(list) {
  return Object.fromEntries((list ?? []).map((p) => [p.id, shortLabel(p)]));
}
